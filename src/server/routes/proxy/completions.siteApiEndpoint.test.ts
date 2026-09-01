import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { proxyChannelCoordinator, resetProxyChannelCoordinatorState } from '../../services/proxyChannelCoordinator.js';

const fetchMock = vi.fn();
const selectChannelMock = vi.fn();
const selectNextChannelMock = vi.fn();
const recordSuccessMock = vi.fn();
const recordFailureMock = vi.fn();
const refreshModelsAndRebuildRoutesMock = vi.fn();
const reportProxyAllFailedMock = vi.fn();
const reportTokenExpiredMock = vi.fn();
const insertProxyLogMock = vi.fn();
const resolveProxyUsageWithSelfLogFallbackMock = vi.fn();
const resolveProxyLogBillingMock = vi.fn();

vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  return {
    ...actual,
    fetch: (...args: unknown[]) => fetchMock(...args),
  };
});

vi.mock('../../services/tokenRouter.js', () => ({
  tokenRouter: {
    selectChannel: (...args: unknown[]) => selectChannelMock(...args),
    selectNextChannel: (...args: unknown[]) => selectNextChannelMock(...args),
    recordSuccess: (...args: unknown[]) => recordSuccessMock(...args),
    recordFailure: (...args: unknown[]) => recordFailureMock(...args),
  },
  invalidateTokenRouterCache: vi.fn(),
}));

vi.mock('../../services/routeRefreshWorkflow.js', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/routeRefreshWorkflow.js')>(
      '../../services/routeRefreshWorkflow.js',
    );
  return {
    ...actual,
    refreshModelsAndRebuildRoutes: (...args: unknown[]) =>
      refreshModelsAndRebuildRoutesMock(...args),
  };
});

vi.mock('../../services/alertService.js', () => ({
  reportProxyAllFailed: (...args: unknown[]) => reportProxyAllFailedMock(...args),
  reportTokenExpired: (...args: unknown[]) => reportTokenExpiredMock(...args),
}));

vi.mock('../../services/proxyLogStore.js', () => ({
  insertProxyLog: (...args: unknown[]) => insertProxyLogMock(...args),
}));

vi.mock('../../services/proxyUsageFallbackService.js', () => ({
  resolveProxyUsageWithSelfLogFallback: (...args: unknown[]) => resolveProxyUsageWithSelfLogFallbackMock(...args),
}));

vi.mock('./proxyBilling.js', () => ({
  resolveProxyLogBilling: (...args: unknown[]) => resolveProxyLogBillingMock(...args),
}));

type DbModule = typeof import('../../db/index.js');

describe('/v1/completions site api endpoint rotation', () => {
  let app: FastifyInstance;
  let latestRawRequest: { emit(event: string): boolean } | null = null;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-completions-site-api-endpoint-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./completions.js');
    db = dbModule.db;
    schema = dbModule.schema;

    app = Fastify();
    app.addHook('onRequest', async (request) => {
      latestRawRequest = request.raw;
    });
    await app.register(routesModule.completionsProxyRoute);
  });

  beforeEach(async () => {
    resetProxyChannelCoordinatorState();
    fetchMock.mockReset();
    selectChannelMock.mockReset();
    selectNextChannelMock.mockReset();
    recordSuccessMock.mockReset();
    recordFailureMock.mockReset();
    refreshModelsAndRebuildRoutesMock.mockReset();
    reportProxyAllFailedMock.mockReset();
    reportTokenExpiredMock.mockReset();
    insertProxyLogMock.mockReset();
    resolveProxyUsageWithSelfLogFallbackMock.mockReset();
    resolveProxyLogBillingMock.mockReset();
    latestRawRequest = null;

    resolveProxyUsageWithSelfLogFallbackMock.mockResolvedValue({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    resolveProxyLogBillingMock.mockResolvedValue({
      estimatedCost: 0,
      billingDetails: null,
    });

    await db.delete(schema.proxyLogs).run();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.tokenModelAvailability).run();
    await db.delete(schema.modelAvailability).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.siteApiEndpoints).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATA_DIR;
  });

  it('rejects site admission before fetch, endpoint bookkeeping, or channel retry', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'limited-site',
      url: 'https://console.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'limited-user',
      accessToken: '',
      apiToken: 'sk-limited',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockResolvedValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-limited',
      actualModel: 'gpt-4o-mini',
    });
    const originalQueueLimit = config.proxySiteConcurrencyQueueLimit;
    const originalQueueWaitMs = config.proxySiteConcurrencyQueueWaitMs;
    config.proxySiteConcurrencyQueueLimit = 0;
    config.proxySiteConcurrencyQueueWaitMs = 0;
    const lease = await proxyChannelCoordinator.acquireSiteLease({
      siteId: site.id,
      maxConcurrency: 1,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/completions',
        payload: { model: 'gpt-4o-mini', prompt: 'reject' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.headers['retry-after']).toBe('1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(recordFailureMock).not.toHaveBeenCalled();
      expect(reportProxyAllFailedMock).not.toHaveBeenCalled();
      expect(selectNextChannelMock).not.toHaveBeenCalled();
    } finally {
      lease.release();
      config.proxySiteConcurrencyQueueLimit = originalQueueLimit;
      config.proxySiteConcurrencyQueueWaitMs = originalQueueWaitMs;
    }
  });

  it('removes an aborted queued request before admission without failure or retry bookkeeping', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'queued-abort-site',
      url: 'https://queued-abort.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'queued-abort-user',
      accessToken: '',
      apiToken: 'sk-queued-abort',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    await db.insert(schema.siteApiEndpoints).values({
      siteId: site.id,
      url: 'https://queued-api.example.com',
      enabled: true,
      sortOrder: 0,
    }).run();
    selectChannelMock.mockResolvedValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-queued-abort',
      actualModel: 'gpt-4o-mini',
    });

    const originalQueueLimit = config.proxySiteConcurrencyQueueLimit;
    const originalQueueWaitMs = config.proxySiteConcurrencyQueueWaitMs;
    config.proxySiteConcurrencyQueueLimit = 1;
    config.proxySiteConcurrencyQueueWaitMs = 5_000;
    const blockingLease = await proxyChannelCoordinator.acquireSiteLease({
      siteId: site.id,
      maxConcurrency: 1,
    });
    try {
      const pendingResponse = app.inject({
        method: 'POST',
        url: '/v1/completions',
        payload: { model: 'gpt-4o-mini', prompt: 'disconnect while queued' },
      });
      void pendingResponse.catch(() => {});
      await vi.waitFor(() => {
        expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).waitingCount).toBe(1);
      });

      latestRawRequest?.emit('aborted');
      await vi.waitFor(() => {
        expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).waitingCount).toBe(0);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(recordFailureMock).not.toHaveBeenCalled();
      expect(reportProxyAllFailedMock).not.toHaveBeenCalled();
      expect(reportTokenExpiredMock).not.toHaveBeenCalled();
      expect(selectNextChannelMock).not.toHaveBeenCalled();
    } finally {
      latestRawRequest?.emit('aborted');
      blockingLease.release();
      config.proxySiteConcurrencyQueueLimit = originalQueueLimit;
      config.proxySiteConcurrencyQueueWaitMs = originalQueueWaitMs;
    }
  });

  it('allows a different-site request while another site is saturated', async () => {
    const saturatedSite = await db.insert(schema.sites).values({
      name: 'saturated-site',
      url: 'https://saturated.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const availableSite = await db.insert(schema.sites).values({
      name: 'available-site',
      url: 'https://available.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: availableSite.id,
      username: 'available-user',
      accessToken: '',
      apiToken: 'sk-available',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockResolvedValue({
      channel: { id: 12, routeId: 22 },
      site: availableSite,
      account,
      tokenName: 'default',
      tokenValue: 'sk-available',
      actualModel: 'gpt-4o-mini',
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: 'cmpl-different-site',
      object: 'text_completion',
      choices: [{ text: 'ok' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const blockingLease = await proxyChannelCoordinator.acquireSiteLease({
      siteId: saturatedSite.id,
      maxConcurrency: 1,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/completions',
        payload: { model: 'gpt-4o-mini', prompt: 'different site' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: 'cmpl-different-site' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(saturatedSite.id).activeLeaseCount).toBe(1);
    } finally {
      blockingLease.release();
    }
  });

  it('keeps a streaming lease until EOF and releases it exactly once', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'stream-site',
      url: 'https://stream.example.com',
      platform: 'new-api',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'stream-user',
      accessToken: '',
      apiToken: 'sk-stream',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockResolvedValue({
      channel: { id: 13, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-stream',
      actualModel: 'gpt-4o-mini',
    });

    let upstreamClosed = false;
    let closeUpstream!: () => void;
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"text":"held"}]}\n\n'));
        closeUpstream = () => {
          if (upstreamClosed) return;
          upstreamClosed = true;
          controller.close();
        };
      },
    });
    fetchMock.mockResolvedValue(new Response(upstreamBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));

    const originalAcquire = proxyChannelCoordinator.acquireSiteLease.bind(proxyChannelCoordinator);
    let releaseMock = vi.fn();
    const acquireSpy = vi.spyOn(proxyChannelCoordinator, 'acquireSiteLease').mockImplementation(async (input) => {
      const lease = await originalAcquire(input);
      const release = lease.release;
      releaseMock = vi.fn(() => release());
      return { ...lease, release: releaseMock };
    });
    try {
      const pendingResponse = app.inject({
        method: 'POST',
        url: '/v1/completions',
        payload: { model: 'gpt-4o-mini', prompt: 'stream', stream: true },
      });
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).activeLeaseCount).toBe(1);
      });
      expect(releaseMock).not.toHaveBeenCalled();

      closeUpstream();
      const response = await pendingResponse;

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('held');
      expect(releaseMock).toHaveBeenCalledTimes(1);
      expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).activeLeaseCount).toBe(0);
    } finally {
      acquireSpy.mockRestore();
      closeUpstream?.();
    }
  });

  it('cools down a retryable failed endpoint and retries the next endpoint within the same site', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'nihao-panel',
      url: 'https://console.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'nihao-user',
      accessToken: '',
      apiToken: 'sk-nihao',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();

    await db.insert(schema.siteApiEndpoints).values([
      {
        siteId: site.id,
        url: 'https://api-a.example.com',
        enabled: true,
        sortOrder: 0,
      },
      {
        siteId: site.id,
        url: 'https://api-b.example.com',
        enabled: true,
        sortOrder: 1,
      },
    ]).run();

    selectChannelMock.mockResolvedValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-nihao',
      actualModel: 'gpt-4o-mini',
    });
    selectNextChannelMock.mockResolvedValue(null);

    fetchMock
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'cmpl-ok',
        object: 'text_completion',
        choices: [{ text: 'ok' }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/completions',
      headers: {
        authorization: 'Bearer sk-downstream',
      },
      payload: {
        model: 'gpt-4o-mini',
        prompt: 'hello',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'cmpl-ok',
      object: 'text_completion',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toBe('https://api-a.example.com/v1/completions');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toBe('https://api-b.example.com/v1/completions');
    expect(selectNextChannelMock).not.toHaveBeenCalled();
    expect(recordFailureMock).not.toHaveBeenCalled();
    expect(recordSuccessMock).toHaveBeenCalledTimes(1);

    const storedEndpoints = await db.select().from(schema.siteApiEndpoints)
      .where(eq(schema.siteApiEndpoints.siteId, site.id))
      .orderBy(asc(schema.siteApiEndpoints.sortOrder), asc(schema.siteApiEndpoints.id))
      .all();
    expect(storedEndpoints[0]).toMatchObject({
      url: 'https://api-a.example.com',
      lastFailureReason: 'HTTP 502: bad gateway',
    });
    expect(storedEndpoints[0]?.cooldownUntil).toBeTruthy();
    expect(storedEndpoints[1]).toMatchObject({
      url: 'https://api-b.example.com',
    });
    expect(storedEndpoints[1]?.lastSelectedAt).toBeTruthy();
  });
});
