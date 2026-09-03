# Site-Level Maximum Concurrency Design

**Date:** 2026-08-29
**Status:** Approved architecture, pending written-spec review
**Repository:** `yswlww/metapi-evolution`
**Upstream reference:** `cita-777/metapi` PR #609, reimplemented independently

## 1. Purpose

Add a configurable, process-local maximum concurrency boundary per upstream site for user proxy traffic. The boundary must absorb small bursts through a finite FIFO queue, reject overload deterministically, hold leases for the full streaming response lifetime, and integrate with the existing endpoint pool and channel coordinator without creating a parallel routing or topology subsystem.

## 2. Goals

1. Add `sites.max_concurrency` with `0`/`NULL` meaning unlimited.
2. Limit concurrent external proxy operations per site across channels and endpoint fallbacks.
3. Queue a bounded number of requests per site for a bounded time.
4. Return deterministic HTTP `503` plus `Retry-After` for queue-full and timeout outcomes.
5. Release leases exactly once on normal completion, error, cancellation, timeout, or client disconnect.
6. Re-evaluate the latest site limit when draining queued requests.
7. Prevent same-site retry amplification after concurrency rejection.
8. Leave internal model discovery, pricing, account, check-in, balance, and recovery jobs outside the site proxy cap.
9. Preserve evolution's existing route topology owner, automatic channel identity, migrations 0027/0028, and endpoint-pool behavior.

## 3. Non-Goals

- No adoption of upstream PR #609's full branch, routeChannelService, migration numbering, PDF, or changelog artifacts.
- No rerank endpoint in this slice.
- No channel-failure-isolation redesign in this slice.
- No route-priority/topology rewrite in this slice.
- No Redis/database/distributed lease store.
- No cross-instance global concurrency guarantee.
- No preemption of requests already running when a limit is lowered.
- No limit on admin/internal background operations.

## 4. Data Model

Add migration:

```text
drizzle/0029_site_max_concurrency.sql
```

Add nullable integer field:

```text
sites.max_concurrency
```

Semantics:

- `NULL` or `0`: unlimited;
- positive integer: maximum concurrently active external proxy requests for the site;
- accepted API range: `0..10000`;
- negative, non-integer, non-finite, and values above 10000 are rejected.

Synchronize:

- SQLite schema;
- generated MySQL bootstrap schema;
- generated PostgreSQL bootstrap schema;
- Drizzle snapshot/journal artifacts;
- schema contract/parity artifacts;
- backup export/import;
- site API contracts and payload normalization;
- web API/site form types.

Migrations `0027` and `0028` remain unchanged.

## 5. Configuration

Add environment-backed process defaults:

```text
PROXY_SITE_CONCURRENCY_QUEUE_LIMIT=100
PROXY_SITE_CONCURRENCY_QUEUE_WAIT_MS=1500
PROXY_SITE_CONCURRENCY_LEASE_TTL_MS=90000
PROXY_SITE_CONCURRENCY_LEASE_KEEPALIVE_MS=15000
```

Normalization:

- queue limit: integer `0..10000`; `0` means fail-fast when active limit is full;
- queue wait: integer `0..600000` ms;
- lease TTL: integer at least 5000 ms;
- keepalive: integer at least 1000 ms and strictly below lease TTL;
- invalid values use defaults.

These settings control queue/lifecycle behavior globally; `max_concurrency` remains per-site.

## 6. Architecture

### 6.1 Existing-owner extension

Extend the existing process-local proxy coordination owner rather than creating a second semaphore system.

The coordinator owns, per site ID:

- current configured limit;
- active lease count/lease records;
- FIFO waiter queue;
- queue cancellation/deadline state;
- drain scheduling;
- TTL/keepalive cleanup.

It does not own route topology, endpoint selection, or provider retry policy.

### 6.2 Explicit proxy-only wrapper

Add an explicit wrapper around the existing endpoint pool, conceptually:

```ts
runWithProxySiteApiEndpointPool(site, operation, options)
```

The wrapper:

1. resolves/updates the site's current normalized limit;
2. acquires one site lease when the limit is enabled;
3. delegates to the existing `runWithSiteApiEndpointPool`;
4. keeps one lease across all alternate-endpoint attempts for that request;
5. transfers release ownership to a response-body wrapper when a streaming body escapes;
6. releases immediately for bodyless/materialized results;
7. releases exactly once on every terminal path.

Internal callers continue using `runWithSiteApiEndpointPool` directly and therefore do not consume site proxy leases.

### 6.3 Covered proxy surfaces

All user-facing upstream proxy traffic must use the explicit proxy wrapper or an equivalent shared surface boundary, including:

- Chat Completions;
- OpenAI Responses;
- Claude Messages compatibility;
- Gemini native/compatibility;
- Completions;
- Embeddings;
- Images generation/edit;
- Search;
- Video proxy routes;
- future rerank only when implemented separately.

The implementation plan must inventory every current caller and prove coverage with concrete tests. A route must not independently implement its own site semaphore.

### 6.4 Excluded internal flows

These continue using the existing non-limited pool/direct service boundary:

- model discovery and availability refresh;
- model pricing/catalog refresh;
- account verification;
- check-in and balance refresh;
- OAuth/session refresh;
- site health/recovery/model probes;
- admin/test operations unless explicitly exercising the proxy path.

## 7. Admission and Queue Semantics

### 7.1 Unlimited sites

If normalized `maxConcurrency <= 0`, return a no-op lease and do not create queue state.

### 7.2 Immediate admission

If `active < currentLimit`, create and return a lease immediately.

### 7.3 Bounded FIFO wait

If the site is full:

1. if `queueLimit === 0` or queue length is already at the cap, reject immediately;
2. otherwise append one FIFO waiter containing only request identity, deadline, abort signal, and resolution hooks;
3. do **not** snapshot `maxConcurrency` into the waiter;
4. on drain, consult the coordinator's latest limit;
5. if deadline expires, remove/reject the waiter;
6. if the request aborts, remove/reject the waiter without consuming a lease.

### 7.4 Dynamic limit changes

The coordinator exposes a limit update operation used by:

- site acquisition on every request, based on the current DB row;
- successful site API create/update operations when the process already knows the change.

Behavior:

- increase: update the limit and immediately drain FIFO waiters;
- decrease: do not cancel active requests; grant no new leases until `active < newLimit`;
- set to 0/NULL: mark unlimited and release all queued waiters immediately as no-op/admitted requests;
- queued waiters never retain stale limits.

## 8. Error Contract

Define a typed `SiteConcurrencyLimitError` with:

```text
code: site_concurrency_limit
reason: queue_full | wait_timeout | aborted
statusCode: 503
retryAfterMs
siteId
```

HTTP response for queue full/timeout:

```json
{
  "error": {
    "type": "site_concurrency_limit",
    "message": "Site concurrency limit reached"
  }
}
```

- status: `503 Service Unavailable`;
- `Retry-After`: `max(1, ceil(PROXY_SITE_CONCURRENCY_QUEUE_WAIT_MS / 1000))` seconds;
- request aborts do not attempt a new response after the downstream client has disconnected.

Concurrency saturation is an admission outcome, not a provider/channel/endpoint failure:

- do not call channel `recordFailure`;
- do not add channel cooldown;
- do not record endpoint failure;
- do not report token expiry;
- do not retry another channel from the same site after queue-full/timeout.

A future different-site retry policy is outside this slice; current behavior returns 503 after the single bounded admission attempt.

## 9. Lease Lifecycle

### 9.1 Exactly-once release

Each lease has an idempotent release function/state transition. All terminal paths call it, but only the first call changes coordinator state.

### 9.2 Non-streaming results

Release when the endpoint operation and all response materialization/accounting required by the surface are complete.

### 9.3 Streaming results

When an operation returns a response/body stream that outlives the callback, wrap the stream so release occurs on:

- normal EOF/close;
- consumer cancellation;
- upstream error;
- transform error;
- first-byte timeout;
- idle/lease timeout;
- downstream client disconnect/abort.

The wrapper must preserve backpressure and original chunks/errors. It must not read the whole stream eagerly.

### 9.4 TTL and keepalive

- Active leases have a TTL safety net for abandoned paths.
- Streaming progress/active consumption refreshes the lease at `keepaliveMs` cadence, not once per chunk.
- TTL expiry releases once and logs a bounded diagnostic; it does not mark the provider failed.
- Timers/listeners are cleared on normal release.

## 10. Endpoint and Channel Retry Interaction

- Acquire one site lease outside the endpoint candidate loop.
- Endpoint fallback within the same site reuses the lease.
- Actual network/provider endpoint failures retain current endpoint fallback behavior.
- Concurrency queue-full/timeout occurs before endpoint operation and must not enter endpoint failure rotation.
- Surface/channel retry classifiers recognize `SiteConcurrencyLimitError` as non-retryable in this slice.
- No repeated `queueWaitMs` delay for multiple channels belonging to the same saturated site.

## 11. API, Backup, and UI

### 11.1 API

Site create/update responses and payloads include `maxConcurrency`.

Normalization:

- omitted: preserve existing value on update;
- `null`, empty, or `0`: persist `NULL` (unlimited);
- positive integer: persist;
- invalid: deterministic 400 validation response.

Routes remain adapters; persistence/validation logic belongs in existing site service/contract layers.

### 11.2 Backup

Export/import `maxConcurrency` without altering other site fields. Older backups that omit the field default to `NULL` (unlimited). An explicitly present invalid value fails deterministic backup validation; it is never silently converted into a negative or unbounded queue value.

### 11.3 Web UI

Add a Sites form field:

- label: site maximum concurrency;
- numeric input `0..10000`;
- helper: `0` means unlimited and limit is per Metapi process;
- edit/create/backup flows preserve the value;
- mobile layout uses existing responsive form grid.

No new dashboard/metrics screen in this slice.

## 12. Observability

Add bounded structured diagnostics for:

- immediate admission (debug/trace only);
- queued request count and wait duration;
- queue-full/timeout rejection;
- lease TTL expiry;
- dynamic limit updates.

Never log credentials, request bodies, model prompts, or full URLs containing secrets. Do not emit one noisy program event per normal lease operation.

## 13. Test Strategy

All production behavior follows RED -> GREEN TDD.

### 13.1 Schema/contracts

- migration 0029 applies;
- SQLite/MySQL/Postgres parity;
- generated artifacts and drift clean;
- create/update validation boundaries;
- backup round-trip and legacy backup default.

### 13.2 Coordinator

- unlimited sites;
- immediate grants;
- independent sites;
- FIFO order;
- queue cap immediate 503;
- timeout 503 and Retry-After;
- abort removes waiter;
- exactly-once release;
- TTL release;
- keepalive;
- dynamic 10→1 and 1→10;
- 0/unlimited releases queued waiters;
- queued waiters use latest limit;
- no memory/timer/listener residue after release/reset.

### 13.3 Endpoint pool and streaming

- one lease across endpoint retries;
- release after non-stream success/error;
- stream EOF/cancel/error/disconnect release;
- first-byte/idle timeout release;
- backpressure/chunk propagation unchanged;
- concurrency errors do not record endpoint/channel failure;
- no same-site channel retry amplification.

### 13.4 Surface integration

At minimum:

- Chat streaming;
- Responses streaming;
- Gemini;
- one raw JSON route such as embeddings/images;
- multi-channel same-site saturation;
- independent different-site request proceeds;
- internal model/pricing/probe requests remain unaffected.

### 13.5 UI

- create/edit value;
- 0 unlimited helper;
- invalid boundaries;
- mobile form layout;
- API payload/restore.

### 13.6 Complete verification

- focused Vitest suites;
- full `npm test`;
- all TypeScript typechecks;
- schema unit/parity/upgrade/runtime tests;
- repository drift check;
- web/server/desktop production build;
- `git diff --check`;
- independent task and whole-branch review.

## 14. Rollback

The migration is additive. Rollback behavior:

1. setting all `max_concurrency` values to `0`/`NULL` disables enforcement immediately;
2. configuration can set queue limit/wait to zero for fail-fast or operational isolation;
3. the column may remain inert if code is rolled back; no destructive migration is required;
4. if stream wrapping causes regressions, proxy callers can temporarily return to the existing non-limited pool while the DB field remains unused;
5. no route topology or channel identity data is changed.

## 15. Security and Operational Constraints

- Queue length is always bounded.
- Abort/timeouts always remove waiters.
- Site limits and queues are process-local and documented as such.
- No credentials or payloads in logs/errors.
- No hidden direct-merge dependency on upstream #609.
- No migration number reuse.
- No user traffic is silently queued without a finite deadline.
- Concurrency rejection cannot poison channel/endpoint health.

## 16. Success Criteria

1. Site `maxConcurrency` persists and round-trips across all supported database/backup paths.
2. Concurrent external proxy operations never exceed the current per-process site limit except already-active requests during a downward limit change.
3. Queue memory is bounded and FIFO waiters honor latest limits, timeout, and abort.
4. Streams release leases exactly once under every terminal path.
5. Queue saturation returns one deterministic 503 without same-site retry amplification or failure bookkeeping.
6. Internal background operations remain unaffected.
7. All schema, focused, full, typecheck, drift, build, and review gates pass.
