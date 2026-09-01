import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { proxyChannelCoordinator, resetProxyChannelCoordinatorState } from '../../services/proxyChannelCoordinator.js';
import { resetUpstreamEndpointRuntimeState } from '../../services/upstreamEndpointRuntimeMemory.js';

const fetchMock = vi.fn();
const selectChannelMock = vi.fn();
const selectNextChannelMock = vi.fn();
const recordSuccessMock = vi.fn();
const recordFailureMock = vi.fn();
const refreshModelsAndRebuildRoutesMock = vi.fn();
const reportProxyAllFailedMock = vi.fn();
const reportTokenExpiredMock = vi.fn();
const estimateProxyCostMock = vi.fn(async (_arg?: any) => 0);
const buildProxyBillingDetailsMock = vi.fn(async (_arg?: any) => null);
const fetchModelPricingCatalogMock = vi.fn(async (_arg?: any): Promise<any> => null);
const resolveProxyUsageWithSelfLogFallbackMock = vi.fn(async ({ usage }: any) => ({
  ...usage,
  estimatedCostFromQuota: 0,
  recoveredFromSelfLog: false,
}));
const insertProxyLogMock = vi.fn();

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
}));

vi.mock('../../services/modelService.js', () => ({
  refreshModelsAndRebuildRoutes: (...args: unknown[]) => refreshModelsAndRebuildRoutesMock(...args),
}));

vi.mock('../../services/alertService.js', () => ({
  reportProxyAllFailed: (...args: unknown[]) => reportProxyAllFailedMock(...args),
  reportTokenExpired: (...args: unknown[]) => reportTokenExpiredMock(...args),
}));

vi.mock('../../services/alertRules.js', () => ({
  isTokenExpiredError: () => false,
}));

vi.mock('../../services/modelPricingService.js', () => ({
  estimateProxyCost: (arg: any) => estimateProxyCostMock(arg),
  buildProxyBillingDetails: (arg: any) => buildProxyBillingDetailsMock(arg),
  fetchModelPricingCatalog: (arg: any) => fetchModelPricingCatalogMock(arg),
}));

vi.mock('../../services/proxyRetryPolicy.js', () => ({
  shouldRetryProxyRequest: () => false,
  shouldAbortSameSiteEndpointFallback: () => false,
  RETRYABLE_TIMEOUT_PATTERNS: [/(request timed out|connection timed out|read timeout|\btimed out\b)/i],
}));

vi.mock('../../services/proxyUsageFallbackService.js', () => ({
  resolveProxyUsageWithSelfLogFallback: (arg: any) => resolveProxyUsageWithSelfLogFallbackMock(arg),
}));

vi.mock('../../services/oauth/quota.js', () => ({
  recordOauthQuotaHeadersSnapshot: async () => undefined,
  recordOauthQuotaResetHint: async () => undefined,
}));

vi.mock('../../services/proxyLogStore.js', () => ({
  insertProxyLog: (...args: unknown[]) => insertProxyLogMock(...args),
}));

type DbModule = typeof import('../../db/index.js');

describe('chat proxy site api endpoint rotation', () => {
  let app: FastifyInstance;
  let latestRawRequest: { emit(event: string): boolean } | null = null;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-chat-site-api-endpoint-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./chat.js');
    db = dbModule.db;
    schema = dbModule.schema;

    app = Fastify();
    app.addHook('onRequest', async (request) => {
      latestRawRequest = request.raw;
    });
    await app.register(routesModule.chatProxyRoute);
  });

  beforeEach(async () => {
    resetProxyChannelCoordinatorState();
    latestRawRequest = null;
    fetchMock.mockReset();
    selectChannelMock.mockReset();
    selectNextChannelMock.mockReset();
    recordSuccessMock.mockReset();
    recordFailureMock.mockReset();
    refreshModelsAndRebuildRoutesMock.mockReset();
    reportProxyAllFailedMock.mockReset();
    reportTokenExpiredMock.mockReset();
    estimateProxyCostMock.mockClear();
    buildProxyBillingDetailsMock.mockClear();
    fetchModelPricingCatalogMock.mockReset();
    resolveProxyUsageWithSelfLogFallbackMock.mockClear();
    insertProxyLogMock.mockReset();
    resetUpstreamEndpointRuntimeState();

    await db.delete(schema.proxyLogs).run();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.tokenModelAvailability).run();
    await db.delete(schema.modelAvailability).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.siteApiEndpoints).run();
    await db.delete(schema.sites).run();

    fetchModelPricingCatalogMock.mockResolvedValue(null);
    (config as any).codexHeaderDefaults = {
      userAgent: '',
      betaFeatures: '',
    };
    (config as any).payloadRules = {
      default: [],
      defaultRaw: [],
      override: [],
      overrideRaw: [],
      filter: [],
    };
    (config as any).disableCrossProtocolFallback = false;
    config.proxyEmptyContentFailEnabled = false;
    config.proxyErrorKeywords = [];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.DATA_DIR;
  });

  it('queues a saturated chat request and returns 503 on admission timeout without failure bookkeeping', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'chat-wait-timeout-site',
      url: 'https://chat-wait-timeout.example.com',
      platform: 'openai',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'chat-wait-timeout-user',
      accessToken: '',
      apiToken: 'sk-chat-wait-timeout',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockReturnValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-chat-wait-timeout',
      actualModel: 'gpt-4o-mini',
    });
    const originalQueueLimit = config.proxySiteConcurrencyQueueLimit;
    const originalQueueWaitMs = config.proxySiteConcurrencyQueueWaitMs;
    config.proxySiteConcurrencyQueueLimit = 1;
    config.proxySiteConcurrencyQueueWaitMs = 250;
    const blockingLease = await proxyChannelCoordinator.acquireSiteLease({
      siteId: site.id,
      maxConcurrency: 1,
    });
    try {
      const pendingResponse = app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'wait then time out' }],
        },
      });
      await vi.waitFor(() => {
        expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).waitingCount).toBe(1);
      });

      const response = await pendingResponse;

      expect(response.statusCode).toBe(503);
      expect(response.headers['retry-after']).toBe('1');
      expect(response.json()).toEqual({
        error: {
          type: 'site_concurrency_limit',
          message: 'Site concurrency limit reached',
        },
      });
      expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(site.id).waitingCount).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(recordFailureMock).not.toHaveBeenCalled();
      expect(reportProxyAllFailedMock).not.toHaveBeenCalled();
      expect(selectNextChannelMock).not.toHaveBeenCalled();
    } finally {
      blockingLease.release();
      config.proxySiteConcurrencyQueueLimit = originalQueueLimit;
      config.proxySiteConcurrencyQueueWaitMs = originalQueueWaitMs;
    }
  });

  it('removes an aborted queued chat request without failure or retry bookkeeping', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'chat-queued-abort-site',
      url: 'https://chat-queued-abort.example.com',
      platform: 'openai',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'chat-queued-abort-user',
      accessToken: '',
      apiToken: 'sk-chat-queued-abort',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockReturnValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-chat-queued-abort',
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
        url: '/v1/chat/completions',
        payload: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'disconnect while queued' }],
        },
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
      expect(selectNextChannelMock).not.toHaveBeenCalled();
    } finally {
      latestRawRequest?.emit('aborted');
      blockingLease.release();
      config.proxySiteConcurrencyQueueLimit = originalQueueLimit;
      config.proxySiteConcurrencyQueueWaitMs = originalQueueWaitMs;
    }
  });

  it('returns site concurrency 503 without recording a provider failure or retrying', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'chat-limited-site',
      url: 'https://chat-limited.example.com',
      platform: 'openai',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'chat-limited-user',
      accessToken: '',
      apiToken: 'sk-chat-limited',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockReturnValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-chat-limited',
      actualModel: 'gpt-4o-mini',
    });
    const originalQueueLimit = config.proxySiteConcurrencyQueueLimit;
    const originalQueueWaitMs = config.proxySiteConcurrencyQueueWaitMs;
    config.proxySiteConcurrencyQueueLimit = 0;
    config.proxySiteConcurrencyQueueWaitMs = 0;
    const blockingLease = await proxyChannelCoordinator.acquireSiteLease({
      siteId: site.id,
      maxConcurrency: 1,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'limited' }],
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.headers['retry-after']).toBe('1');
      expect(response.json()).toEqual({
        error: {
          type: 'site_concurrency_limit',
          message: 'Site concurrency limit reached',
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(recordFailureMock).not.toHaveBeenCalled();
      expect(reportProxyAllFailedMock).not.toHaveBeenCalled();
      expect(selectNextChannelMock).not.toHaveBeenCalled();
    } finally {
      blockingLease.release();
      config.proxySiteConcurrencyQueueLimit = originalQueueLimit;
      config.proxySiteConcurrencyQueueWaitMs = originalQueueWaitMs;
    }
  });

  it('allows chat requests to another site while a limited site is saturated', async () => {
    const saturatedSite = await db.insert(schema.sites).values({
      name: 'chat-saturated-site',
      url: 'https://chat-saturated.example.com',
      platform: 'openai',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const availableSite = await db.insert(schema.sites).values({
      name: 'chat-available-site',
      url: 'https://chat-available.example.com',
      platform: 'openai',
      status: 'active',
      maxConcurrency: 1,
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: availableSite.id,
      username: 'chat-available-user',
      accessToken: '',
      apiToken: 'sk-chat-available',
      status: 'active',
      checkinEnabled: false,
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    selectChannelMock.mockReturnValue({
      channel: { id: 12, routeId: 22 },
      site: availableSite,
      account,
      tokenName: 'default',
      tokenValue: 'sk-chat-available',
      actualModel: 'gpt-4o-mini',
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-independent-site',
      object: 'chat.completion',
      created: 1_706_000_000,
      model: 'gpt-4o-mini',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'independent' },
        finish_reason: 'stop',
      }],
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
        url: '/v1/chat/completions',
        payload: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'other site' }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: 'chatcmpl-independent-site' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(saturatedSite.id).activeLeaseCount).toBe(1);
    } finally {
      blockingLease.release();
    }
  });

  it('rotates to the next configured ai endpoint for retryable /v1/chat/completions failures', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'nihao-panel',
      url: 'https://console.example.com',
      platform: 'openai',
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

    selectChannelMock.mockReturnValue({
      channel: { id: 11, routeId: 22 },
      site,
      account,
      tokenName: 'default',
      tokenValue: 'sk-nihao',
      actualModel: 'gpt-4o-mini',
    });
    selectNextChannelMock.mockReturnValue(null);

    fetchMock
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('bad gateway via responses', { status: 502 }))
      .mockResolvedValueOnce(new Response('bad gateway via messages', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'chatcmpl-ok',
        object: 'chat.completion',
        created: 1_706_000_000,
        model: 'gpt-4o-mini',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'ok via api-b' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()?.choices?.[0]?.message?.content).toBe('ok via api-b');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toBe('https://api-a.example.com/v1/responses');
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toBe('https://api-a.example.com/v1/chat/completions');
    expect(String(fetchMock.mock.calls[2]?.[0] || '')).toBe('https://api-a.example.com/v1/messages');
    expect(String(fetchMock.mock.calls[3]?.[0] || '')).toBe('https://api-b.example.com/v1/responses');
    expect(selectNextChannelMock).not.toHaveBeenCalled();
    expect(recordFailureMock).not.toHaveBeenCalled();
    expect(recordSuccessMock).toHaveBeenCalledTimes(1);

    const storedEndpoints = await db.select().from(schema.siteApiEndpoints)
      .where(eq(schema.siteApiEndpoints.siteId, site.id))
      .orderBy(asc(schema.siteApiEndpoints.sortOrder), asc(schema.siteApiEndpoints.id))
      .all();
    expect(storedEndpoints[0]).toMatchObject({
      url: 'https://api-a.example.com',
      lastFailureReason: 'HTTP 502: [upstream:/v1/messages] Upstream returned HTTP 502: bad gateway via messages',
    });
    expect(storedEndpoints[0]?.cooldownUntil).toBeTruthy();
    expect(storedEndpoints[1]?.lastSelectedAt).toBeTruthy();
  });
});
