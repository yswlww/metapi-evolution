import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

type DbModule = typeof import('../../db/index.js');

type RunResult = { lastInsertRowid?: number | bigint } | null | undefined;

function insertedId(result: RunResult): number {
  return Number(result?.lastInsertRowid || 0);
}

describe('monitor routes', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  async function insertSite(input: Partial<typeof schema.sites.$inferInsert> = {}) {
    return insertedId(await db.insert(schema.sites).values({
      name: input.name || 'Test Site',
      url: input.url || `https://site-${Math.random().toString(16).slice(2)}.example.com`,
      platform: input.platform || 'new-api',
      status: input.status || 'active',
      ...input,
    }).run());
  }

  async function insertAccount(siteId: number, input: Partial<typeof schema.accounts.$inferInsert> = {}) {
    return insertedId(await db.insert(schema.accounts).values({
      siteId,
      username: input.username || 'tester',
      accessToken: input.accessToken || 'access-token',
      status: input.status || 'active',
      ...input,
    }).run());
  }

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-monitor-routes-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./monitor.js');
    db = dbModule.db;
    schema = dbModule.schema;

    app = Fastify();
    await app.register(routesModule.monitorRoutes);
  });

  beforeEach(async () => {
    await db.delete(schema.settings).run();
    await db.delete(schema.proxyLogs).run();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATA_DIR;
  });

  it('returns an empty internal monitor overview for a clean database', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/monitor/overview?refresh=1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accounts: {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        unknown: 0,
        disabled: 0,
        expired: 0,
        problemItems: [],
      },
      sites: {
        total: 0,
        active: 0,
        disabled: 0,
      },
      routes: {
        total: 0,
        enabled: 0,
        disabled: 0,
        zeroEnabledChannels: 0,
        cooldownChannels: 0,
        problemItems: [],
      },
      traffic24h: {
        total: 0,
        success: 0,
        failed: 0,
        retried: 0,
        successRate: 0,
        averageLatencyMs: null,
        totalCost: 0,
        totalTokens: 0,
        recentFailures: [],
      },
    });
    expect(response.json().generatedAt).toEqual(expect.any(String));
  });

  it('counts sites and highlights unhealthy accounts from this instance', async () => {
    const activeSiteId = await insertSite({ name: 'Primary New API', status: 'active' });
    await insertSite({ name: 'Disabled Site', status: 'disabled' });
    await insertAccount(activeSiteId, {
      username: 'healthy-account',
      extraConfig: JSON.stringify({
        runtimeHealth: {
          state: 'healthy',
          reason: 'Probe ok',
          source: 'test',
          checkedAt: '2026-06-06T00:00:00.000Z',
        },
      }),
    });
    await insertAccount(activeSiteId, {
      username: 'broken-account',
      extraConfig: JSON.stringify({
        runtimeHealth: {
          state: 'unhealthy',
          reason: 'Upstream returned 401',
          source: 'auth',
          checkedAt: '2026-06-06T00:01:00.000Z',
        },
      }),
    });
    await insertAccount(activeSiteId, {
      username: 'disabled-account',
      status: 'disabled',
    });
    await insertAccount(activeSiteId, {
      username: 'expired-account',
      status: 'expired',
    });

    const response = await app.inject({ method: 'GET', url: '/api/monitor/overview?refresh=1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sites: { total: 2, active: 1, disabled: 1 },
      accounts: {
        total: 4,
        healthy: 1,
        unhealthy: 2,
        disabled: 1,
        expired: 1,
      },
    });
    expect(response.json().accounts.problemItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: 'broken-account',
          siteName: 'Primary New API',
          runtimeHealth: expect.objectContaining({
            state: 'unhealthy',
            reason: 'Upstream returned 401',
          }),
        }),
        expect.objectContaining({ username: 'disabled-account' }),
        expect.objectContaining({ username: 'expired-account' }),
      ]),
    );
  });

  it('detects enabled routes with no usable channels', async () => {
    const disabledSiteId = await insertSite({ name: 'Disabled Route Site', status: 'disabled' });
    const disabledAccountId = await insertAccount(disabledSiteId, { username: 'disabled-route-account' });
    const activeSiteId = await insertSite({ name: 'Active Route Site' });
    const expiredAccountId = await insertAccount(activeSiteId, { username: 'expired-route-account', status: 'expired' });
    await db.insert(schema.tokenRoutes).values({
      modelPattern: 'gpt-risky',
      displayName: 'Risky GPT',
      enabled: true,
    }).run();
    const routeWithDisabledChannelId = insertedId(await db.insert(schema.tokenRoutes).values({
      modelPattern: 'gpt-disabled-channel',
      enabled: true,
    }).run());
    await db.insert(schema.routeChannels).values({
      routeId: routeWithDisabledChannelId,
      accountId: disabledAccountId,
      enabled: false,
      failCount: 3,
    }).run();
    const routeWithDisabledSiteChannelId = insertedId(await db.insert(schema.tokenRoutes).values({
      modelPattern: 'gpt-disabled-site-channel',
      enabled: true,
    }).run());
    await db.insert(schema.routeChannels).values({
      routeId: routeWithDisabledSiteChannelId,
      accountId: disabledAccountId,
      enabled: true,
    }).run();
    const routeWithExpiredAccountChannelId = insertedId(await db.insert(schema.tokenRoutes).values({
      modelPattern: 'gpt-expired-account-channel',
      enabled: true,
    }).run());
    await db.insert(schema.routeChannels).values({
      routeId: routeWithExpiredAccountChannelId,
      accountId: expiredAccountId,
      enabled: true,
    }).run();

    const response = await app.inject({ method: 'GET', url: '/api/monitor/overview?refresh=1' });

    expect(response.statusCode).toBe(200);
    expect(response.json().routes).toMatchObject({
      total: 4,
      enabled: 4,
      disabled: 0,
      zeroEnabledChannels: 4,
    });
    expect(response.json().routes.problemItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Risky GPT',
          modelPattern: 'gpt-risky',
          enabledChannelCount: 0,
        }),
        expect.objectContaining({
          modelPattern: 'gpt-disabled-channel',
          channelCount: 1,
          enabledChannelCount: 0,
          failedChannelCount: 1,
        }),
        expect.objectContaining({
          modelPattern: 'gpt-disabled-site-channel',
          channelCount: 1,
          enabledChannelCount: 0,
        }),
        expect.objectContaining({
          modelPattern: 'gpt-expired-account-channel',
          channelCount: 1,
          enabledChannelCount: 0,
        }),
      ]),
    );
  });

  it('queries only recent proxy logs for the overview traffic window', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/server/routes/api/monitor.ts'), 'utf8');

    expect(source).toContain('gte(schema.proxyLogs.createdAt, recentLogCutoffIso)');
    expect(source).not.toContain('db.select().from(schema.proxyLogs).all()');
  });

  it('summarizes recent 24h proxy traffic and ignores older failures', async () => {
    const siteId = await insertSite({ name: 'Traffic Site' });
    const accountId = await insertAccount(siteId, { username: 'traffic-account' });
    const now = Date.now();
    const recentSuccess = new Date(now - 60 * 60 * 1000).toISOString();
    const recentFailure = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const oldFailure = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    await db.insert(schema.proxyLogs).values([
      {
        accountId,
        modelRequested: 'gpt-4o-mini',
        modelActual: 'gpt-4o-mini',
        status: 'success',
        httpStatus: 200,
        latencyMs: 120,
        totalTokens: 1000,
        estimatedCost: 0.01,
        createdAt: recentSuccess,
      },
      {
        accountId,
        modelRequested: 'claude-3.5',
        modelActual: 'claude-3.5',
        status: 'failed',
        httpStatus: 503,
        latencyMs: 300,
        totalTokens: 50,
        estimatedCost: 0.02,
        errorMessage: 'upstream unavailable',
        createdAt: recentFailure,
      },
      {
        accountId,
        modelRequested: 'old-model',
        status: 'failed',
        httpStatus: 500,
        errorMessage: 'old failure',
        createdAt: oldFailure,
      },
    ]).run();

    const response = await app.inject({ method: 'GET', url: '/api/monitor/overview?refresh=1' });

    expect(response.statusCode).toBe(200);
    expect(response.json().traffic24h).toMatchObject({
      total: 2,
      success: 1,
      failed: 1,
      retried: 0,
      successRate: 50,
      averageLatencyMs: 210,
      totalCost: 0.03,
      totalTokens: 1050,
    });
    expect(response.json().traffic24h.recentFailures).toEqual([
      expect.objectContaining({
        modelRequested: 'claude-3.5',
        siteName: 'Traffic Site',
        accountUsername: 'traffic-account',
        httpStatus: 503,
        errorMessage: 'upstream unavailable',
      }),
    ]);
  });

  it.each([
    ['GET', '/api/monitor/config'],
    ['PUT', '/api/monitor/config'],
    ['POST', '/api/monitor/session'],
    ['GET', '/monitor-proxy/ldoh'],
    ['GET', '/monitor-proxy/ldoh/'],
    ['GET', '/monitor-proxy/ldoh/api/status'],
  ] as const)('does not register retired LDOH route %s %s', async (method, url) => {
    const fetchSpy = url.startsWith('/monitor-proxy/ldoh')
      ? vi.spyOn(globalThis, 'fetch')
      : undefined;
    try {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(404);
      if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy?.mockRestore();
    }
  });
});
