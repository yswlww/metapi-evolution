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
