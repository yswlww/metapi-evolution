# Legacy LDOH Monitor Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused LDOH same-origin reverse proxy and credential/session API while preserving Metapi’s current built-in monitor overview.

**Architecture:** Delete the outbound fetch sink and all LDOH-only support code. Keep `monitorRoutes` focused solely on `/api/monitor/overview`; leave any existing generic settings row untouched and inert.

**Tech Stack:** Fastify 5, React 18, Drizzle, Vitest, Electron navigation tests.

**Spec:** `docs/superpowers/specs/2026-08-24-codeql-security-remediation-design.md`

## Global Constraints

- Preserve `Monitors.tsx`, `/api/monitor/overview`, account health refresh, and current metrics.
- Remove `/monitor-proxy/ldoh*`, `/api/monitor/config`, and `/api/monitor/session`.
- Remove LDOH Cookie storage/forwarding and response rewrite code.
- Do not delete existing database settings or add a migration.
- Removed routes return `404` and never perform outbound fetch.
- Close CodeQL request-forgery alert #8 by removing the sink.
- Do not push.

## File Structure

- Modify `src/server/routes/api/monitor.ts`: retain overview only; remove LDOH proxy/config/session implementation.
- Modify `src/server/routes/api/monitor.test.ts`: replace config tests with route-removal tests while retaining overview coverage.
- Modify `src/server/contracts/supportRoutePayloads.ts`: remove monitor config schema/type/parser and error branch.
- Create `src/web/api.monitor-retirement.test.ts`: verifies retired web API methods are no longer exported.
- Modify `src/web/api.ts`: remove stale monitor config/session methods.
- Modify `src/web/pages/Monitors.internal.test.tsx`: remove unused LDOH mocks/fixtures while preserving internal monitor assertions.
- Modify `src/web/i18n.supplement.ts`: remove unused LDOH-only strings.
- Modify `src/desktop/navigationGuard.test.ts`: remove obsolete LDOH-specific examples; retain general same-origin and external-origin behavior tests.

---

### Task 1: Prove and remove the server proxy/config/session routes

**Files:**
- Modify: `src/server/routes/api/monitor.test.ts`
- Modify: `src/server/routes/api/monitor.ts`

**Interfaces:**
- Preserve:

```ts
export async function monitorRoutes(app: FastifyInstance): Promise<void>;
```

- Only `/api/monitor/overview` remains registered by this plugin.

- [ ] **Step 1: Write failing route-retirement tests**

Replace the two config persistence tests with:

```ts
it.each([
  ['GET', '/api/monitor/config'],
  ['PUT', '/api/monitor/config'],
  ['POST', '/api/monitor/session'],
  ['GET', '/monitor-proxy/ldoh'],
  ['GET', '/monitor-proxy/ldoh/'],
  ['GET', '/monitor-proxy/ldoh/api/status'],
] as const)('does not register retired LDOH route %s %s', async (method, url) => {
  const response = await app.inject({ method, url });
  expect(response.statusCode).toBe(404);
});
```

To prove no sink remains, spy on `globalThis.fetch` before the proxy-path request and assert it is not called. Restore the spy in `finally`.

Keep every existing overview test unchanged.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run --root . src/server/routes/api/monitor.test.ts
```

Expected: config/session/proxy cases return current `200`, `400`, or proxy behavior rather than `404`.

- [ ] **Step 3: Remove LDOH-only imports/constants/helpers**

From `monitor.ts`, remove:

- `FastifyReply` and `FastifyRequest` imports if no longer needed;
- `upsertSetting`, `config`, and `eq` imports when unused;
- `parseMonitorConfigPayload`;
- `MONITOR_AUTH_COOKIE`, `LDOH_BASE_URL`, `LDOH_COOKIE_SETTING_KEY`;
- config/session/proxy guards;
- settings lookup, cookie parser/masking/normalization;
- response text/location rewriting;
- monitor auth and wildcard path helpers.

Keep overview helpers, `gte`, `createRateLimitGuard`, and `getAccountsSnapshot`.

- [ ] **Step 4: Remove route registrations and outbound fetch**

Delete `/api/monitor/config`, `/api/monitor/session`, `handleLdohProxy`, and all three `app.all('/monitor-proxy/ldoh...')` registrations.

`monitorRoutes` must end after registering `/api/monitor/overview`.

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run --root . src/server/routes/api/monitor.test.ts
npm run typecheck:server
```

Expected: overview tests and all retirement tests pass.

- [ ] **Step 6: Confirm the sink is gone**

```bash
rg -n "ldoh\.105117\.xyz|monitor-proxy/ldoh|monitor_ldoh_cookie|handleLdohProxy" src/server/routes/api/monitor.ts
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes/api/monitor.ts src/server/routes/api/monitor.test.ts
git commit -m "security: remove legacy LDOH monitor proxy" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Remove stale monitor payload and web API contracts

**Files:**
- Modify: `src/server/contracts/supportRoutePayloads.ts`
- Modify: `src/web/api.ts:1428-1436`
- Create: `src/web/api.monitor-retirement.test.ts`
- Modify: `src/web/pages/Monitors.internal.test.tsx`
- Modify: `src/web/i18n.supplement.ts:768-771`

- [ ] **Step 1: Write a failing exported-API retirement test**

Create `src/web/api.monitor-retirement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { api } from './api.js';

describe('retired LDOH monitor API', () => {
  it('does not expose legacy config or session methods', () => {
    expect(api).not.toHaveProperty('getMonitorConfig');
    expect(api).not.toHaveProperty('updateMonitorConfig');
    expect(api).not.toHaveProperty('initMonitorSession');
  });
});
```

Run:

```bash
npx vitest run --root . src/web/api.monitor-retirement.test.ts
```

Expected: FAIL because all three methods are still exported.

- [ ] **Step 2: Remove the server payload contract**

Delete:

```ts
const monitorConfigPayloadSchema = ...
export type MonitorConfigPayload = ...
export function parseMonitorConfigPayload(...) ...
```

Also remove the `ldohCookie` error-format branch.

Run:

```bash
rg -n "parseMonitorConfigPayload|MonitorConfigPayload|ldohCookie" src/server
```

Expected after removal: no production references.

- [ ] **Step 3: Remove stale web API methods**

Delete `getMonitorConfig`, `updateMonitorConfig`, and `initMonitorSession` from `src/web/api.ts`.

Remove matching mocks and setup values from `Monitors.internal.test.tsx`; retain `getMonitorOverview` and `refreshAccountHealth` mocks.

- [ ] **Step 4: Remove unused translations**

Delete only LDOH-specific strings such as `LDOH 监控面板` and Cookie save/update/clear messages. Do not alter generic monitor translations.

- [ ] **Step 5: Verify contracts and UI**

```bash
npx vitest run --root . \
  src/server/routes/api/monitor.test.ts \
  src/web/api.monitor-retirement.test.ts \
  src/web/pages/Monitors.internal.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/contracts/supportRoutePayloads.ts src/web/api.ts src/web/api.monitor-retirement.test.ts src/web/pages/Monitors.internal.test.tsx src/web/i18n.supplement.ts
git commit -m "refactor: remove stale LDOH monitor contracts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Remove obsolete desktop test assumptions

**Files:**
- Modify: `src/desktop/navigationGuard.test.ts`

**Interfaces:**
- Do not change `navigationGuard.ts`; its same-origin policy remains valid independently of LDOH.

- [ ] **Step 1: Remove only LDOH-specific examples**

Delete assertions and harness calls whose sole fixture is `/monitor-proxy/ldoh/`.

Retain tests proving:

- relative and same-origin app URLs are allowed;
- `about:` is allowed where intended;
- external origins are denied/opened externally;
- malformed URLs are denied.

- [ ] **Step 2: Run desktop tests**

```bash
npx vitest run --root . src/desktop/navigationGuard.test.ts
npm run typecheck:desktop
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/desktop/navigationGuard.test.ts
git commit -m "test: remove retired LDOH navigation cases" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Verify complete LDOH removal

- [ ] **Step 1: Search repository for stale runtime references**

```bash
rg -n "ldoh\.105117\.xyz|monitor-proxy/ldoh|monitor_ldoh_cookie|ld_auth_session|initMonitorSession|updateMonitorConfig|getMonitorConfig" src
```

Expected: no production references. Historical design documents may still describe the removed risk; do not alter the approved spec.

- [ ] **Step 2: Run monitor and desktop suites**

```bash
npx vitest run --root . \
  src/server/routes/api/monitor.test.ts \
  src/web/api.monitor-retirement.test.ts \
  src/web/pages/Monitors.internal.test.tsx \
  src/desktop/navigationGuard.test.ts
npm run typecheck
npm run repo:drift-check
git diff --check
```

Expected: all commands exit `0`.
