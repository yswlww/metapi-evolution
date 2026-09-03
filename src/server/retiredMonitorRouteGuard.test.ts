import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRetiredMonitorRouteGuard } from './retiredMonitorRouteGuard.js';

describe('retired monitor route guard in production ordering', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function buildProductionLikeApp() {
    app = Fastify();

    // Production registers the retired-path guard before the admin auth hook.
    await registerRetiredMonitorRouteGuard(app);

    app.addHook('onRequest', async (request, reply) => {
      if (!request.url.startsWith('/api/')) return;
      if (request.headers.authorization !== 'Bearer test-token') {
        return reply.code(401).send({ error: 'Missing Authorization header' });
      }
    });

    // Keep one ordinary API route to prove the guard does not replace auth.
    app.get('/api/monitor/overview', async () => ({ ok: true }));

    // Production installs the SPA fallback after all routes.
    app.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api/') && !request.url.startsWith('/v1/')) {
        return reply.type('text/html').send('<!doctype html><html>index</html>');
      }
      return reply.code(404).send({ error: 'Not found' });
    });

    await app.ready();
    return app;
  }

  it.each([
    ['GET', '/api/monitor/config'],
    ['GET', '/api/monitor/config?source=test'],
    ['PUT', '/api/monitor/config'],
    ['POST', '/api/monitor/session'],
    ['POST', '/api/monitor/session?source=test'],
    ['GET', '/monitor-proxy/ldoh'],
    ['GET', '/monitor-proxy/ldoh/'],
    ['GET', '/monitor-proxy/ldoh/api/status'],
    ['GET', '/monitor-proxy/ldoh/api/status?source=test'],
    ['GET', '/monitor-proxy'],
    ['GET', '/monitor-proxy/'],
    ['GET', '/monitor-proxy/another-retired-child'],
  ] as const)('returns 404 before auth or SPA fallback for %s %s', async (method, url) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    try {
      const server = await buildProductionLikeApp();
      const response = await server.inject({ method, url });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Not found' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    '/api/monitor/configuration',
    '/api/monitor/sessionize',
  ])('keeps similarly named API neighbors behind auth: %s', async (url) => {
    const server = await buildProductionLikeApp();
    const response = await server.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Missing Authorization header' });
  });

  it('keeps an ordinary API route behind auth', async () => {
    const server = await buildProductionLikeApp();

    const unauthorized = await server.inject({
      method: 'GET',
      url: '/api/monitor/overview',
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await server.inject({
      method: 'GET',
      url: '/api/monitor/overview',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toEqual({ ok: true });
  });

  it.each([
    '/monitor-proxyx',
    '/monitor-proxyx?source=test',
    '/monitor-proxy-ish/path',
  ])('keeps similarly named SPA neighbors on the fallback: %s', async (url) => {
    const server = await buildProductionLikeApp();
    const response = await server.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<html>index</html>');
  });
});
