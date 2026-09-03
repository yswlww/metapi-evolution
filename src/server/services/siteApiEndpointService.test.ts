import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';

type DbModule = typeof import('../db/index.js');
type SiteApiEndpointServiceModule = typeof import('./siteApiEndpointService.js');

describe('siteApiEndpointService', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let selectSiteApiEndpointTarget: SiteApiEndpointServiceModule['selectSiteApiEndpointTarget'];
  let recordSiteApiEndpointFailure: SiteApiEndpointServiceModule['recordSiteApiEndpointFailure'];
  let recordSiteApiEndpointSuccess: SiteApiEndpointServiceModule['recordSiteApiEndpointSuccess'];
  let runWithProxySiteApiEndpointPool: SiteApiEndpointServiceModule['runWithProxySiteApiEndpointPool'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-site-api-endpoint-service-'));
    process.env.DATA_DIR = dataDir;

    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    const serviceModule = await import('./siteApiEndpointService.js');

    db = dbModule.db;
    schema = dbModule.schema;
    selectSiteApiEndpointTarget = serviceModule.selectSiteApiEndpointTarget;
    recordSiteApiEndpointFailure = serviceModule.recordSiteApiEndpointFailure;
    recordSiteApiEndpointSuccess = serviceModule.recordSiteApiEndpointSuccess;
    runWithProxySiteApiEndpointPool = serviceModule.runWithProxySiteApiEndpointPool;
  });

  beforeEach(async () => {
    await db.delete(schema.siteApiEndpoints).run();
    await db.delete(schema.sites).run();
    const { resetProxyChannelCoordinatorState } = await import('./proxyChannelCoordinator.js');
    resetProxyChannelCoordinatorState();
  });

  afterAll(() => {
    delete process.env.DATA_DIR;
  });

  it('returns a synthetic site-url fallback when the site has no configured api endpoints', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'panel-only-site',
      url: 'https://panel.example.com/',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const selected = await selectSiteApiEndpointTarget(site, '2026-03-31T12:00:00.000Z');

    expect(selected).toMatchObject({
      kind: 'site-fallback',
      siteId: site.id,
      endpointId: null,
      baseUrl: 'https://panel.example.com',
      configuredEndpointCount: 0,
    });
  });

  it('selects the least recently selected enabled endpoint when sort order is tied', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'pool-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    await db.insert(schema.siteApiEndpoints).values([
      {
        siteId: site.id,
        url: 'https://api-b.example.com',
        enabled: true,
        sortOrder: 1,
        lastSelectedAt: '2026-03-31T11:59:00.000Z',
      },
      {
        siteId: site.id,
        url: 'https://api-a.example.com/',
        enabled: true,
        sortOrder: 0,
        lastSelectedAt: '2026-03-31T11:00:00.000Z',
      },
    ]).run();

    const selected = await selectSiteApiEndpointTarget(site, '2026-03-31T12:00:00.000Z');

    expect(selected).toMatchObject({
      kind: 'endpoint',
      siteId: site.id,
      baseUrl: 'https://api-a.example.com',
      configuredEndpointCount: 2,
      endpoint: expect.objectContaining({
        url: 'https://api-a.example.com/',
        sortOrder: 0,
      }),
    });
  });

  it('prefers lower sortOrder before lastSelectedAt when selecting an enabled endpoint', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'ordered-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    await db.insert(schema.siteApiEndpoints).values([
      {
        siteId: site.id,
        url: 'https://api-secondary.example.com',
        enabled: true,
        sortOrder: 1,
        lastSelectedAt: '2026-03-31T11:00:00.000Z',
      },
      {
        siteId: site.id,
        url: 'https://api-primary.example.com',
        enabled: true,
        sortOrder: 0,
        lastSelectedAt: '2026-03-31T11:59:00.000Z',
      },
    ]).run();

    const selected = await selectSiteApiEndpointTarget(site, '2026-03-31T12:00:00.000Z');

    expect(selected).toMatchObject({
      kind: 'endpoint',
      siteId: site.id,
      baseUrl: 'https://api-primary.example.com',
      configuredEndpointCount: 2,
      endpoint: expect.objectContaining({
        url: 'https://api-primary.example.com',
        sortOrder: 0,
      }),
    });
  });

  it('skips disabled endpoints and endpoints that are still cooling down', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'filtered-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    await db.insert(schema.siteApiEndpoints).values([
      {
        siteId: site.id,
        url: 'https://api-disabled.example.com',
        enabled: false,
        sortOrder: 0,
      },
      {
        siteId: site.id,
        url: 'https://api-cooling.example.com',
        enabled: true,
        sortOrder: 1,
        cooldownUntil: '2026-03-31T12:05:00.000Z',
      },
      {
        siteId: site.id,
        url: 'https://api-ready.example.com',
        enabled: true,
        sortOrder: 2,
        cooldownUntil: '2026-03-31T11:55:00.000Z',
      },
    ]).run();

    const selected = await selectSiteApiEndpointTarget(site, '2026-03-31T12:00:00.000Z');

    expect(selected).toMatchObject({
      kind: 'endpoint',
      baseUrl: 'https://api-ready.example.com',
      configuredEndpointCount: 3,
    });
  });

  it('returns null when the site has configured api endpoints but none are currently eligible', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'exhausted-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    await db.insert(schema.siteApiEndpoints).values([
      {
        siteId: site.id,
        url: 'https://api-disabled.example.com',
        enabled: false,
        sortOrder: 0,
      },
      {
        siteId: site.id,
        url: 'https://api-cooling.example.com',
        enabled: true,
        sortOrder: 1,
        cooldownUntil: '2026-03-31T12:05:00.000Z',
      },
    ]).run();

    const selected = await selectSiteApiEndpointTarget(site, '2026-03-31T12:00:00.000Z');

    expect(selected).toBeNull();
  });

  it('records retryable failures with a 5-minute cooldown', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'retryable-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const endpoint = await db.insert(schema.siteApiEndpoints).values({
      siteId: site.id,
      url: 'https://api-retryable.example.com',
      enabled: true,
      sortOrder: 0,
    }).returning().get();

    const result = await recordSiteApiEndpointFailure(endpoint.id, {
      status: 502,
      message: 'Bad gateway',
    }, '2026-03-31T12:00:00.000Z');

    expect(result).toMatchObject({
      retryable: true,
      rotateToNextEndpoint: true,
      cooldownUntil: '2026-03-31T12:05:00.000Z',
      failureReason: 'HTTP 502: Bad gateway',
    });

    const stored = await db.select().from(schema.siteApiEndpoints)
      .where(eq(schema.siteApiEndpoints.id, endpoint.id))
      .get();
    expect(stored).toMatchObject({
      cooldownUntil: '2026-03-31T12:05:00.000Z',
      lastFailedAt: '2026-03-31T12:00:00.000Z',
      lastFailureReason: 'HTTP 502: Bad gateway',
    });
  });

  it('parses retryable HTTP status codes from failure messages when no explicit status is provided', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'message-status-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const endpoint = await db.insert(schema.siteApiEndpoints).values({
      siteId: site.id,
      url: 'https://api-message-status.example.com',
      enabled: true,
      sortOrder: 0,
    }).returning().get();

    const result = await recordSiteApiEndpointFailure(endpoint.id, {
      message: 'HTTP 502: upstream temporarily unavailable',
    }, '2026-03-31T12:00:00.000Z');

    expect(result).toMatchObject({
      retryable: true,
      rotateToNextEndpoint: true,
      cooldownUntil: '2026-03-31T12:05:00.000Z',
      failureReason: 'HTTP 502: upstream temporarily unavailable',
    });
  });

  it('records auth and validation failures without triggering cooldown rotation', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'non-retryable-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const endpoint = await db.insert(schema.siteApiEndpoints).values({
      siteId: site.id,
      url: 'https://api-auth.example.com',
      enabled: true,
      sortOrder: 0,
      cooldownUntil: '2026-03-31T11:00:00.000Z',
    }).returning().get();

    const result = await recordSiteApiEndpointFailure(endpoint.id, {
      status: 401,
      message: 'Invalid token',
    }, '2026-03-31T12:00:00.000Z');

    expect(result).toMatchObject({
      retryable: false,
      rotateToNextEndpoint: false,
      cooldownUntil: null,
      failureReason: 'HTTP 401: Invalid token',
    });

    const stored = await db.select().from(schema.siteApiEndpoints)
      .where(eq(schema.siteApiEndpoints.id, endpoint.id))
      .get();
    expect(stored).toMatchObject({
      cooldownUntil: null,
      lastFailedAt: '2026-03-31T12:00:00.000Z',
      lastFailureReason: 'HTTP 401: Invalid token',
    });
  });

  it('clears cooldown metadata and updates lastSelectedAt after a recorded success', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'success-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const endpoint = await db.insert(schema.siteApiEndpoints).values({
      siteId: site.id,
      url: 'https://api-success.example.com',
      enabled: true,
      sortOrder: 0,
      cooldownUntil: '2026-03-31T12:05:00.000Z',
      lastFailedAt: '2026-03-31T12:00:00.000Z',
      lastFailureReason: 'HTTP 502: Bad gateway',
    }).returning().get();

    await recordSiteApiEndpointSuccess(endpoint.id, '2026-03-31T12:01:00.000Z');

    const stored = await db.select().from(schema.siteApiEndpoints)
      .where(eq(schema.siteApiEndpoints.id, endpoint.id))
      .orderBy(asc(schema.siteApiEndpoints.id))
      .get();
    expect(stored).toMatchObject({
      cooldownUntil: null,
      lastSelectedAt: '2026-03-31T12:01:00.000Z',
      lastFailureReason: null,
    });
  });

  it('looks up the current database limit instead of trusting a stale selected site object', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'request-time-limit-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const staleSite = { ...site, maxConcurrency: null };
    const operation = vi.fn(async (_target: any, lease: any) => {
      expect(lease.isActive()).toBe(true);
      return 'ok';
    });

    await expect(runWithProxySiteApiEndpointPool(staleSite, operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);

    await db.update(schema.sites).set({ maxConcurrency: null }).where(eq(schema.sites.id, site.id)).run();
    const unlimitedOperation = vi.fn(async (_target: any, lease: any) => {
      expect(lease.isActive()).toBe(false);
      return 'unlimited';
    });
    await expect(runWithProxySiteApiEndpointPool({ ...site, maxConcurrency: 1 }, unlimitedOperation)).resolves.toBe('unlimited');
  });

  it('holds one lease across retryable endpoint rotation and releases after the operation', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'retry-lease-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    await db.insert(schema.siteApiEndpoints).values([
      { siteId: site.id, url: 'https://api-primary.example.com', enabled: true, sortOrder: 0 },
      { siteId: site.id, url: 'https://api-secondary.example.com', enabled: true, sortOrder: 1 },
    ]).run();
    const { proxyChannelCoordinator } = await import('./proxyChannelCoordinator.js');
    const { SiteApiEndpointRequestError } = await import('./siteApiEndpointService.js');
    const operation = vi.fn(async (target: any, lease: any) => {
      expect(lease.isActive()).toBe(true);
      if (operation.mock.calls.length === 1) {
        throw new SiteApiEndpointRequestError('Bad gateway', { status: 502 });
      }
      return target.baseUrl;
    });

    await expect(runWithProxySiteApiEndpointPool(site, operation)).resolves.toBe('https://api-secondary.example.com');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).activeLeaseCount).toBe(0);
  });

  it('leaves internal endpoint-pool callers outside site concurrency admission', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'internal-pool-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const { proxyChannelCoordinator } = await import('./proxyChannelCoordinator.js');
    const heldLease = await proxyChannelCoordinator.acquireSiteLease({ siteId: site.id, maxConcurrency: 1 });
    const { runWithSiteApiEndpointPool } = await import('./siteApiEndpointService.js');

    await expect(runWithSiteApiEndpointPool(site, async () => 'internal')).resolves.toBe('internal');
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).activeLeaseCount).toBe(1);
    heldLease.release();
  });

  it('rejects at site admission before endpoint failure bookkeeping', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'admission-order-site',
      url: 'https://panel.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const endpoint = await db.insert(schema.siteApiEndpoints).values({
      siteId: site.id,
      url: 'https://api-admission.example.com',
      enabled: true,
      sortOrder: 0,
    }).returning().get();
    const { config } = await import('../config.js');
    const { proxyChannelCoordinator, SiteConcurrencyLimitError } = await import('./proxyChannelCoordinator.js');
    const originalQueueLimit = config.proxySiteConcurrencyQueueLimit;
    const originalQueueWait = config.proxySiteConcurrencyQueueWaitMs;
    config.proxySiteConcurrencyQueueLimit = 0;
    config.proxySiteConcurrencyQueueWaitMs = 0;
    const heldLease = await proxyChannelCoordinator.acquireSiteLease({ siteId: site.id, maxConcurrency: 1 });
    try {
      const operation = vi.fn(async () => 'should not run');
      await expect(runWithProxySiteApiEndpointPool(site, operation)).rejects.toBeInstanceOf(SiteConcurrencyLimitError);
      expect(operation).not.toHaveBeenCalled();
      const stored = await db.select().from(schema.siteApiEndpoints).where(eq(schema.siteApiEndpoints.id, endpoint.id)).get();
      expect(stored?.lastFailedAt).toBeNull();
      expect(stored?.lastFailureReason).toBeNull();
    } finally {
      heldLease.release();
      config.proxySiteConcurrencyQueueLimit = originalQueueLimit;
      config.proxySiteConcurrencyQueueWaitMs = originalQueueWait;
    }
  });
});
