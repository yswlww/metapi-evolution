import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import { afterEach, describe, expect, it } from 'vitest';
import { createGlobalRateLimitHook, registerGlobalRateLimit } from './globalRateLimit.js';
import { registerRetiredMonitorRouteGuard } from '../retiredMonitorRouteGuard.js';
import { createRateLimitGuard, resetRequestRateLimitStore } from './requestRateLimit.js';

describe('global Fastify rate limit', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    resetRequestRateLimitStore();
  });

  async function installRootGlobalLimit(max: number, windowMs = 60_000): Promise<void> {
    if (!app) throw new Error('test app is not initialized');
    await registerGlobalRateLimit(app, { max, windowMs });
    await app.register(cors);
    app.addHook('onRequest', createGlobalRateLimitHook(app));
  }

  it('limits routes registered after the global plugin by socket address', async () => {
    app = Fastify();
    await registerGlobalRateLimit(app, { max: 1, windowMs: 60_000 });
    app.get('/expensive', async () => ({ ok: true }));

    const first = await app.inject({
      method: 'GET',
      url: '/expensive',
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    const blocked = await app.inject({
      method: 'GET',
      url: '/expensive',
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });

    expect(first.statusCode).toBe(200);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.json()).toEqual({
      statusCode: 429,
      error: 'Too many requests',
      retryAfter: expect.any(String),
    });
  });

  it('keys the global bucket by socket address when trustProxy is enabled', async () => {
    app = Fastify({ trustProxy: true });
    await registerGlobalRateLimit(app, { max: 1, windowMs: 60_000 });
    app.get('/socket-bound', async () => ({ ok: true }));

    const first = await app.inject({
      method: 'GET',
      url: '/socket-bound',
      remoteAddress: '10.0.0.8',
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    const blocked = await app.inject({
      method: 'GET',
      url: '/socket-bound',
      remoteAddress: '10.0.0.8',
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });

    expect(first.statusCode).toBe(200);
    expect(blocked.statusCode).toBe(429);
  });

  it('enforces the global bucket before authentication and preserves CORS headers', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    app.get('/expensive', async () => ({ ok: true }));

    const first = await app.inject({
      method: 'GET',
      url: '/expensive',
      headers: { origin: 'https://client.example' },
    });
    const blocked = await app.inject({
      method: 'GET',
      url: '/expensive',
      headers: { origin: 'https://client.example' },
    });

    expect(first.statusCode).toBe(200);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['access-control-allow-origin']).toBe('*');
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.json()).toEqual({
      statusCode: 429,
      error: 'Too many requests',
      retryAfter: expect.any(String),
    });
  });

  it('does not count CORS preflights in the global bucket', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    app.get('/expensive', async () => ({ ok: true }));

    const preflights = await Promise.all([
      app.inject({
        method: 'OPTIONS',
        url: '/expensive',
        headers: {
          origin: 'https://client.example',
          'access-control-request-method': 'GET',
        },
      }),
      app.inject({
        method: 'OPTIONS',
        url: '/expensive',
        headers: {
          origin: 'https://client.example',
          'access-control-request-method': 'GET',
        },
      }),
    ]);

    expect(preflights.map((response) => response.statusCode)).toEqual([204, 204]);
    expect((await app.inject({
      method: 'GET',
      url: '/expensive',
      headers: { origin: 'https://client.example' },
    })).statusCode).toBe(200);
  });

  it('preserves the desktop health exemption in the root hook', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true }));

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health' }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
  });

  it('preserves explicit route-local rate-limit configuration', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    app.get('/custom', {
      config: { rateLimit: { max: 2, timeWindow: 60_000 } },
    }, async () => ({ ok: true }));

    const responses = [
      await app.inject({ method: 'GET', url: '/custom' }),
      await app.inject({ method: 'GET', url: '/custom' }),
      await app.inject({ method: 'GET', url: '/custom' }),
    ];

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 429]);
    expect(responses[2]?.json()).toEqual({
      statusCode: 429,
      error: 'Too many requests',
      retryAfter: expect.any(String),
    });
  });

  it('bounds retired paths before the retired-route guard', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    registerRetiredMonitorRouteGuard(app);
    app.get('/monitor-proxy/ldoh', async () => ({ shouldNotRun: true }));

    const first = await app.inject({ method: 'GET', url: '/monitor-proxy/ldoh' });
    const blocked = await app.inject({ method: 'GET', url: '/monitor-proxy/ldoh' });

    expect(first.statusCode).toBe(404);
    expect(first.json()).toEqual({ error: 'Not found' });
    expect(blocked.statusCode).toBe(429);
  });

  it('bounds not-found fallbacks before the fallback handler', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ error: 'Not found' }));

    const first = await app.inject({ method: 'GET', url: '/missing' });
    const blocked = await app.inject({ method: 'GET', url: '/missing' });

    expect(first.statusCode).toBe(404);
    expect(first.json()).toEqual({ error: 'Not found' });
    expect(blocked.statusCode).toBe(429);
  });

  it('applies the global bucket before invalid admin authentication', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    const { authMiddleware } = await import('./auth.js');
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/')) await authMiddleware(request, reply);
    });
    app.get('/api/protected', async () => ({ ok: true }));

    const first = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: 'Bearer invalid-admin-token' },
    });
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: 'Bearer invalid-admin-token' },
    });

    expect(first.statusCode).toBe(403);
    expect(first.json()).toEqual({ error: 'Invalid token' });
    expect(blocked.statusCode).toBe(429);
  });

  it('does not count rejected admin authentication in the authenticated bucket', async () => {
    app = Fastify();
    await installRootGlobalLimit(10);
    const { authMiddleware } = await import('./auth.js');
    const { config } = await import('../config.js');
    const originalAuthToken = config.authToken;
    const originalAdminIpAllowlist = config.adminIpAllowlist;
    config.authToken = 'valid-admin-token';
    config.adminIpAllowlist = [];
    const limitAdmin = createRateLimitGuard({
      bucket: 'admin-authenticated-lifecycle-test',
      max: 1,
      windowMs: 60_000,
      keyGenerator: () => 'admin',
    });
    app.addHook('onRequest', async (request, reply) => {
      if (!request.url.startsWith('/api/')) return;
      await authMiddleware(request, reply);
      if (!reply.sent) await limitAdmin(request, reply);
    });
    app.get('/api/protected', async () => ({ ok: true }));

    try {
      const rejected = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: { authorization: 'Bearer invalid-admin-token' },
      });
      const firstAccepted = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: { authorization: 'Bearer valid-admin-token' },
      });
      const authenticatedBlocked = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: { authorization: 'Bearer valid-admin-token' },
      });

      expect(rejected.statusCode).toBe(403);
      expect(firstAccepted.statusCode).toBe(200);
      expect(authenticatedBlocked.statusCode).toBe(429);
    } finally {
      config.authToken = originalAuthToken;
      config.adminIpAllowlist = originalAdminIpAllowlist;
    }
  });

  it('applies the global bucket before invalid nested proxy authentication', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    const { proxyRoutes } = await import('../routes/proxy/router.js');
    await app.register(proxyRoutes);

    const first = await app.inject({ method: 'GET', url: '/v1/models' });
    const blocked = await app.inject({ method: 'GET', url: '/v1/models' });

    expect(first.statusCode).toBe(401);
    expect(first.json()).toEqual({
      error: 'Missing Authorization, x-api-key, x-goog-api-key, or key query parameter',
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('keeps production root and nested proxy limiter composition ordered', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'src/server/index.ts'), 'utf8');
    const routerSource = readFileSync(resolve(process.cwd(), 'src/server/routes/proxy/router.ts'), 'utf8');
    const pluginRegistration = indexSource.indexOf('await registerGlobalRateLimit(app');
    const corsRegistration = indexSource.indexOf('await app.register(cors);');
    const rootHook = indexSource.indexOf('createGlobalRateLimitHook(app)');
    const retiredGuard = indexSource.indexOf('registerRetiredMonitorRouteGuard(app);');
    const adminAuth = indexSource.indexOf('await authMiddleware(request, reply);');

    expect(pluginRegistration).toBeGreaterThanOrEqual(0);
    expect(pluginRegistration).toBeLessThan(corsRegistration);
    expect(corsRegistration).toBeLessThan(rootHook);
    expect(rootHook).toBeLessThan(retiredGuard);
    expect(retiredGuard).toBeLessThan(adminAuth);
    expect(routerSource).toContain("app.addHook('onRequest', createProxyAuthRateLimitHook({");
  });

  it('allows route-level global enforcement to run only once per request', async () => {
    app = Fastify();
    await installRootGlobalLimit(1);
    app.get('/once', async () => ({ ok: true }));

    const first = await app.inject({ method: 'GET', url: '/once' });
    const blocked = await app.inject({ method: 'GET', url: '/once' });

    expect(first.statusCode).toBe(200);
    expect(blocked.statusCode).toBe(429);
  });
});
