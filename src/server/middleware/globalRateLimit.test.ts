import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerGlobalRateLimit } from './globalRateLimit.js';

describe('global Fastify rate limit', () => {
  let app: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

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
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.json()).toMatchObject({ error: expect.any(String) });
  });

  it('allows routes to opt out of the global rate limit', async () => {
    app = Fastify();
    await registerGlobalRateLimit(app, { max: 1, windowMs: 60_000 });
    app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true }));

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health' }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(responses.map((response) => response.json())).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });
});
