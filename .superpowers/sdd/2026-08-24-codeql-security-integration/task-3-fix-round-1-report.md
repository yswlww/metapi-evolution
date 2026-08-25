# Task 3 fix round 1 cumulative report — WebSocket request boundary

Date: 2026-08-25
Status: DONE_WITH_CONCERNS

## Scope and implementation

The retained Task 3 WebSocket security diff was amended in place; no retained edits were reset. The implementation keeps the raw `ws` transport and adds the smallest bounded request boundary:

- `src/server/middleware/requestRateLimit.ts`
  - Exposes the Fastify-independent fixed-window `consumeRateLimit` operation.
  - Keeps `createRateLimitGuard` on the same store and reset path.
  - Uses an unambiguous structured store key so `(bucket, identity)` values containing `:` cannot alias.
- `src/server/routes/proxy/responsesWebsocket.ts`
  - Applies a TCP `remoteAddress` pre-auth upgrade limiter before token extraction/authentication.
  - Returns HTTP 429 with JSON, `Retry-After`, and socket close behavior.
  - Applies a distinct authenticated connection bucket.
  - Applies the shared `proxy-authenticated` frame bucket before parsing, routing, upstream work, or managed quota.
  - Revalidates managed credentials for every candidate frame and uses the refreshed policy/context.
  - Carries the refreshed context through HTTP fallback so managed quota is consumed once.
- `src/server/middleware/auth.ts`
  - Uses `AsyncLocalStorage` with a unique execution key and exact active-key matching for internal fallback authorization/accounting.
  - Associates fallback execution with the original external socket address.
- `src/server/middleware/globalRateLimit.ts`
  - Resolves an active fallback execution key to the original external socket address for root global aggregation.
- Tests cover pre-auth floods, forwarding-header invariance, connection/frame ceilings, managed identity isolation, persistent managed maxRequests enforcement, fallback accounting, root global plugin composition, execution-context non-forgeability, limiter-store sharing, and delimiter-safe keys.
- `docs/configuration.md` documents raw Responses WebSocket pre-auth, connection, and frame ceilings and retains the process-local/multi-instance limitation.

Files changed:

- `docs/configuration.md`
- `src/server/middleware/auth.proxy.test.ts`
- `src/server/middleware/auth.ts`
- `src/server/middleware/globalRateLimit.ts`
- `src/server/middleware/requestRateLimit.test.ts`
- `src/server/middleware/requestRateLimit.ts`
- `src/server/routes/proxy/responses.websocket.test.ts`
- `src/server/routes/proxy/responsesWebsocket.ts`

## Recovered original TDD evidence

Source: `task-3-fix-round-1-recovered-evidence.md`, recovered from the stalled implementer transcript.

Baseline before the retained edits:

```text
npx vitest run --root . src/server/middleware/requestRateLimit.test.ts src/server/middleware/auth.proxy.test.ts src/server/middleware/globalRateLimit.test.ts src/server/routes/proxy/responses.websocket.test.ts
4 files passed; 55 tests passed
```

The recovered chronology establishes that tests were edited before production files. The clean original behavior RED at transcript line 216 had eight failing regression tests:

- transport-neutral limiter operation returned no result;
- repeated invalid upgrades returned 403 instead of 429;
- changed `X-Forwarded-For` split/missed the expected socket bucket;
- global-token connection creation remained unbounded;
- global-token frames remained unbounded;
- managed connection identity behavior failed;
- maxRequests-one fallback did not complete;
- authenticated fallback accounting was not exactly once.

The recovered focused fallback RED was:

```text
npx vitest run --root . src/server/routes/proxy/responses.websocket.test.ts -t "managed quota exactly once|direct websocket request falls back"
```

It reported two expected behavior failures: one returned an error instead of `response.completed`, and the direct runtime fallback returned `response.failed` instead of `response.completed`.

Recovered retained-diff GREEN evidence was:

```text
4 files passed; 64 tests passed
```

The controller’s fresh verification of the retained, pre-amendment diff reported 468 files passed / 1 skipped, 2,864 tests passed / 11 skipped, complete typecheck passed, repository drift 0, and `git diff --check` passed.

## Amendment RED evidence

Tests were added/adjusted before the amendment production changes. After fixture syntax was corrected, this focused command produced behavior REDs rather than compile errors:

```bash
npx vitest run --root . src/server/middleware/requestRateLimit.test.ts src/server/middleware/auth.proxy.test.ts src/server/routes/proxy/responses.websocket.test.ts -t "delimiter|synthetic execution|production global|persistent frame"
```

Observed failures on the retained implementation:

- `requestRateLimit.test.ts` — `does not alias bucket and identity values containing delimiters`: the independent pair was denied (`expected false to be true`) because the old `${bucket}:${identity}` key aliased the two pairs.
- `auth.proxy.test.ts` — `does not trust a synthetic execution key without the matching active context`: the external request received 200 instead of 401 because the old socket-address map could authorize a request without the matching active async context.
- `responses.websocket.test.ts` — `aggregates production global limits across repeated HTTP fallback frames by original socket`: the second fallback was not rejected with 429 (the retained implementation created a fresh synthetic fallback address and dispatched beyond the root bucket; the intentionally single-response fallback seam surfaced this as a downstream 503).
- `responses.websocket.test.ts` — `revalidates a managed key for each persistent frame before HTTP fallback`: the second frame was not rejected with the managed 403; the retained implementation reused the connection auth and continued into downstream work, surfacing a 503 instead.

The amendment also strengthened the existing actual Codex runtime-error-with-no-events to HTTP fallback test with a managed credential and exact auth/quota assertions. The final test exercises the real 426 runtime branch and proves one quota increment and two auth calls (connection plus frame).

## Amendment GREEN evidence

Focused matrix:

```bash
npx vitest run --root . \
  src/server/middleware/requestRateLimit.test.ts \
  src/server/middleware/auth.proxy.test.ts \
  src/server/middleware/globalRateLimit.test.ts \
  src/server/routes/proxy/responses.websocket.test.ts
```

```text
4 files passed
69 tests passed
```

Full suite:

```bash
npm test
```

```text
Test Files  468 passed | 1 skipped (469)
Tests       2869 passed | 11 skipped (2880)
Duration    34.12s
```

The suite emitted existing test-induced logs and warnings, including mocked proxy-service failures, a node-cron sourcemap warning, and expected error-path logging; the command exited successfully.

## Required verification

`npm run typecheck` passed all four targets:

- `typecheck:web`
- `typecheck:web:test`
- `typecheck:server`
- `typecheck:desktop`

`npm run repo:drift-check`:

```text
Violations: 0
Tracked debt: 0
```

`npm run build` passed `build:web`, `build:server`, and `build:desktop`. The existing Vite chunk-size warning for the large vendor chunk remained; no build failure occurred.

`git diff --check` passed.

## Self-review against the brief

- Pre-auth upgrades use `request.socket.remoteAddress` only; forwarding headers cannot split the coarse bucket.
- Pre-auth rejection occurs before token extraction and `authorizeDownstreamToken`.
- Connection and frame buckets are distinct and both use the authenticated identity.
- Frame rejection emits the existing WebSocket error envelope with status 429 and retry timing before upstream or managed quota work.
- Managed frames are revalidated after the frame limiter; disabled, expired, over-quota, or otherwise rejected credentials stop before quota/upstream dispatch.
- Internal fallback bypass requires both active process-local `AsyncLocalStorage` state and its exact unique execution key. No header, query parameter, token, or body field enables it.
- Root global rate-limit key generation maps active fallback execution to the original external socket address, preventing fresh synthetic buckets.
- Normal HTTP authentication, authenticated guard/quota accounting, and global plugin registration remain intact.
- The raw WebSocket transport was retained; no unrelated refactor or retired-route trailing-slash change was added.

## Deferred items and concerns

- The reviewer’s retired-route trailing-slash Minor remains explicitly deferred as required by the brief.
- Unavailable pnpm/Helm checks remain deferred as previously ruled out of scope.
- Limiter state and the internal fallback execution context are process-local. Multi-process, multi-container, and multi-instance deployments still require shared enforcement outside this change.
- The existing Vite large-chunk warning and known test-induced logs remain non-failing.

## Commit and clean status

Implementation commit:

```text
1779eea23f34d0d3637fc6a5e3143f1cdb0d6033
```

The implementation commit was created after the full focused matrix, full suite, typecheck, drift, build, and diff-check verification. The worktree was clean immediately after that commit. This report is the required post-commit evidence file; it will be committed separately so the final report itself is tracked.

## Task 3 fix round 2 — findings addressed

Round 2 retained all round-1 commits and addressed the verified re-review findings:

- Refreshed managed policy now validates the reused channel’s enabled/status/cooldown state, allowed route/model constraints, excluded sites, and excluded credential references before reuse. A revoked channel is cleared and policy-aware selection runs again, preserving the channel when it remains eligible for incremental sessions.
- Nested `/v1/search` simulation now receives the exact active process-local execution key from the internal `/v1/responses` fallback. The auth/accounting bypass accepts `/v1/search` only with the active `AsyncLocalStorage` context and exact matching synthetic key.
- Internal fallback 429 responses now carry positive retry timing from the injected `Retry-After` header or retry payload fields into the WebSocket error envelope.
- Added production-like managed search-only fallback coverage proving local search behavior and exactly-once authenticated/quota accounting.
- Added repeated missing-token upgrade-flood coverage proving 429 before authentication work.
- Restored and verified the delimiter-collision unit test so the committed test/report claim is accurate.
- Registered the real `/v1/search` route in the WebSocket production-like fixture; the first attempt without that route was discarded as invalid fixture RED rather than used as evidence.

Round-2 files additionally changed:

- `src/server/middleware/auth.ts`
- `src/server/middleware/requestRateLimit.test.ts`
- `src/server/proxy-core/webSearchSimulation.ts`
- `src/server/routes/proxy/responses.websocket.test.ts`
- `src/server/routes/proxy/responsesWebsocket.ts`

### Round-2 RED evidence

Refreshed-policy channel reuse RED was observed before the production amendment:

```bash
npx vitest run --root . src/server/routes/proxy/responses.websocket.test.ts -t "refreshed managed policy"
```

```text
FAIL ... reselects a channel when refreshed managed policy revokes the reused site
expected "spy" to be called 2 times, but got 1 times
```

This demonstrated that the second frame reused the channel selected under the old policy.

Fallback retry-timing RED was observed before the production amendment:

```bash
npx vitest run --root . src/server/routes/proxy/responses.websocket.test.ts -t "production global"
```

```text
FAIL ... aggregates production global limits across repeated HTTP fallback frames by original socket
expected retryAfter Any<String>, received no retryAfter field; status remained 429
```

Nested search coverage was first run with the existing WebSocket fixture, which did not register `/v1/search`; it timed out because that was an invalid fixture, so that result was explicitly discarded. The fixture was corrected to register the real search route before accepting GREEN evidence. The round-2 report does not misstate that invalid timeout as a production RED.

The missing-token flood and delimiter-collision additions are test-only corrections over already-approved round-1 production behavior. They were run before further production edits and passed against the retained boundary:

```bash
npx vitest run --root . src/server/routes/proxy/responses.websocket.test.ts -t "missing-token"
npx vitest run --root . src/server/middleware/requestRateLimit.test.ts
```

```text
1 test passed
4 tests passed
```

### Round-2 GREEN evidence

Focused matrix:

```bash
npx vitest run --root . \
  src/server/middleware/requestRateLimit.test.ts \
  src/server/middleware/auth.proxy.test.ts \
  src/server/middleware/globalRateLimit.test.ts \
  src/server/routes/proxy/responses.websocket.test.ts
```

```text
4 files passed
73 tests passed
```

The focused matrix includes the refreshed-policy reselection, managed nested search, fallback retry timing, missing-token flood, and delimiter-collision tests.

Full suite:

```bash
npm test
```

```text
Test Files  468 passed | 1 skipped (469)
Tests       2873 passed | 11 skipped (2884)
Duration    32.59s
```

Round-2 typecheck passed all four targets. Round-2 repository drift remained at 0 violations and 0 tracked debt. The all-artifact build passed. `git diff --check` passed. Existing non-failing test-induced logs, the node-cron sourcemap warning, and the Vite large-chunk warning remain unchanged.

### Round-2 self-review

- The active execution key is process-local and never exposed through a request-controlled header, query parameter, token, or body field.
- Nested search receives the key only from active `AsyncLocalStorage`; external `/v1/search` continues through ordinary auth/rate/quota hooks.
- Reused channels are rejected when refreshed policy excludes their site or credential, disallows their route/model, or makes their current channel/account/site ineligible.
- Retry timing is parsed only from positive numeric header/payload values and is emitted only for fallback 429 responses.
- Root plugin registration and normal HTTP accounting remain unchanged.
- No retired-route or unrelated changes were added.

Round-2 implementation commit:

```text
1c994fd5c2177a1a5758d80278da4ada9f805682
```

The report amendment is committed separately after this code commit so the cumulative evidence remains tracked. The final report commit SHA is returned alongside the implementation SHA.
