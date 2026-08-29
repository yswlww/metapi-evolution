# Site-Level Maximum Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, process-local per-site concurrency limit for external proxy traffic, including finite FIFO waiting, deterministic 503 overload responses, and exactly-once streaming lease release.

**Architecture:** Extend `proxyChannelCoordinator` with site lease/queue ownership, then add an explicit proxy-only wrapper around the existing site endpoint pool. Proxy callers transfer a lease to an upstream `Response` before it escapes; internal model/pricing/account/probe callers remain on the existing non-limited pool. Site limits persist through migration 0029, API/backup/UI flows, and are re-read from the database at request admission.

**Tech Stack:** TypeScript 6, Fastify 5, Drizzle ORM, SQLite/MySQL/PostgreSQL generated schema artifacts, Undici/Web Streams, React 18, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-08-29-site-max-concurrency-design.md`

## Global Constraints

- Add migration `0029_site_max_concurrency`; never modify or reuse migrations `0027` or `0028`.
- Persist `sites.max_concurrency` as nullable integer; `NULL`/API `0` means unlimited, valid positive range is `1..10000`.
- Default process settings are `PROXY_SITE_CONCURRENCY_QUEUE_LIMIT=100`, `PROXY_SITE_CONCURRENCY_QUEUE_WAIT_MS=1500`, `PROXY_SITE_CONCURRENCY_LEASE_TTL_MS=90000`, and `PROXY_SITE_CONCURRENCY_LEASE_KEEPALIVE_MS=15000`.
- Queue is per-site, FIFO, capacity-bounded, abort-aware, and deadline-bounded; waiters always use the latest limit.
- Queue full and wait timeout return HTTP 503 with `{ "error": { "type": "site_concurrency_limit", "message": "Site concurrency limit reached" } }` and `Retry-After: max(1, ceil(queueWaitMs / 1000))`.
- Site concurrency is an admission outcome: never record channel/endpoint failure, cooldown, token expiry, or proxy-all-failed, and never repeat same-site channel retries.
- One site lease spans every alternate-endpoint attempt for one proxy request.
- Streaming release is exactly once on EOF, cancellation, upstream/transform error, timeout, or downstream disconnect; wrappers preserve chunks, errors, and backpressure.
- Limit only external user proxy traffic. Model discovery, pricing, account verification, check-in, balance, OAuth refresh, and recovery probes remain outside the site cap.
- User-triggered Gemini model listing is capped only when it performs an upstream request; locally synthesized lists and internal discovery are not capped.
- Limits are process-local; do not add Redis/database distributed leases.
- Do not add rerank, channel-failure isolation, route priority, route topology, or a parallel `routeChannelService` in this plan.
- Production changes use strict RED -> GREEN TDD. Commit every independently green task with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File and Interface Map

### New focused units

- `src/shared/siteMaxConcurrency.js` — pure canonical input normalization shared by server and web.
- `src/shared/siteMaxConcurrency.d.ts` — exact JavaScript module types.
- `src/shared/siteMaxConcurrency.test.ts` — normalization contract.
- `drizzle/0029_site_max_concurrency.sql` — additive schema migration.
- `src/server/routes/proxy/siteConcurrencyBoundary.ts` — Fastify request abort signal and deterministic 503 response helper.
- `src/server/routes/proxy/siteConcurrencyBoundary.test.ts` — HTTP/error/abort boundary tests.
- `src/server/services/siteConcurrencyResponse.ts` — explicit response-body lease transfer and stream lifecycle wrapper.
- `src/server/services/siteConcurrencyResponse.test.ts` — EOF/cancel/error/abort/TTL stream release tests.

### Existing owners to extend

- `src/server/services/proxyChannelCoordinator.ts` — process-local site queue/lease state.
- `src/server/services/siteApiEndpointService.ts` — request-time DB limit lookup and proxy-only endpoint-pool wrapper.
- `src/server/contracts/siteRoutePayloads.ts` and `src/server/routes/api/sites.ts` — API field parsing/persistence and dynamic coordinator update.
- `src/server/services/backupService.ts` — backup import/export validation.
- `src/web/pages/helpers/sitesEditor.ts` and `src/web/pages/Sites.tsx` — editor state/payload/UI.
- Proxy route/surface files listed in Tasks 6–8 — migrate external traffic to the proxy-only wrapper.

### Stable interfaces produced by this plan

```ts
export type SiteMaxConcurrencyResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export function normalizeSiteMaxConcurrency(value: unknown): SiteMaxConcurrencyResult;

export class SiteConcurrencyLimitError extends Error {
  constructor(input: {
    siteId: number;
    reason: 'queue_full' | 'wait_timeout' | 'aborted';
    retryAfterMs: number;
  });
  readonly code: 'site_concurrency_limit';
  readonly reason: 'queue_full' | 'wait_timeout' | 'aborted';
  readonly statusCode: 503;
  readonly retryAfterMs: number;
  readonly siteId: number;
}

export type ProxySiteConcurrencySnapshot = {
  siteId: number;
  limit: number;
  activeLeaseCount: number;
  waitingCount: number;
};

export type ProxySiteLease = {
  readonly siteId: number;
  isActive(): boolean;
  isTransferred(): boolean;
  markTransferred(): void;
  touch(): void;
  release(): void;
};

proxyChannelCoordinator.acquireSiteLease(input: {
  siteId: number;
  maxConcurrency: number | null | undefined;
  signal?: AbortSignal;
}): Promise<ProxySiteLease>;

proxyChannelCoordinator.updateSiteConcurrencyLimit(
  siteId: number,
  maxConcurrency: number | null | undefined,
): void;

proxyChannelCoordinator.getSiteConcurrencySnapshot(
  siteId: number,
): ProxySiteConcurrencySnapshot;

export async function runWithProxySiteApiEndpointPool<T>(
  site: typeof schema.sites.$inferSelect,
  operation: (target: SiteApiEndpointTarget, lease: ProxySiteLease) => Promise<T>,
  options?: { signal?: AbortSignal },
): Promise<T>;

export function bindSiteLeaseToResponse(
  response: Response,
  lease: ProxySiteLease,
  signal?: AbortSignal,
): Response;

export function createProxyRequestAbortSignal(
  request: FastifyRequest,
  reply: FastifyReply,
): { signal: AbortSignal; dispose(): void };

export function replySiteConcurrencyLimit(
  reply: FastifyReply,
  error: SiteConcurrencyLimitError,
): FastifyReply | undefined;

export function isSiteConcurrencyLimitError(error: unknown): error is SiteConcurrencyLimitError;
```

---

### Task 1: Add Migration 0029 and the Canonical Limit Contract

**Files:**
- Create: `src/shared/siteMaxConcurrency.js`
- Create: `src/shared/siteMaxConcurrency.d.ts`
- Create: `src/shared/siteMaxConcurrency.test.ts`
- Create: `drizzle/0029_site_max_concurrency.sql` via Drizzle generation
- Create: `drizzle/meta/0029_snapshot.json` via Drizzle generation
- Modify: `src/server/db/schema.ts:4-28`
- Modify: `src/server/db/siteSchemaCompatibility.ts:22-86`
- Modify: `src/server/db/siteSchemaCompatibility.test.ts:34-124`
- Modify generated files under `src/server/db/generated/`
- Test: `src/server/db/schemaContract.test.ts`
- Test: `src/server/db/schemaArtifactGenerator.test.ts`
- Test: `src/server/db/schemaParity.test.ts`

**Interfaces:**
- Consumes: existing migration-driven schema artifact generators.
- Produces: `normalizeSiteMaxConcurrency(value)` and `sites.maxConcurrency` for every later task.

- [ ] **Step 1: Add RED normalization tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeSiteMaxConcurrency } from './siteMaxConcurrency.js';

describe('normalizeSiteMaxConcurrency', () => {
  it.each([null, '', '   ', 0, '0'])(`normalizes %j to unlimited`, (value) => {
    expect(normalizeSiteMaxConcurrency(value)).toEqual({ ok: true, value: null });
  });

  it.each([1, '2', 10000])(`accepts %j`, (value) => {
    expect(normalizeSiteMaxConcurrency(value)).toEqual({ ok: true, value: Number(value) });
  });

  it.each([-1, 1.5, '1.5', 10001, Number.NaN, Number.POSITIVE_INFINITY, {}, []])(
    `rejects %j`,
    (value) => {
      expect(normalizeSiteMaxConcurrency(value)).toEqual({
        ok: false,
        error: 'Invalid maxConcurrency. Expected an integer from 0 to 10000.',
      });
    },
  );
});
```

- [ ] **Step 2: Add RED schema/compatibility assertions**

```ts
expect(contract.tables.sites.columns.max_concurrency).toMatchObject({
  logicalType: 'integer',
  notNull: false,
  primaryKey: false,
});
expect(sqliteStatements).toContain(
  'ALTER TABLE `sites` ADD `max_concurrency` integer',
);
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
npx vitest run --root . \
  src/shared/siteMaxConcurrency.test.ts \
  src/server/db/schemaContract.test.ts \
  src/server/db/siteSchemaCompatibility.test.ts
```

Expected: FAIL because the shared module and `max_concurrency` column do not exist.

- [ ] **Step 4: Implement the shared normalizer and declaration**

```js
export const SITE_MAX_CONCURRENCY_MAX = 10000;

export function normalizeSiteMaxConcurrency(value) {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === 'string' && !value.trim()) return { ok: true, value: null };
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > SITE_MAX_CONCURRENCY_MAX) {
    return {
      ok: false,
      error: 'Invalid maxConcurrency. Expected an integer from 0 to 10000.',
    };
  }
  return { ok: true, value: parsed === 0 ? null : parsed };
}
```

```ts
export const SITE_MAX_CONCURRENCY_MAX: 10000;
export type SiteMaxConcurrencyResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };
export function normalizeSiteMaxConcurrency(value: unknown): SiteMaxConcurrencyResult;
```

- [ ] **Step 5: Add the Drizzle field and compatibility specification**

Insert this exact nullable field after the site's `url` column in `src/server/db/schema.ts`:

```ts
maxConcurrency: integer('max_concurrency'),
```

Add the exact nullable integer column to `SITE_COLUMN_COMPATIBILITY_SPECS` using the existing cross-dialect shape.

- [ ] **Step 6: Generate migration 0029 and schema artifacts**

Run:

```bash
npx drizzle-kit generate --name site_max_concurrency
npm run schema:contract
```

Expected:

- `drizzle/0029_site_max_concurrency.sql` contains an additive nullable column;
- `_journal.json` gains index 28/tag `0029_site_max_concurrency`;
- `0029_snapshot.json` exists;
- generated SQLite/MySQL/PostgreSQL artifacts contain `max_concurrency`.

- [ ] **Step 7: Run schema verification**

```bash
npm run test:schema:unit
npx vitest run --root . src/server/db/siteSchemaCompatibility.test.ts
npm run repo:drift-check
```

Expected: all pass; drift reports 0 violations and 0 tracked debt.

- [ ] **Step 8: Commit Task 1**

```bash
git add drizzle src/shared/siteMaxConcurrency.js src/shared/siteMaxConcurrency.d.ts \
  src/shared/siteMaxConcurrency.test.ts src/server/db/schema.ts \
  src/server/db/siteSchemaCompatibility.ts src/server/db/siteSchemaCompatibility.test.ts \
  src/server/db/generated
git commit -m "feat: add site concurrency schema contract" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Persist and Back Up Site Concurrency Settings

**Files:**
- Modify: `src/server/contracts/siteRoutePayloads.ts:6-35`
- Modify: `src/server/routes/api/sites.ts:442-764`
- Modify: `src/server/services/backupService.ts:104-115,747-768,995-1016,1439-1477,1572-1594`
- Test: `src/server/routes/api/sites.proxyUrl.test.ts`
- Test: `src/server/services/backupService.test.ts`

**Interfaces:**
- Consumes: `normalizeSiteMaxConcurrency` and `sites.maxConcurrency` from Task 1.
- Produces: validated API/backup persistence consumed by coordinator/UI tasks.

- [ ] **Step 1: Add RED API tests for create/update semantics**

```ts
it('persists normalized site max concurrency on create and update', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/sites',
    payload: { name: 'limited', url: 'https://api.example.com', maxConcurrency: '12' },
  });
  expect(created.statusCode).toBe(200);
  expect(created.json().maxConcurrency).toBe(12);

  const updated = await app.inject({
    method: 'PUT',
    url: `/api/sites/${created.json().id}`,
    payload: { maxConcurrency: 0 },
  });
  expect(updated.statusCode).toBe(200);
  expect(updated.json().maxConcurrency).toBeNull();
});

it.each([-1, 1.5, 10001])('rejects invalid maxConcurrency %s', async (maxConcurrency) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/sites',
    payload: { name: 'bad', url: 'https://api.example.com', maxConcurrency },
  });
  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({
    error: 'Invalid maxConcurrency. Expected an integer from 0 to 10000.',
  });
});
```

- [ ] **Step 2: Add RED backup tests**

```ts
const exported = await backupService.exportBackup('all') as any;
expect(exported.accounts.sites[0].maxConcurrency).toBe(7);

const imported = await backupService.importBackup(exported as Record<string, unknown>);
expect(imported.allImported).toBe(true);
const restored = await db.select().from(schema.sites).where(eq(schema.sites.id, site.id)).get();
expect(restored?.maxConcurrency).toBe(7);

const legacyBackup = structuredClone(exported);
delete legacyBackup.accounts.sites[0].maxConcurrency;
await backupService.importBackup(legacyBackup as Record<string, unknown>);
const legacyRestored = await db.select().from(schema.sites).where(eq(schema.sites.id, site.id)).get();
expect(legacyRestored?.maxConcurrency).toBeNull();

const invalidBackup = structuredClone(exported);
invalidBackup.accounts.sites[0].maxConcurrency = -1;
await expect(backupService.importBackup(invalidBackup as Record<string, unknown>))
  .rejects.toThrow('Invalid maxConcurrency. Expected an integer from 0 to 10000.');
```

- [ ] **Step 3: Run RED API/backup tests**

```bash
npx vitest run --root . \
  src/server/routes/api/sites.proxyUrl.test.ts \
  src/server/services/backupService.test.ts
```

Expected: FAIL because payload/import logic ignores or rejects the new field incorrectly.

- [ ] **Step 4: Add the field to create/update contracts**

Add this exact property to both `siteCreatePayloadSchema` and `siteUpdatePayloadSchema` before `.passthrough()`:

```ts
maxConcurrency: z.unknown().optional(),
```

Use `Object.prototype.hasOwnProperty.call(body, 'maxConcurrency')` to distinguish omitted updates from an explicit unlimited value.

- [ ] **Step 5: Normalize and persist create/update values**

```ts
const hasMaxConcurrency = Object.prototype.hasOwnProperty.call(body, 'maxConcurrency');
const maxConcurrencyResult = hasMaxConcurrency
  ? normalizeSiteMaxConcurrency(body.maxConcurrency)
  : null;
if (maxConcurrencyResult && !maxConcurrencyResult.ok) {
  return reply.code(400).send({ error: maxConcurrencyResult.error });
}
```

Create stores `maxConcurrencyResult?.value ?? null`; update assigns only when `hasMaxConcurrency` is true.

- [ ] **Step 6: Validate native/converted backups before import**

```ts
function normalizeImportedSiteMaxConcurrency(row) {
  if (!Object.prototype.hasOwnProperty.call(row, 'maxConcurrency')) return null;
  const result = normalizeSiteMaxConcurrency(row.maxConcurrency);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
```

Apply it before the destructive transaction. ALL-API-Hub and legacy-ref constructors explicitly set `maxConcurrency: null`.

- [ ] **Step 7: Run Task 2 tests**

```bash
npx vitest run --root . \
  src/server/routes/api/sites.proxyUrl.test.ts \
  src/server/services/backupService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/server/contracts/siteRoutePayloads.ts src/server/routes/api/sites.ts \
  src/server/services/backupService.ts src/server/routes/api/sites.proxyUrl.test.ts \
  src/server/services/backupService.test.ts
git commit -m "feat: persist site concurrency settings" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add Runtime Configuration and Site Lease Coordination

**Files:**
- Modify: `src/server/config.ts:12-23,66-175`
- Modify: `src/server/config.test.ts:4-125`
- Modify: `src/server/services/proxyChannelCoordinator.ts:1-387`
- Modify: `src/server/services/proxyChannelCoordinator.test.ts:1-232`

**Interfaces:**
- Consumes: normalized per-site limit from Task 1.
- Produces: `SiteConcurrencyLimitError`, `ProxySiteLease`, coordinator acquisition/update APIs for Tasks 4–8.

- [ ] **Step 1: Add RED configuration tests**

```ts
it('normalizes site concurrency process settings', () => {
  expect(buildConfig({})).toMatchObject({
    proxySiteConcurrencyQueueLimit: 100,
    proxySiteConcurrencyQueueWaitMs: 1500,
    proxySiteConcurrencyLeaseTtlMs: 90000,
    proxySiteConcurrencyLeaseKeepaliveMs: 15000,
  });

  expect(buildConfig({
    PROXY_SITE_CONCURRENCY_QUEUE_LIMIT: '20',
    PROXY_SITE_CONCURRENCY_QUEUE_WAIT_MS: '2500',
    PROXY_SITE_CONCURRENCY_LEASE_TTL_MS: '120000',
    PROXY_SITE_CONCURRENCY_LEASE_KEEPALIVE_MS: '10000',
  })).toMatchObject({
    proxySiteConcurrencyQueueLimit: 20,
    proxySiteConcurrencyQueueWaitMs: 2500,
    proxySiteConcurrencyLeaseTtlMs: 120000,
    proxySiteConcurrencyLeaseKeepaliveMs: 10000,
  });
});
```

Add invalid/range tests proving defaults are used rather than clamping.

- [ ] **Step 2: Add RED coordinator tests**

Add fake-timer tests for:

```ts
const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
const secondPromise = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toMatchObject({
  activeLeaseCount: 1,
  waitingCount: 1,
});
first.release();
const second = await secondPromise;
expect(second.isActive()).toBe(true);
```

Also cover FIFO order, independent sites, queue full, timeout, abort, idempotent release, TTL expiry, `touch`, dynamic `10→1`, `1→10`, `1→0`, latest-limit drain, and reset cleanup.

- [ ] **Step 3: Run RED config/coordinator tests**

```bash
npx vitest run --root . \
  src/server/config.test.ts \
  src/server/services/proxyChannelCoordinator.test.ts
```

Expected: FAIL because site config and lease APIs do not exist.

- [ ] **Step 4: Add dedicated config normalizers**

```ts
function parseIntegerInRange(raw, fallback, min, max) {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}
```

Compute TTL first; keepalive uses default unless `1000 <= value < ttl`.

- [ ] **Step 5: Implement site runtime state and typed error**

```ts
type SiteWaiter = {
  id: number;
  deadlineMs: number;
  signal?: AbortSignal;
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  onAbort: (() => void) | null;
  resolve: (lease: ProxySiteLease) => void;
  reject: (error: SiteConcurrencyLimitError) => void;
};

type SiteRuntimeState = {
  limit: number;
  activeLeaseIds: Set<number>;
  leases: Map<number, { expiryTimer: ReturnType<typeof setTimeout> | null }>;
  queue: SiteWaiter[];
};
```

Implement `acquireSiteLease`, `updateSiteConcurrencyLimit`, latest-limit FIFO drain, no-op unlimited lease, queue cap, timeout, abort removal, TTL/touch, idempotent release, `markTransferred()`, and `isTransferred()`. A tracked or no-op lease starts untransferred; `markTransferred()` is idempotent and tells Task 4's wrapper not to release in its `finally`. Emit bounded structured diagnostics only for queue-full, wait-timeout, TTL expiry, and explicit dynamic-limit changes; never log credentials, request bodies, prompts, or normal per-request grant/release noise. Add log-spy assertions to the coordinator tests for those four exceptional events.

- [ ] **Step 6: Make reset clear ownership**

`resetProxyChannelCoordinatorState()` clears every site lease timer, waiter timer, abort listener, and rejects queued waiters with reason `aborted` before clearing maps.

- [ ] **Step 7: Run coordinator tests**

```bash
npx vitest run --root . \
  src/server/config.test.ts \
  src/server/services/proxyChannelCoordinator.test.ts
```

Expected: PASS with fake timers reporting no residual timers/listeners.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/server/config.ts src/server/config.test.ts \
  src/server/services/proxyChannelCoordinator.ts src/server/services/proxyChannelCoordinator.test.ts
git commit -m "feat: add site concurrency coordinator" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add the Proxy-Only Endpoint Wrapper and Stream Lease Binding

**Files:**
- Modify: `src/server/services/siteApiEndpointService.ts:152-296`
- Modify: `src/server/services/siteApiEndpointService.test.ts`
- Create: `src/server/services/siteConcurrencyResponse.ts`
- Create: `src/server/services/siteConcurrencyResponse.test.ts`
- Create: `src/server/routes/proxy/siteConcurrencyBoundary.ts`
- Create: `src/server/routes/proxy/siteConcurrencyBoundary.test.ts`
- Test: `src/server/proxy-core/firstByteTimeout.test.ts`

**Interfaces:**
- Consumes: Task 3 `ProxySiteLease`/error/coordinator and Task 1 DB field.
- Produces: `runWithProxySiteApiEndpointPool`, response lease binding, Fastify abort/error helpers for Tasks 6–8.

- [ ] **Step 1: Add RED wrapper admission tests**

Test request-time DB lookup rather than stale `site.maxConcurrency`, one acquisition around multiple endpoint retries, internal pool no acquisition, and admission failure before endpoint bookkeeping.

```ts
await expect(runWithProxySiteApiEndpointPool(site, operation)).rejects.toMatchObject({
  code: 'site_concurrency_limit',
  reason: 'queue_full',
});
expect(operation).not.toHaveBeenCalled();
expect(recordFailureMock).not.toHaveBeenCalled();
```

- [ ] **Step 2: Add RED streaming lifecycle tests**

Create `Response` bodies whose reader:

- reaches EOF;
- throws;
- receives consumer `cancel()`;
- receives an abort signal;
- remains open until TTL.

Assert one lease release and unchanged chunks/errors/backpressure.

- [ ] **Step 3: Add RED Fastify boundary tests**

```ts
const reply = buildReplySpy();
replySiteConcurrencyLimit(reply, new SiteConcurrencyLimitError({
  siteId: 9,
  reason: 'wait_timeout',
  retryAfterMs: 1500,
}));
expect(reply.code).toHaveBeenCalledWith(503);
expect(reply.header).toHaveBeenCalledWith('Retry-After', '2');
expect(reply.send).toHaveBeenCalledWith({
  error: { type: 'site_concurrency_limit', message: 'Site concurrency limit reached' },
});
```

- [ ] **Step 4: Run RED wrapper/lifecycle tests**

```bash
npx vitest run --root . \
  src/server/services/siteApiEndpointService.test.ts \
  src/server/services/siteConcurrencyResponse.test.ts \
  src/server/routes/proxy/siteConcurrencyBoundary.test.ts \
  src/server/proxy-core/firstByteTimeout.test.ts
```

Expected: FAIL because proxy wrapper/binding/error helpers do not exist.

- [ ] **Step 5: Implement request-time limit lookup and wrapper**

```ts
async function loadCurrentSiteMaxConcurrency(siteId: number): Promise<number | null> {
  const row = await db.select({ maxConcurrency: schema.sites.maxConcurrency })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .get();
  return row?.maxConcurrency ?? null;
}
```

Acquire once, delegate to `runWithSiteApiEndpointPool`, and release in `finally` unless `lease.isTransferred()`.

- [ ] **Step 6: Implement explicit response stream ownership**

Create `bindSiteLeaseToResponse(response, lease, signal)` in `siteConcurrencyResponse.ts`. It must call `lease.markTransferred()` before returning a wrapped `Response`. Wrap `response.body` with a `ReadableStream` that forwards `pull`, `cancel`, source errors, and chunks. Call `lease.touch()` no more often than `keepaliveMs`. Release once on EOF/error/cancel/abort. Return a new `Response` preserving status/statusText/headers. If the response has no body, release immediately and return an equivalent bodyless response.

- [ ] **Step 7: Implement request abort and 503 helpers**

```ts
export function createProxyRequestAbortSignal(
  request: FastifyRequest,
  reply: FastifyReply,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const dispose = () => {
    request.raw.off('aborted', abort);
    reply.raw.off('close', abort);
  };
  const abort = () => {
    dispose();
    controller.abort();
  };
  request.raw.once('aborted', abort);
  reply.raw.once('close', abort);
  return { signal: controller.signal, dispose };
}
```

Add `replySiteConcurrencyLimit` and `isSiteConcurrencyLimitError`. The aborted reason returns no new response if raw response is already closed.

- [ ] **Step 8: Run Task 4 tests**

```bash
npx vitest run --root . \
  src/server/services/siteApiEndpointService.test.ts \
  src/server/services/siteConcurrencyResponse.test.ts \
  src/server/routes/proxy/siteConcurrencyBoundary.test.ts \
  src/server/proxy-core/firstByteTimeout.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add src/server/services/siteApiEndpointService.ts src/server/services/siteApiEndpointService.test.ts \
  src/server/services/siteConcurrencyResponse.ts src/server/services/siteConcurrencyResponse.test.ts \
  src/server/routes/proxy/siteConcurrencyBoundary.ts src/server/routes/proxy/siteConcurrencyBoundary.test.ts \
  src/server/proxy-core/firstByteTimeout.test.ts
git commit -m "feat: bind site concurrency to endpoint streams" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Expose Site Management and Dynamic Limit Updates

**Files:**
- Modify: `src/server/routes/api/sites.ts:466-764`
- Test: `src/server/routes/api/sites.proxyUrl.test.ts`
- Modify: `src/web/pages/helpers/sitesEditor.ts:14-165,254-262`
- Modify: `src/web/pages/helpers/sitesEditor.test.ts`
- Modify: `src/web/pages/Sites.tsx:56-85,743-829,1926-1967`
- Test: `src/web/pages/sites.mobile.test.tsx`
- Test: `src/web/pages/sites.centered-modal.test.ts`

**Interfaces:**
- Consumes: Task 2 persistence and Task 3 `updateSiteConcurrencyLimit`.
- Produces: user-manageable limit and immediate process queue drain/update.

- [ ] **Step 1: Add RED dynamic-update route tests**

Mock `proxyChannelCoordinator.updateSiteConcurrencyLimit` and assert it is called only after successful create/update, with `null` for API `0`, and not called on validation/DB failure.

- [ ] **Step 2: Add RED editor/payload tests**

```ts
expect(siteFormFromSite({ maxConcurrency: 7 }).maxConcurrency).toBe('7');
expect(siteFormFromSite({ maxConcurrency: null }).maxConcurrency).toBe('0');
expect(buildSiteSaveAction({ mode: 'add' }, form).payload.maxConcurrency).toBe(7);
```

Add invalid/fractional/10001 UI validation cases.

- [ ] **Step 3: Run RED management/UI tests**

```bash
npx vitest run --root . \
  src/server/routes/api/sites.proxyUrl.test.ts \
  src/web/pages/helpers/sitesEditor.test.ts \
  src/web/pages/sites.mobile.test.tsx \
  src/web/pages/sites.centered-modal.test.ts
```

Expected: FAIL because editor/API notification support is absent.

- [ ] **Step 4: Notify the coordinator after persistence**

After a committed create/update, call:

```ts
proxyChannelCoordinator.updateSiteConcurrencyLimit(siteId, persistedMaxConcurrency);
```

Never notify before DB success.

- [ ] **Step 5: Add editor state and payload**

Add these exact properties to the existing types:

```ts
// SiteForm
maxConcurrency: string;

// SiteSavePayload
maxConcurrency: number | null;
```

Hydrate `null` as `'0'`; validate through `normalizeSiteMaxConcurrency` before `handleSave` sends the payload.

- [ ] **Step 6: Add the responsive field**

Use the existing `ResponsiveFormGrid`:

```tsx
<label>
  <span>站点最大并发</span>
  <input
    type="number"
    min={0}
    max={10000}
    step={1}
    value={form.maxConcurrency}
    onChange={(event) => setForm((prev) => ({ ...prev, maxConcurrency: event.target.value }))}
  />
  <small>0 表示不限制；该限制按每个 Metapi 进程计算。</small>
</label>
```

- [ ] **Step 7: Run Task 5 tests**

```bash
npx vitest run --root . \
  src/server/routes/api/sites.proxyUrl.test.ts \
  src/web/pages/helpers/sitesEditor.test.ts \
  src/web/pages/sites.mobile.test.tsx \
  src/web/pages/sites.centered-modal.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/server/routes/api/sites.ts src/server/routes/api/sites.proxyUrl.test.ts \
  src/web/pages/helpers/sitesEditor.ts src/web/pages/helpers/sitesEditor.test.ts \
  src/web/pages/Sites.tsx src/web/pages/sites.mobile.test.tsx src/web/pages/sites.centered-modal.test.ts
git commit -m "feat: expose site concurrency management" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migrate Raw OpenAI-Compatible Proxy Routes

**Files:**
- Modify: `src/server/routes/proxy/completions.ts`
- Modify: `src/server/routes/proxy/embeddings.ts`
- Modify: `src/server/routes/proxy/images.ts`
- Modify: `src/server/routes/proxy/search.ts`
- Modify: `src/server/routes/proxy/videos.ts`
- Test: `src/server/routes/proxy/completions.siteApiEndpoint.test.ts`
- Test: `src/server/routes/proxy/embeddings.siteApiEndpoint.test.ts`
- Test: `src/server/routes/proxy/images.edits.test.ts`
- Test: `src/server/routes/proxy/search.test.ts`
- Test: `src/server/routes/proxy/videos.test.ts`

**Interfaces:**
- Consumes: Task 4 wrapper, lease binding, abort/error helpers.
- Produces: site-cap coverage for raw routes without failure bookkeeping/retry amplification.

- [ ] **Step 1: Add RED route admission tests**

For each representative route, make the first request hold a `maxConcurrency: 1` lease and assert a second request receives 503/Retry-After with zero fetch/channel-failure/endpoint-failure calls. Include a different-site request that proceeds.

- [ ] **Step 2: Add RED response ownership tests**

For one streaming/raw route and one JSON route, assert the lease stays active until body consumption/cancellation and releases once.

- [ ] **Step 3: Run RED raw-route tests**

```bash
npx vitest run --root . \
  src/server/routes/proxy/completions.siteApiEndpoint.test.ts \
  src/server/routes/proxy/embeddings.siteApiEndpoint.test.ts \
  src/server/routes/proxy/images.edits.test.ts \
  src/server/routes/proxy/search.test.ts \
  src/server/routes/proxy/videos.test.ts
```

Expected: FAIL because routes still use the non-limited pool.

- [ ] **Step 4: Replace pool calls and bind upstream responses**

Use this exact pattern inside each selected-channel attempt:

```ts
const abort = createProxyRequestAbortSignal(request, reply);
const result = await runWithProxySiteApiEndpointPool(
  selected.site,
  async (target, lease) => {
    const response = await fetch(requestUrl, requestInit);
    return {
      upstream: bindSiteLeaseToResponse(response, lease, abort.signal),
      upstreamPath,
    };
  },
  { signal: abort.signal },
);
```

Use `target.baseUrl` for every upstream URL.

- [ ] **Step 5: Short-circuit concurrency errors before failure/retry logic**

```ts
if (isSiteConcurrencyLimitError(error)) {
  return replySiteConcurrencyLimit(reply, error);
}
```

Place this before `recordFailure`, endpoint cooldown, and `canRetryChannelSelection` branches.

- [ ] **Step 6: Run raw-route tests**

```bash
npx vitest run --root . \
  src/server/routes/proxy/completions.siteApiEndpoint.test.ts \
  src/server/routes/proxy/embeddings.siteApiEndpoint.test.ts \
  src/server/routes/proxy/images.edits.test.ts \
  src/server/routes/proxy/search.test.ts \
  src/server/routes/proxy/videos.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/server/routes/proxy/completions.ts src/server/routes/proxy/embeddings.ts \
  src/server/routes/proxy/images.ts src/server/routes/proxy/search.ts src/server/routes/proxy/videos.ts \
  src/server/routes/proxy/completions.siteApiEndpoint.test.ts \
  src/server/routes/proxy/embeddings.siteApiEndpoint.test.ts \
  src/server/routes/proxy/images.edits.test.ts src/server/routes/proxy/search.test.ts \
  src/server/routes/proxy/videos.test.ts
git commit -m "feat: enforce site limits on proxy routes" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Migrate Shared Chat and Responses Surfaces

**Files:**
- Modify: `src/server/proxy-core/surfaces/chatSurface.ts`
- Modify: `src/server/proxy-core/surfaces/openAiResponsesSurface.ts`
- Modify: `src/server/proxy-core/surfaces/sharedSurface.ts`
- Test: `src/server/routes/proxy/chat.siteApiEndpoint.test.ts`
- Test: `src/server/routes/proxy/chat.stream.test.ts`
- Test: `src/server/routes/proxy/responses.compact-upstream.test.ts`
- Test: `src/server/proxy-core/surfaces/sharedSurface.test.ts`

**Interfaces:**
- Consumes: Task 4 wrapper/error helpers.
- Produces: Chat/Claude/Responses streaming and count-token coverage.

- [ ] **Step 1: Add RED chat/responses saturation tests**

Cover:

- max 1 with second request queued then timed out;
- 503 response/header;
- no `failureToolkit.handleUpstreamFailure`, `recordFailure`, or retry;
- stream lease active until EOF/cancel/client close;
- Claude count-token upstream branch capped;
- different site remains independent.

- [ ] **Step 2: Run RED shared-surface tests**

```bash
npx vitest run --root . \
  src/server/routes/proxy/chat.siteApiEndpoint.test.ts \
  src/server/routes/proxy/chat.stream.test.ts \
  src/server/routes/proxy/responses.compact-upstream.test.ts \
  src/server/proxy-core/surfaces/sharedSurface.test.ts
```

Expected: FAIL because shared surfaces use the existing pool/error path.

- [ ] **Step 3: Replace pool calls and transfer nested `upstream` responses**

Move each surface's current `executeEndpointFlow` call unchanged into the proxy-pool callback, replacing only its `siteUrl` value with `target.baseUrl`. Immediately after that call, transfer a successful upstream response with this exact block:

```ts
if (result.ok) {
  result.upstream = bindSiteLeaseToResponse(result.upstream, lease, abortSignal);
}
return result;
```

The callback itself is passed to:

```ts
const flow = await runWithProxySiteApiEndpointPool(
  selected.site,
  async (target, lease) => runEndpointFlowForTarget(target, lease),
  { signal: abortSignal },
);
```

Define `runEndpointFlowForTarget` as a local closure beside the current endpoint-flow call so it captures that surface's already-defined request builders, recovery hooks, timeout, and retry callbacks without changing them.

- [ ] **Step 4: Add the concurrency-error branch before failure toolkit calls**

Return the deterministic 503 directly. Do not clear sticky/channel state as a provider failure; normal request-finally cleanup still releases channel leases.

- [ ] **Step 5: Run Task 7 tests**

```bash
npx vitest run --root . \
  src/server/routes/proxy/chat.siteApiEndpoint.test.ts \
  src/server/routes/proxy/chat.stream.test.ts \
  src/server/routes/proxy/responses.compact-upstream.test.ts \
  src/server/proxy-core/surfaces/sharedSurface.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/server/proxy-core/surfaces/chatSurface.ts \
  src/server/proxy-core/surfaces/openAiResponsesSurface.ts \
  src/server/proxy-core/surfaces/sharedSurface.ts \
  src/server/routes/proxy/chat.siteApiEndpoint.test.ts src/server/routes/proxy/chat.stream.test.ts \
  src/server/routes/proxy/responses.compact-upstream.test.ts \
  src/server/proxy-core/surfaces/sharedSurface.test.ts
git commit -m "feat: enforce site limits on shared surfaces" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Cover Gemini Native/Compatibility and Responses WebSocket

**Files:**
- Modify: `src/server/proxy-core/surfaces/geminiSurface.ts`
- Modify: `src/server/routes/proxy/responsesWebsocket.ts`
- Test: `src/server/routes/proxy/gemini.test.ts`
- Test: `src/server/routes/proxy/responses.websocket.test.ts`

**Interfaces:**
- Consumes: Task 4 wrapper/error helpers.
- Produces: coverage for current pool bypasses and user-triggered Gemini model listing.

- [ ] **Step 1: Add RED Gemini coverage**

Test:

- direct native generate/stream uses selected endpoint under one site lease;
- compatibility flow uses one lease and binds returned response;
- user-triggered upstream model list is capped;
- locally synthesized model list is not capped;
- concurrency 503 causes no channel/provider failure or same-site retry;
- client disconnect releases a streaming lease.

- [ ] **Step 2: Add RED WebSocket frame coverage**

With `maxConcurrency: 1`, hold one direct Codex frame operation, send another connection/frame for the same site, and assert bounded 503-style WebSocket error semantics/no upstream second dispatch/no failure bookkeeping. Assert lease release after completed/error/fallback frame.

- [ ] **Step 3: Run RED Gemini/WebSocket tests**

```bash
npx vitest run --root . \
  src/server/routes/proxy/gemini.test.ts \
  src/server/routes/proxy/responses.websocket.test.ts
```

Expected: FAIL because these paths are not using the proxy wrapper.

- [ ] **Step 4: Integrate Gemini with the endpoint pool wrapper**

Wrap direct/compatibility upstream branches and feed `target.baseUrl` into request construction/`executeEndpointFlow`. Bind every escaping upstream `Response`. Apply the wrapper only to the upstream branch of user model listing.

- [ ] **Step 5: Integrate direct WebSocket runtime requests**

Replace `runWithSiteApiEndpointPool` with the proxy wrapper around `codexWebsocketRuntime.sendRequest`. Since it returns fully collected runtime events rather than an escaping `Response`, do not transfer the lease; release on callback completion/error.

- [ ] **Step 6: Map WebSocket concurrency error**

Send the existing WebSocket error envelope with status 503 and retry timing. Do not invoke HTTP fallback, route/channel retry, or failure recording for admission rejection.

- [ ] **Step 7: Run Task 8 tests**

```bash
npx vitest run --root . \
  src/server/routes/proxy/gemini.test.ts \
  src/server/routes/proxy/responses.websocket.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 8**

```bash
git add src/server/proxy-core/surfaces/geminiSurface.ts \
  src/server/routes/proxy/responsesWebsocket.ts \
  src/server/routes/proxy/gemini.test.ts src/server/routes/proxy/responses.websocket.test.ts
git commit -m "feat: cover Gemini and websocket site limits" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Document, Verify, and Review the Complete Feature

**Files:**
- Modify: `.env.example`
- Modify: `docs/configuration.md`
- Modify: `docs/superpowers/plans/2026-08-29-site-max-concurrency.md` only to check completed boxes during execution
- Test: all files listed in Tasks 1–8

**Interfaces:**
- Consumes: all completed tasks.
- Produces: deployment documentation, final verification evidence, and integration handoff.

- [ ] **Step 1: Add RED documentation contract test**

Create `src/server/config.site-concurrency-docs.test.ts` that reads `.env.example` and `docs/configuration.md`, asserting all four exact environment names/defaults plus `process-local`, `0 means unlimited`, queue cap, and Retry-After semantics.

- [ ] **Step 2: Run RED docs test**

```bash
npx vitest run --root . src/server/config.site-concurrency-docs.test.ts
```

Expected: FAIL because documentation is absent.

- [ ] **Step 3: Document configuration and operational limits**

Add exact values:

```text
PROXY_SITE_CONCURRENCY_QUEUE_LIMIT=100
PROXY_SITE_CONCURRENCY_QUEUE_WAIT_MS=1500
PROXY_SITE_CONCURRENCY_LEASE_TTL_MS=90000
PROXY_SITE_CONCURRENCY_LEASE_KEEPALIVE_MS=15000
```

Document process-local scope, `maxConcurrency=0` unlimited, 503/Retry-After, dynamic limits, streaming lease behavior, internal-flow exclusion, and rollback: setting all site limits to `0`/`NULL` disables enforcement immediately while migration 0029 may remain inert.

- [ ] **Step 4: Run focused feature matrix**

```bash
npx vitest run --root . \
  src/shared/siteMaxConcurrency.test.ts \
  src/server/db/siteSchemaCompatibility.test.ts \
  src/server/routes/api/sites.proxyUrl.test.ts \
  src/server/services/backupService.test.ts \
  src/server/config.test.ts \
  src/server/services/proxyChannelCoordinator.test.ts \
  src/server/services/siteApiEndpointService.test.ts \
  src/server/services/siteConcurrencyResponse.test.ts \
  src/server/routes/proxy/siteConcurrencyBoundary.test.ts \
  src/server/routes/proxy/completions.siteApiEndpoint.test.ts \
  src/server/routes/proxy/embeddings.siteApiEndpoint.test.ts \
  src/server/routes/proxy/images.edits.test.ts \
  src/server/routes/proxy/search.test.ts \
  src/server/routes/proxy/videos.test.ts \
  src/server/routes/proxy/chat.siteApiEndpoint.test.ts \
  src/server/routes/proxy/chat.stream.test.ts \
  src/server/routes/proxy/responses.compact-upstream.test.ts \
  src/server/proxy-core/surfaces/sharedSurface.test.ts \
  src/server/routes/proxy/gemini.test.ts \
  src/server/routes/proxy/responses.websocket.test.ts \
  src/web/pages/helpers/sitesEditor.test.ts \
  src/web/pages/sites.mobile.test.tsx \
  src/server/config.site-concurrency-docs.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run schema verification**

```bash
npm run test:schema:unit
npm run test:schema:parity
npm run test:schema:upgrade
npm run test:schema:runtime
```

Expected: all available local database tests pass. If external DB services are unavailable, record exact skipped live commands rather than claiming success.

- [ ] **Step 6: Run complete repository verification**

```bash
npm test
npm run typecheck
npm run repo:drift-check
npm run build
git diff --check
git status --short --branch
```

Record exact file/test totals and non-failing warnings.

- [ ] **Step 7: Commit documentation and verification contract**

```bash
git add .env.example docs/configuration.md src/server/config.site-concurrency-docs.test.ts \
  docs/superpowers/plans/2026-08-29-site-max-concurrency.md
git commit -m "docs: explain site concurrency limits" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Request independent task/whole-branch review**

Provide reviewers:

- spec path;
- this plan path;
- base SHA `4287315`;
- current HEAD;
- complete diff package;
- ledger/rulings;
- focused/full/schema/typecheck/drift/build evidence.

Require exact Critical/Important/Minor findings and merge-readiness verdict. Fix every confirmed Critical/Important with new RED tests and scoped re-review before completion.

- [ ] **Step 9: Final handoff**

Report:

- migration/implementation commits;
- exact verification totals;
- process-local limitation;
- queue defaults and 503 contract;
- schema/backup/API/UI changes;
- covered proxy surfaces;
- any deferred live-database checks;
- no push/merge performed until separately authorized.
