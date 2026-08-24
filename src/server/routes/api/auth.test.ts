import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRateLimitGuard, resetRequestRateLimitStore } from '../../middleware/requestRateLimit.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type ConfigModule = typeof import('../../config.js');
type DbModule = typeof import('../../db/index.js');

describe('auth routes', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let config: ConfigModule['config'];
  let dataDir = '';
  let originalDataDir: string | undefined;
  let originalAuthToken = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-auth-routes-'));
    originalDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const configModule = await import('../../config.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./auth.js');
    db = dbModule.db;
    schema = dbModule.schema;
    config = configModule.config;
    originalAuthToken = config.authToken;

    app = Fastify();
    await app.register(routesModule.authRoutes);
  });

  beforeEach(async () => {
    config.authToken = 'secret-token';
    await db.delete(schema.events).run();
    await db.delete(schema.settings).run();
  });

  afterAll(async () => {
    config.authToken = originalAuthToken;
    await app.close();
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it('rejects malformed auth change payloads at the route boundary', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/auth/change',
      payload: {
        oldToken: 'secret-token',
        newToken: 123,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      message: 'Invalid newToken. Expected string.',
    });
  });

  it('rate limits authenticated admin requests independently of forwarded IP', async () => {
    resetRequestRateLimitStore();
    const { authMiddleware } = await import('../../middleware/auth.js');
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
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: 'Bearer secret-token', 'x-forwarded-for': '198.51.100.1' },
    });
    const second = await protectedApp.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: 'Bearer secret-token', 'x-forwarded-for': '203.0.113.2' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    await protectedApp.close();
    resetRequestRateLimitStore();
  });
});
