# Request Rate Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one automatic, CodeQL-recognized global request limiter plus authenticated admin/proxy credential buckets without requiring provider-specific configuration.

**Architecture:** Register `@fastify/rate-limit` once on the root Fastify instance for a coarse socket-address ceiling. Extend the existing request guard with trusted key generation, then apply lower buckets after successful admin or proxy authentication. Existing route-specific guards remain unchanged.

**Tech Stack:** Fastify 5, `@fastify/rate-limit` 11.x, TypeScript, Vitest, existing in-memory request guard.

**Spec:** `docs/superpowers/specs/2026-08-24-codeql-security-remediation-design.md`

## Global Constraints

- Register the global plugin once before CORS, authentication hooks, API routes, and proxy routes.
- Future providers and routes registered after the plugin inherit the limiter automatically.
- Defaults: `REQUEST_RATE_LIMIT_MAX=12000`, `REQUEST_RATE_LIMIT_WINDOW_MS=60000`, `AUTHENTICATED_RATE_LIMIT_MAX=1200`.
- The global key uses `request.raw.socket.remoteAddress`, never `X-Forwarded-For`.
- Authenticated proxy buckets use managed key ID or the fixed global-proxy identity; authenticated admin requests use one admin identity.
- Never store raw credentials in limiter keys, logs, or responses.
- Keep all existing stricter route-specific limits.
- Return HTTP `429` with `Retry-After` and project-style JSON.
- Do not push.

## File Structure

- Create `src/server/middleware/globalRateLimit.ts`: registers the CodeQL-recognized root Fastify plugin.
- Create `src/server/middleware/globalRateLimit.test.ts`: verifies global limits, socket keys, health exemption, and headers.
- Create `src/server/middleware/requestRateLimit.test.ts`: verifies trusted custom bucket keys in the existing guard.
- Modify `src/server/middleware/requestRateLimit.ts`: add an optional `keyGenerator` contract.
- Modify `src/server/middleware/auth.ts`: expose stable authenticated rate-limit identities without exposing secrets.
- Modify `src/server/middleware/auth.proxy.test.ts`: verify proxy identity bucketing.
- Modify `src/server/routes/proxy/router.ts`: apply the authenticated proxy guard after proxy authentication.
- Modify `src/server/index.ts`: register the root plugin and authenticated admin guard in the root auth hook.
- Modify `src/server/config.ts`: add rate-limit configuration.
- Modify `src/server/config.test.ts`: cover defaults and environment overrides.
- Modify `src/server/desktop.ts`: exempt the public desktop health route from the coarse global limit.
- Modify `src/server/desktop.test.ts`: verify the route-level exemption.
- Modify `package.json`, `package-lock.json`, `pnpm-lock.yaml`: add direct runtime dependency `@fastify/rate-limit` compatible with Fastify 5.
- Modify `docs/configuration.md`: document settings, process-local behavior, and multi-instance store limitation.

---

### Task 1: Add configuration and dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/server/config.ts:66-172`
- Test: `src/server/config.test.ts`

**Interfaces:**
- Produces config fields:
  - `requestRateLimitMax: number`
  - `requestRateLimitWindowMs: number`
  - `authenticatedRateLimitMax: number`

- [ ] **Step 1: Write failing config tests**

Add tests with literal expectations:

```ts
it('uses safe request rate-limit defaults', () => {
  const config = buildConfig({});
  expect(config.requestRateLimitMax).toBe(12_000);
  expect(config.requestRateLimitWindowMs).toBe(60_000);
  expect(config.authenticatedRateLimitMax).toBe(1_200);
});

it('normalizes request rate-limit environment overrides', () => {
  const config = buildConfig({
    REQUEST_RATE_LIMIT_MAX: '2400',
    REQUEST_RATE_LIMIT_WINDOW_MS: '30000',
    AUTHENTICATED_RATE_LIMIT_MAX: '300',
  });
  expect(config.requestRateLimitMax).toBe(2_400);
  expect(config.requestRateLimitWindowMs).toBe(30_000);
  expect(config.authenticatedRateLimitMax).toBe(300);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run --root . src/server/config.test.ts
```

Expected: FAIL because the three fields are undefined.

- [ ] **Step 3: Add config fields**

In `buildConfig`, parse positive integers and clamp each to at least `1`:

```ts
requestRateLimitMax: Math.max(1, Math.trunc(parseNumber(env.REQUEST_RATE_LIMIT_MAX, 12_000))),
requestRateLimitWindowMs: Math.max(1_000, Math.trunc(parseNumber(env.REQUEST_RATE_LIMIT_WINDOW_MS, 60_000))),
authenticatedRateLimitMax: Math.max(1, Math.trunc(parseNumber(env.AUTHENTICATED_RATE_LIMIT_MAX, 1_200))),
```

- [ ] **Step 4: Add Fastify 5-compatible dependency**

Run:

```bash
npm install @fastify/rate-limit@^11.2.0
npx pnpm@10 install --lockfile-only
```

Inspect `git diff -- package.json package-lock.json pnpm-lock.yaml` and confirm no unrelated dependency upgrades.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npx vitest run --root . src/server/config.test.ts
npm run typecheck:server
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json pnpm-lock.yaml src/server/config.ts src/server/config.test.ts
git commit -m "security: configure request rate limits" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add trusted keys to the existing request guard

**Files:**
- Modify: `src/server/middleware/requestRateLimit.ts`
- Create: `src/server/middleware/requestRateLimit.test.ts`

**Interfaces:**
- Extend `RateLimitOptions` with:

```ts
keyGenerator?: (request: FastifyRequest) => string;
```

- `createRateLimitGuard(options)` continues returning a Fastify pre-handler.

- [ ] **Step 1: Write a failing trusted-key test**

Create a Fastify test route using a two-request maximum and a key from `x-test-identity`:

```ts
it('uses a trusted custom identity instead of forwarded IP headers', async () => {
  const app = Fastify();
  app.get('/limited', {
    preHandler: [createRateLimitGuard({
      bucket: 'trusted-test',
      max: 1,
      windowMs: 60_000,
      keyGenerator: (request) => String(request.headers['x-test-identity'] || 'missing'),
    })],
  }, async () => ({ ok: true }));

  const first = await app.inject({
    method: 'GET', url: '/limited',
    headers: { 'x-test-identity': 'same', 'x-forwarded-for': '198.51.100.1' },
  });
  const second = await app.inject({
    method: 'GET', url: '/limited',
    headers: { 'x-test-identity': 'same', 'x-forwarded-for': '203.0.113.2' },
  });

  expect(first.statusCode).toBe(200);
  expect(second.statusCode).toBe(429);
  expect(second.headers['retry-after']).toBeDefined();
});
```

Reset the store before each test and close the app afterward.

- [ ] **Step 2: Run test and verify RED**

```bash
npx vitest run --root . src/server/middleware/requestRateLimit.test.ts
```

Expected: type/build failure because `keyGenerator` is not accepted, or behavioral failure because IP is still used.

- [ ] **Step 3: Implement the option**

Change key selection to:

```ts
function getRateLimitKey(options: RateLimitOptions, request: FastifyRequest): string {
  const identity = options.keyGenerator
    ? String(options.keyGenerator(request) || 'unknown')
    : extractClientIp(request);
  return `${options.bucket}:${identity}`;
}
```

Call `getRateLimitKey(options, request)` from the guard. Keep the existing IP fallback for legacy route-specific guards.

- [ ] **Step 4: Verify GREEN and legacy behavior**

```bash
npx vitest run --root . \
  src/server/middleware/requestRateLimit.test.ts \
  src/server/routes/api/accounts.login-shield.test.ts \
  src/server/routes/api/accounts.verifyTokenShield.test.ts \
  src/server/routes/api/oauth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware/requestRateLimit.ts src/server/middleware/requestRateLimit.test.ts
git commit -m "security: support trusted rate-limit identities" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Register the global Fastify limiter

**Files:**
- Create: `src/server/middleware/globalRateLimit.ts`
- Create: `src/server/middleware/globalRateLimit.test.ts`
- Modify: `src/server/index.ts:202-234`
- Modify: `src/server/desktop.ts`
- Modify: `src/server/desktop.test.ts`

**Interfaces:**
- Produce:

```ts
export type GlobalRateLimitOptions = {
  max: number;
  windowMs: number;
};

export async function registerGlobalRateLimit(
  app: FastifyInstance,
  options: GlobalRateLimitOptions,
): Promise<void>;
```

- [ ] **Step 1: Write failing integration tests**

Test a route registered after the plugin:

```ts
it('limits routes registered after the global plugin by socket address', async () => {
  const app = Fastify();
  await registerGlobalRateLimit(app, { max: 1, windowMs: 60_000 });
  app.get('/expensive', async () => ({ ok: true }));

  expect((await app.inject({ method: 'GET', url: '/expensive' })).statusCode).toBe(200);
  const blocked = await app.inject({ method: 'GET', url: '/expensive' });
  expect(blocked.statusCode).toBe(429);
  expect(blocked.headers['retry-after']).toBeDefined();
  expect(blocked.json()).toMatchObject({ error: expect.any(String) });
});
```

Add a route-level exemption test:

```ts
app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true }));
```

Inject it repeatedly and expect all responses to be `200`.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run --root . src/server/middleware/globalRateLimit.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement global registration**

Use the official Fastify plugin:

```ts
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export async function registerGlobalRateLimit(app: FastifyInstance, options: GlobalRateLimitOptions) {
  await app.register(fastifyRateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: (request) => request.raw.socket.remoteAddress || 'unknown',
    errorResponseBuilder: (_request, context) => ({
      error: 'Too many requests',
      retryAfter: context.after,
    }),
  });
}
```

Do not read `X-Forwarded-For` in this module.

- [ ] **Step 4: Register before all routes**

In `src/server/index.ts`, immediately after `Fastify(...)`:

```ts
await registerGlobalRateLimit(app, {
  max: config.requestRateLimitMax,
  windowMs: config.requestRateLimitWindowMs,
});
```

This line must appear before `app.register(cors)` and every auth/route hook.

- [ ] **Step 5: Exempt only the desktop health route**

Add route config in `registerDesktopRoutes`:

```ts
app.get(DESKTOP_HEALTH_ROUTE, {
  config: { rateLimit: false },
}, async () => ({ ok: true }));
```

Extend `desktop.test.ts` to inspect the route behavior after a test limiter with `max: 1`; three health requests must remain `200`.

- [ ] **Step 6: Verify GREEN**

```bash
npx vitest run --root . \
  src/server/middleware/globalRateLimit.test.ts \
  src/server/desktop.test.ts
npm run typecheck:server
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/middleware/globalRateLimit.ts src/server/middleware/globalRateLimit.test.ts src/server/index.ts src/server/desktop.ts src/server/desktop.test.ts
git commit -m "security: add global Fastify rate limit" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Apply authenticated admin and proxy buckets

**Files:**
- Modify: `src/server/middleware/auth.ts:128-171`
- Modify: `src/server/middleware/auth.proxy.test.ts`
- Modify: `src/server/routes/proxy/router.ts:14-30`
- Modify: `src/server/index.ts:206-211`
- Test: `src/server/routes/api/auth.test.ts`

**Interfaces:**
- Produce:

```ts
export function getProxyRateLimitIdentity(request: FastifyRequest): string | null;
```

Return `managed:<keyId>` for managed keys and `global` for the global proxy token. Return `null` before successful auth.

- [ ] **Step 1: Write failing proxy identity tests**

Extend `auth.proxy.test.ts` with a route that returns the identity after the real `proxyAuthMiddleware` hook:

```ts
app.addHook('onRequest', proxyAuthMiddleware);
app.get('/v1/ping', async (request) => ({
  identity: getProxyRateLimitIdentity(request),
}));

const response = await app.inject({
  method: 'GET',
  url: '/v1/ping',
  headers: { authorization: 'Bearer managed-token' },
});

expect(response.statusCode).toBe(200);
expect(response.json()).toEqual({ identity: 'managed:42' });
```

Add a global-token fixture expecting `{ identity: 'global' }`. Use the existing mocked downstream authorization services, not a new fake authentication system.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run --root . src/server/middleware/auth.proxy.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure identity helper**

```ts
export function getProxyRateLimitIdentity(request: FastifyRequest): string | null {
  const auth = getProxyAuthContext(request);
  if (!auth) return null;
  if (auth.source === 'managed' && auth.keyId !== null) return `managed:${auth.keyId}`;
  return 'global';
}
```

- [ ] **Step 4: Add authenticated proxy flow test**

In `auth.proxy.test.ts`, register hooks in production order:

```ts
app.addHook('onRequest', proxyAuthMiddleware);
app.addHook('onRequest', createRateLimitGuard({
  bucket: 'proxy-authenticated-test',
  max: 1,
  windowMs: 60_000,
  keyGenerator: (request) => getProxyRateLimitIdentity(request) || 'missing',
}));
```

Send two requests with the same valid key but different `X-Forwarded-For`; expect `200`, then `429`. Send a valid different managed key and expect `200`.

- [ ] **Step 5: Apply proxy guard in production**

In `proxyRoutes`, create one guard outside route registration and run it after successful auth:

```ts
const limitAuthenticatedProxy = createRateLimitGuard({
  bucket: 'proxy-authenticated',
  max: config.authenticatedRateLimitMax,
  windowMs: config.requestRateLimitWindowMs,
  keyGenerator: (request) => getProxyRateLimitIdentity(request) || 'missing',
});

app.addHook('onRequest', async (request, reply) => {
  await proxyAuthMiddleware(request, reply);
  if (!reply.sent) await limitAuthenticatedProxy(request, reply);
});
```

- [ ] **Step 6: Add and test authenticated admin guard**

Create one guard in `index.ts`:

```ts
const limitAuthenticatedAdmin = createRateLimitGuard({
  bucket: 'admin-authenticated',
  max: config.authenticatedRateLimitMax,
  windowMs: config.requestRateLimitWindowMs,
  keyGenerator: () => 'admin',
});
```

Run it only after `authMiddleware` succeeds:

```ts
await authMiddleware(request, reply);
if (!reply.sent) await limitAuthenticatedAdmin(request, reply);
```

Add this focused case to `auth.test.ts` using a separate test app so the production order is explicit:

```ts
const protectedApp = Fastify();
const limitAdmin = createRateLimitGuard({
  bucket: 'admin-authenticated-test',
  max: 1,
  windowMs: 60_000,
  keyGenerator: () => 'admin',
});
protectedApp.addHook('onRequest', async (request, reply) => {
  await authMiddleware(request, reply);
  if (!reply.sent) await limitAdmin(request, reply);
});
protectedApp.get('/api/protected', async () => ({ ok: true }));

const first = await protectedApp.inject({
  method: 'GET', url: '/api/protected',
  headers: { authorization: 'Bearer secret-token', 'x-forwarded-for': '198.51.100.1' },
});
const second = await protectedApp.inject({
  method: 'GET', url: '/api/protected',
  headers: { authorization: 'Bearer secret-token', 'x-forwarded-for': '203.0.113.2' },
});

expect(first.statusCode).toBe(200);
expect(second.statusCode).toBe(429);
await protectedApp.close();
```

Call `resetRequestRateLimitStore()` before this case so other tests cannot affect the bucket.

- [ ] **Step 7: Verify proxy and admin suites**

```bash
npx vitest run --root . \
  src/server/middleware/auth.proxy.test.ts \
  src/server/routes/api/auth.test.ts \
  src/server/routes/proxy/gemini.test.ts
npm run typecheck:server
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/middleware/auth.ts src/server/middleware/auth.proxy.test.ts src/server/routes/proxy/router.ts src/server/index.ts src/server/routes/api/auth.test.ts
git commit -m "security: rate limit authenticated request boundaries" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Document and verify request limits

**Files:**
- Modify: `docs/configuration.md`

- [ ] **Step 1: Document exact settings and semantics**

Add a request-rate section containing the three environment variables, defaults, per-socket global behavior, per-authenticated-identity behavior, process-local limitation, and shared-store recommendation for multi-instance deployment.

Explicitly state that adding a provider requires no limiter configuration because the root plugin applies automatically to routes registered afterward.

- [ ] **Step 2: Run focused and architecture verification**

```bash
npx vitest run --root . \
  src/server/config.test.ts \
  src/server/middleware/requestRateLimit.test.ts \
  src/server/middleware/globalRateLimit.test.ts \
  src/server/middleware/auth.proxy.test.ts \
  src/server/desktop.test.ts \
  src/server/routes/api/auth.test.ts \
  src/server/routes/proxy/gemini.test.ts
npm run typecheck:server
npm run repo:drift-check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/configuration.md
git commit -m "docs: explain request rate limits" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
