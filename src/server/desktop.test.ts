import Fastify from 'fastify';
import cors from '@fastify/cors';
import { describe, expect, it } from 'vitest';
import { createGlobalRateLimitHook, registerGlobalRateLimit } from './middleware/globalRateLimit.js';
import { isPublicApiRoute, registerDesktopRoutes } from './desktop.js';

describe('desktop server routes', () => {
  it('marks only the desktop health route as public', () => {
    expect(isPublicApiRoute('/api/desktop/health')).toBe(true);
    expect(isPublicApiRoute('/api/stats/dashboard')).toBe(false);
  });

  it('registers a public desktop health probe', async () => {
    const app = Fastify();
    await registerDesktopRoutes(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/desktop/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it('exempts the desktop health probe from the global rate limit', async () => {
    const app = Fastify();
    await registerGlobalRateLimit(app, { max: 1, windowMs: 60_000 });
    await app.register(cors);
    app.addHook('onRequest', createGlobalRateLimitHook(app));
    await registerDesktopRoutes(app);

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/desktop/health' }),
      app.inject({ method: 'GET', url: '/api/desktop/health' }),
      app.inject({ method: 'GET', url: '/api/desktop/health' }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    await app.close();
  });
});
