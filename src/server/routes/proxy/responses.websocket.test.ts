import Fastify, { type FastifyInstance } from 'fastify';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../config.js';
import { createProxyAuthRateLimitHook } from '../../middleware/auth.js';
import { createGlobalRateLimitHook, registerGlobalRateLimit } from '../../middleware/globalRateLimit.js';
import { resetRequestRateLimitStore } from '../../middleware/requestRateLimit.js';
import { resetCodexSessionResponseStore } from '../../proxy-core/runtime/codexSessionResponseStore.js';

const fetchMock = vi.fn();
const selectChannelMock = vi.fn();
const selectNextChannelMock = vi.fn();
const selectPreferredChannelMock = vi.fn();
const previewSelectedChannelMock = vi.fn();
const recordSuccessMock = vi.fn();
const recordFailureMock = vi.fn();
const authorizeDownstreamTokenMock = vi.fn();
const consumeManagedKeyRequestMock = vi.fn();
const recordManagedKeyCostUsageMock = vi.fn();
const refreshModelsAndRebuildRoutesMock = vi.fn();
const reportProxyAllFailedMock = vi.fn();
const reportTokenExpiredMock = vi.fn();
const resolveProxyUsageWithSelfLogFallbackMock = vi.fn(async ({ usage }: any) => ({
  ...usage,
  estimatedCostFromQuota: 0,
  recoveredFromSelfLog: false,
}));
const trackedClientSockets = new Set<WebSocket>();
let siteApiEndpointRows: Array<Record<string, unknown>> = [];
const dbInsertMock = vi.fn((_arg?: any) => ({
  values: () => ({
    run: () => undefined,
  }),
}));

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
    selectPreferredChannel: (...args: unknown[]) => selectPreferredChannelMock(...args),
    previewSelectedChannel: (...args: unknown[]) => previewSelectedChannelMock(...args),
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

vi.mock('../../services/downstreamApiKeyService.js', () => ({
  authorizeDownstreamToken: (...args: unknown[]) => authorizeDownstreamTokenMock(...args),
  consumeManagedKeyRequest: (...args: unknown[]) => consumeManagedKeyRequestMock(...args),
  recordManagedKeyCostUsage: (...args: unknown[]) => recordManagedKeyCostUsageMock(...args),
  isModelAllowedByPolicyOrAllowedRoutes: async (
    model: string,
    policy: { supportedModels?: string[]; allowedRouteIds?: number[]; denyAllWhenEmpty?: boolean },
  ) => {
    const supportedModels = Array.isArray(policy?.supportedModels) ? policy.supportedModels : [];
    const allowedRouteIds = Array.isArray(policy?.allowedRouteIds) ? policy.allowedRouteIds : [];
    if (supportedModels.length === 0 && allowedRouteIds.length === 0) {
      return policy?.denyAllWhenEmpty === true ? false : true;
    }
    return supportedModels.includes(model);
  },
}));

vi.mock('../../services/alertRules.js', () => ({
  isTokenExpiredError: () => false,
}));

vi.mock('../../services/modelPricingService.js', () => ({
  estimateProxyCost: async () => 0,
  buildProxyBillingDetails: async () => null,
  fetchModelPricingCatalog: async () => null,
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

vi.mock('../../db/index.js', () => ({
  db: {
    insert: (arg: any) => dbInsertMock(arg),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            all: async () => siteApiEndpointRows,
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: async () => undefined,
        }),
      }),
    }),
  },
  hasProxyLogBillingDetailsColumn: async () => false,
  hasProxyLogClientColumns: async () => false,
  hasProxyLogDownstreamApiKeyIdColumn: async () => false,
  hasProxyLogStreamTimingColumns: async () => false,
  schema: {
    proxyLogs: {},
    siteApiEndpoints: {
      id: {},
      siteId: {},
      sortOrder: {},
    },
  },
}));

function createSseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }), {
    status,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

function createSelectedChannel(options?: {
  siteName?: string;
  siteUrl?: string;
  sitePlatform?: string;
  username?: string;
  extraConfig?: unknown;
  tokenValue?: string;
  actualModel?: string;
}) {
  const sitePlatform = options?.sitePlatform ?? 'codex';
  const isCodex = sitePlatform === 'codex';
  return {
    channel: { id: 11, routeId: 22 },
    site: {
      id: 44,
      name: options?.siteName ?? (isCodex ? 'codex-site' : 'openai-site'),
      url: options?.siteUrl ?? (isCodex ? 'https://chatgpt.com/backend-api/codex' : 'https://api.openai.com'),
      platform: sitePlatform,
    },
    account: {
      id: 33,
      username: options?.username ?? (isCodex ? 'codex-user@example.com' : 'openai-user@example.com'),
      extraConfig: options?.extraConfig ?? (isCodex
        ? JSON.stringify({
          credentialMode: 'session',
          oauth: {
            provider: 'codex',
            accountId: 'chatgpt-account-123',
            email: 'codex-user@example.com',
          },
        })
        : '{}'),
    },
    tokenName: 'default',
    tokenValue: options?.tokenValue ?? (isCodex ? 'oauth-access-token' : 'sk-openai-token'),
    actualModel: options?.actualModel ?? (isCodex ? 'gpt-5.4' : 'gpt-4.1'),
  };
}

function waitForSocketOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
}

function waitForSocketClose(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', () => resolve());
  });
}

function waitForSocketUpgrade(socket: WebSocket) {
  return new Promise<{ headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    socket.once('upgrade', (response) => resolve({ headers: response.headers as Record<string, string | string[] | undefined> }));
    socket.once('error', reject);
  });
}

function waitForSocketUnexpectedResponse(socket: WebSocket) {
  return new Promise<{
    statusCode: number | undefined;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    socket.once('unexpected-response', (_request, response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.once('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers as Record<string, string | string[] | undefined>,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.once('error', reject);
    });
    socket.once('error', reject);
  });
}

function waitForSocketUpgradeOutcome(socket: WebSocket) {
  return new Promise<{
    statusCode: number | undefined;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const onUpgrade = (response: { statusCode?: number; headers: Record<string, string | string[] | undefined> }) => {
      resolve({
        statusCode: response.statusCode ?? 101,
        headers: response.headers,
        body: '',
      });
    };
    socket.once('upgrade', onUpgrade);
    socket.once('unexpected-response', (_request, response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.once('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers as Record<string, string | string[] | undefined>,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.once('error', reject);
    });
    socket.once('error', reject);
  });
}

function waitForSocketMessages(socket: WebSocket, count: number, timeoutMs = 1000) {
  return new Promise<any[]>((resolve, reject) => {
    const messages: any[] = [];
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      socket.off('error', onError);
      reject(new Error(`Timed out waiting for ${count} websocket messages`));
    }, timeoutMs);
    const onMessage = (payload: WebSocket.RawData) => {
      messages.push(JSON.parse(String(payload)));
      if (messages.length >= count) {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        socket.off('error', onError);
        resolve(messages);
      }
    };
    const onError = (error: Error) => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      reject(error);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
  });
}

function waitForSocketMessageMatching(
  socket: WebSocket,
  predicate: (message: any) => boolean,
  timeoutMs = 1000,
) {
  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      socket.off('error', onError);
      reject(new Error('Timed out waiting for matching websocket message'));
    }, timeoutMs);
    const onMessage = (payload: WebSocket.RawData) => {
      const message = JSON.parse(String(payload));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
      resolve(message);
    };
    const onError = (error: Error) => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      reject(error);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createClientSocket(baseUrl: string, headers: Record<string, string> = {}) {
  const socket = new WebSocket(`${baseUrl}/v1/responses`, {
    headers: {
      Authorization: 'Bearer sk-global-proxy-token',
      ...headers,
    },
  });
  trackedClientSockets.add(socket);
  socket.once('close', () => {
    trackedClientSockets.delete(socket);
  });
  return socket;
}

function createClientSocketForPath(path: string, headers: Record<string, string> = {}) {
  const socket = new WebSocket(path, { headers });
  trackedClientSockets.add(socket);
  socket.once('close', () => {
    trackedClientSockets.delete(socket);
  });
  return socket;
}

describe('responses websocket transport', () => {
  const originalCodexResponsesWebsocketBeta = config.codexResponsesWebsocketBeta;
  const originalCodexUpstreamWebsocketEnabled = config.codexUpstreamWebsocketEnabled;
  const originalRequestRateLimitMax = config.requestRateLimitMax;
  const originalRequestRateLimitWindowMs = config.requestRateLimitWindowMs;
  const originalAuthenticatedRateLimitMax = config.authenticatedRateLimitMax;
  let app: FastifyInstance;
  let baseUrl: string;
  let upstreamServer: WebSocketServer;
  let upstreamSockets: Set<WebSocket>;
  let upstreamSiteUrl: string;
  let upstreamConnectionCount: number;
  let upstreamUpgradeHeaders: Record<string, string>;
  let upstreamRequests: Record<string, unknown>[];
  let upstreamMessageHandler: (socket: WebSocket, parsed: Record<string, unknown>, requestIndex: number) => void;
  let rejectedUpgradeServer: Server;
  let rejectedUpgradeSiteUrl: string;
  let rejectedUpgradeStatus: number;
  let rejectedUpgradeStatusText: string;
  let rejectedUpgradeBody: string;

  beforeAll(async () => {
    const { responsesProxyRoute } = await import('./responses.js');
    const { searchProxyRoute } = await import('./search.js');
    app = Fastify();
    app.addHook('onRequest', createProxyAuthRateLimitHook({
      bucket: 'proxy-authenticated',
      max: config.authenticatedRateLimitMax,
      windowMs: config.requestRateLimitWindowMs,
    }));
    await app.register(responsesProxyRoute);
    await app.register(searchProxyRoute);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    baseUrl = `ws://127.0.0.1:${address.port}`;

    upstreamServer = new WebSocketServer({ port: 0 });
    upstreamSockets = new Set();
    upstreamServer.on('connection', (socket, request) => {
      upstreamSockets.add(socket);
      socket.once('close', () => {
        upstreamSockets.delete(socket);
      });
      upstreamConnectionCount += 1;
      upstreamUpgradeHeaders = Object.fromEntries(
        Object.entries(request.headers)
          .map(([key, value]) => [key, Array.isArray(value) ? value[0] || '' : value || '']),
      );
      socket.on('message', (payload) => {
        const parsed = JSON.parse(String(payload)) as Record<string, unknown>;
        upstreamRequests.push(parsed);
        upstreamMessageHandler(socket, parsed, upstreamRequests.length);
      });
    });
    await new Promise<void>((resolve) => upstreamServer.once('listening', () => resolve()));
    const upstreamAddress = upstreamServer.address() as AddressInfo;
    upstreamSiteUrl = `http://127.0.0.1:${upstreamAddress.port}/backend-api/codex`;

    rejectedUpgradeServer = createServer();
    rejectedUpgradeServer.on('upgrade', (_request, socket) => {
      const body = rejectedUpgradeBody;
      socket.write(
        `HTTP/1.1 ${rejectedUpgradeStatus} ${rejectedUpgradeStatusText}\r\n`
        + 'Content-Type: text/plain\r\n'
        + `Content-Length: ${Buffer.byteLength(body)}\r\n`
        + 'Connection: close\r\n'
        + '\r\n'
        + body,
      );
      socket.destroy();
    });
    await new Promise<void>((resolve) => rejectedUpgradeServer.listen(0, '127.0.0.1', () => resolve()));
    const rejectedAddress = rejectedUpgradeServer.address() as AddressInfo;
    rejectedUpgradeSiteUrl = `http://127.0.0.1:${rejectedAddress.port}/backend-api/codex`;
  });

  beforeEach(() => {
    resetCodexSessionResponseStore();
    resetRequestRateLimitStore();
    (config as any).requestRateLimitMax = originalRequestRateLimitMax;
    (config as any).requestRateLimitWindowMs = originalRequestRateLimitWindowMs;
    (config as any).authenticatedRateLimitMax = originalAuthenticatedRateLimitMax;
    fetchMock.mockReset();
    selectChannelMock.mockReset();
    selectNextChannelMock.mockReset();
    selectPreferredChannelMock.mockReset();
    previewSelectedChannelMock.mockReset();
    recordSuccessMock.mockReset();
    recordFailureMock.mockReset();
    authorizeDownstreamTokenMock.mockReset();
    consumeManagedKeyRequestMock.mockReset();
    recordManagedKeyCostUsageMock.mockReset();
    refreshModelsAndRebuildRoutesMock.mockReset();
    reportProxyAllFailedMock.mockReset();
    reportTokenExpiredMock.mockReset();
    resolveProxyUsageWithSelfLogFallbackMock.mockClear();
    dbInsertMock.mockClear();
    siteApiEndpointRows = [];

    const selectedChannel = createSelectedChannel();
    selectChannelMock.mockReturnValue(selectedChannel);
    selectNextChannelMock.mockReturnValue(null);
    selectPreferredChannelMock.mockReturnValue(null);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamConnectionCount = 0;
    upstreamUpgradeHeaders = {};
    upstreamRequests = [];
    (config as any).codexResponsesWebsocketBeta = originalCodexResponsesWebsocketBeta;
    (config as any).codexUpstreamWebsocketEnabled = true;
    (config as any).openAiServiceTierRules = undefined;
    rejectedUpgradeStatus = 426;
    rejectedUpgradeStatusText = 'Upgrade Required';
    rejectedUpgradeBody = 'Upgrade Required';
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'global',
      token: 'sk-global-proxy-token',
      key: null,
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });
    upstreamMessageHandler = (socket, parsed, requestIndex) => {
      const responseId = `resp_upstream_${requestIndex}`;
      socket.send(JSON.stringify({
        type: 'response.completed',
        response: {
          id: responseId,
          object: 'response',
          model: parsed.model || 'gpt-5.4',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        },
      }));
    };
  });

  afterEach(() => {
    for (const socket of trackedClientSockets) {
      try {
        socket.terminate();
      } catch {}
    }
    trackedClientSockets.clear();
    resetRequestRateLimitStore();
    (config as any).requestRateLimitMax = originalRequestRateLimitMax;
    (config as any).requestRateLimitWindowMs = originalRequestRateLimitWindowMs;
    (config as any).authenticatedRateLimitMax = originalAuthenticatedRateLimitMax;
  });

  afterAll(async () => {
    (config as any).codexUpstreamWebsocketEnabled = originalCodexUpstreamWebsocketEnabled;
    for (const socket of trackedClientSockets) {
      try {
        socket.terminate();
      } catch {}
    }
    trackedClientSockets.clear();
    for (const socket of upstreamSockets || []) {
      try {
        socket.terminate();
      } catch {}
    }
    upstreamSockets?.clear();
    if (rejectedUpgradeServer) {
      await new Promise<void>((resolve) => rejectedUpgradeServer.close(() => resolve()));
    }
    if (upstreamServer) {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
    if (app) {
      await app.close();
    }
  });

  it('rejects repeated missing-token websocket upgrades before authentication work', async () => {
    (config as any).requestRateLimitMax = 1;

    const firstSocket = createClientSocketForPath(`${baseUrl}/v1/responses`);
    const first = await waitForSocketUnexpectedResponse(firstSocket);
    const secondSocket = createClientSocketForPath(`${baseUrl}/v1/responses`);
    const second = await waitForSocketUnexpectedResponse(secondSocket);

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toMatch(/^\d+$/);
    expect(JSON.parse(second.body)).toMatchObject({
      statusCode: 429,
      error: 'Too many requests',
      retryAfter: expect.any(String),
    });
    expect(authorizeDownstreamTokenMock).not.toHaveBeenCalled();
  });

  it('rejects repeated invalid websocket upgrades before another authentication call', async () => {
    (config as any).requestRateLimitMax = 1;
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: false,
      statusCode: 403,
      error: 'Invalid API key',
      reason: 'invalid',
    });

    const firstSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer invalid-websocket-token',
    });
    const first = await waitForSocketUnexpectedResponse(firstSocket);
    const secondSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer invalid-websocket-token',
    });
    const second = await waitForSocketUnexpectedResponse(secondSocket);

    expect(first.statusCode).toBe(403);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toMatch(/^\d+$/);
    expect(JSON.parse(second.body)).toMatchObject({
      statusCode: 429,
      error: 'Too many requests',
      retryAfter: expect.any(String),
    });
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the pre-auth websocket bucket on the TCP address despite forwarded-header changes', async () => {
    (config as any).requestRateLimitMax = 1;
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: false,
      statusCode: 403,
      error: 'Invalid API key',
      reason: 'invalid',
    });

    const firstSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer invalid-forwarded-token',
      'x-forwarded-for': '198.51.100.1',
    });
    const first = await waitForSocketUnexpectedResponse(firstSocket);
    const secondSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer invalid-forwarded-token',
      'x-forwarded-for': '203.0.113.2',
    });
    const second = await waitForSocketUnexpectedResponse(secondSocket);

    expect(first.statusCode).toBe(403);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toMatch(/^\d+$/);
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(1);
  });

  it('bounds global-token websocket connection creation independently from frame requests', async () => {
    (config as any).authenticatedRateLimitMax = 1;

    const firstSocket = createClientSocket(baseUrl);
    await waitForSocketOpen(firstSocket);
    const secondSocket = createClientSocket(baseUrl);
    const second = await waitForSocketUpgradeOutcome(secondSocket);

    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toMatch(/^\d+$/);
    expect(JSON.parse(second.body)).toMatchObject({
      statusCode: 429,
      error: 'Too many requests',
      retryAfter: expect.any(String),
    });
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(2);
  });

  it('bounds global-token websocket frames and does not dispatch denied frames', async () => {
    (config as any).authenticatedRateLimitMax = 1;
    const selectedChannel = createSelectedChannel({ siteUrl: upstreamSiteUrl });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    await firstResponsePromise;

    const deniedPromise = waitForSocketMessages(socket, 1);
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const [denied] = await deniedPromise;
    socket.close();

    expect(denied).toMatchObject({
      type: 'error',
      status: 429,
      retryAfter: expect.any(String),
    });
    expect(Number(denied.retryAfter)).toBeGreaterThanOrEqual(1);
    expect(upstreamRequests).toHaveLength(1);
    expect(consumeManagedKeyRequestMock).not.toHaveBeenCalled();
  });

  it('isolates authenticated websocket frame buckets for distinct managed identities', async () => {
    (config as any).authenticatedRateLimitMax = 1;
    authorizeDownstreamTokenMock.mockImplementation(async (token: string) => ({
      ok: true as const,
      source: 'managed' as const,
      token,
      key: { id: token === 'managed-frame-b' ? 202 : 201, name: token },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    }));
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    const selectedChannel = createSelectedChannel({ siteUrl: upstreamSiteUrl });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const firstSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-frame-a',
      'x-forwarded-for': '198.51.100.10',
    });
    const secondSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-frame-b',
      'x-forwarded-for': '203.0.113.10',
    });
    await Promise.all([waitForSocketOpen(firstSocket), waitForSocketOpen(secondSocket)]);

    const firstResponsePromise = waitForSocketMessageMatching(
      firstSocket,
      (message) => message?.type === 'response.completed',
    );
    const secondResponsePromise = waitForSocketMessageMatching(
      secondSocket,
      (message) => message?.type === 'response.completed',
    );
    const payload = JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    });
    firstSocket.send(payload);
    secondSocket.send(payload);
    await Promise.all([firstResponsePromise, secondResponsePromise]);
    firstSocket.close();
    secondSocket.close();

    expect(consumeManagedKeyRequestMock.mock.calls).toEqual([[201], [202]]);
  });

  it('shares a managed frame bucket across connections despite forwarded-header changes', async () => {
    (config as any).authenticatedRateLimitMax = 2;
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'managed-shared-frame-token',
      key: { id: 208, name: 'managed-shared-frame-key' },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_shared_frame_1","model":"gpt-4.1","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_shared_frame_2","model":"gpt-4.1","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const firstSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-shared-frame-token',
      'x-forwarded-for': '198.51.100.21',
    });
    const secondSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-shared-frame-token',
      'x-forwarded-for': '203.0.113.21',
    });
    await Promise.all([waitForSocketOpen(firstSocket), waitForSocketOpen(secondSocket)]);

    const firstResponsePromise = waitForSocketMessageMatching(
      firstSocket,
      (message) => message?.type === 'response.completed',
    );
    firstSocket.send(JSON.stringify({ type: 'response.create', model: 'gpt-4.1', input: [] }));
    await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      secondSocket,
      (message) => message?.type === 'response.completed',
    );
    secondSocket.send(JSON.stringify({ type: 'response.create', model: 'gpt-4.1', input: [] }));
    await secondResponsePromise;

    const deniedResponsePromise = waitForSocketMessageMatching(
      secondSocket,
      (message) => message?.type === 'error',
    );
    secondSocket.send(JSON.stringify({ type: 'response.create', model: 'gpt-4.1', input: [] }));
    const deniedResponse = await deniedResponsePromise;
    firstSocket.close();
    secondSocket.close();

    expect(deniedResponse).toMatchObject({
      type: 'error',
      status: 429,
      retryAfter: expect.any(String),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(2);
  });

  it('does not split a managed connection bucket with forwarded-header changes', async () => {
    (config as any).authenticatedRateLimitMax = 1;
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'managed-connection-token',
      key: { id: 203, name: 'managed-connection-key' },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });

    const firstSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-connection-token',
      'x-forwarded-for': '198.51.100.11',
    });
    await waitForSocketOpen(firstSocket);
    const secondSocket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-connection-token',
      'x-forwarded-for': '203.0.113.11',
    });
    const second = await waitForSocketUpgradeOutcome(secondSocket);

    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toMatch(/^\d+$/);
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(2);
  });

  it('consumes managed quota exactly once when a maxRequests-one fallback request is accepted', async () => {
    (config as any).codexUpstreamWebsocketEnabled = false;
    let usedRequests = 0;
    authorizeDownstreamTokenMock.mockImplementation(async (token: string) => {
      if (usedRequests >= 1) {
        return {
          ok: false as const,
          statusCode: 403,
          error: 'API key has exceeded max requests',
          reason: 'over_requests' as const,
        };
      }
      return {
        ok: true as const,
        source: 'managed' as const,
        token,
        key: { id: 204, name: 'managed-max-one-key', maxRequests: 1, usedRequests },
        policy: {
          supportedModels: [],
          allowedRouteIds: [],
          siteWeightMultipliers: {},
        },
      };
    });
    consumeManagedKeyRequestMock.mockImplementation(async () => {
      usedRequests += 1;
    });
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_managed_max_one","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-max-one-token',
    });
    await waitForSocketOpen(socket);
    const responsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const response = await responsePromise;
    socket.close();

    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(2);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(204);
    expect(response?.type).toBe('response.completed');
  });

  it('preserves exactly-once authenticated accounting when a direct websocket request falls back to HTTP', async () => {
    (config as any).codexUpstreamWebsocketEnabled = false;
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'managed-http-fallback-token',
      key: { id: 205, name: 'managed-http-fallback-key' },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_managed_http_fallback","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-http-fallback-token',
    });
    await waitForSocketOpen(socket);
    const responsePromise = waitForSocketMessages(socket, 1);
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const [response] = await responsePromise;
    socket.close();

    expect(response).toBeDefined();
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(2);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(205);
  });

  it('aggregates production global limits across repeated HTTP fallback frames by original socket', async () => {
    (config as any).codexUpstreamWebsocketEnabled = false;
    (config as any).authenticatedRateLimitMax = 10;
    const { responsesProxyRoute } = await import('./responses.js');
    const fallbackApp = Fastify();
    await registerGlobalRateLimit(fallbackApp, { max: 1, windowMs: 60_000 });
    fallbackApp.addHook('onRequest', createGlobalRateLimitHook(fallbackApp));
    fallbackApp.addHook('onRequest', createProxyAuthRateLimitHook({
      bucket: 'proxy-authenticated-production-fallback-test',
      max: 10,
      windowMs: 60_000,
    }));
    await fallbackApp.register(responsesProxyRoute);
    await fallbackApp.listen({ port: 0, host: '127.0.0.1' });
    const fallbackAddress = fallbackApp.server.address() as AddressInfo;
    const fallbackBaseUrl = `ws://127.0.0.1:${fallbackAddress.port}`;
    fetchMock.mockImplementation(() => createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_global_fallback","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    try {
      const socket = createClientSocket(fallbackBaseUrl);
      await waitForSocketOpen(socket);
      const firstResponsePromise = waitForSocketMessageMatching(
        socket,
        (message) => message?.type === 'response.completed',
      );
      socket.send(JSON.stringify({
        type: 'response.create',
        model: 'gpt-5.4',
        input: [],
      }));
      await firstResponsePromise;

      const deniedResponsePromise = waitForSocketMessages(socket, 1);
      socket.send(JSON.stringify({
        type: 'response.create',
        model: 'gpt-5.4',
        input: [],
      }));
      const [deniedResponse] = await deniedResponsePromise;
      socket.close();

      expect(deniedResponse).toMatchObject({
        type: 'error',
        status: 429,
        retryAfter: expect.any(String),
      });
      expect(Number(deniedResponse.retryAfter)).toBeGreaterThanOrEqual(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await fallbackApp.close();
    }
  });

  it('revalidates a managed key for each persistent frame before HTTP fallback', async () => {
    (config as any).codexUpstreamWebsocketEnabled = false;
    (config as any).authenticatedRateLimitMax = 10;
    let usedRequests = 0;
    authorizeDownstreamTokenMock.mockImplementation(async (token: string) => {
      if (usedRequests >= 1) {
        return {
          ok: false as const,
          statusCode: 403,
          error: 'API key has exceeded max requests',
          reason: 'over_requests' as const,
        };
      }
      return {
        ok: true as const,
        source: 'managed' as const,
        token,
        key: { id: 206, name: 'persistent-max-one-key', maxRequests: 1, usedRequests },
        policy: {
          supportedModels: [],
          allowedRouteIds: [],
          siteWeightMultipliers: {},
        },
      };
    });
    consumeManagedKeyRequestMock.mockImplementation(async () => {
      usedRequests += 1;
    });
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockImplementation(() => createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_persistent_fallback","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl, {
      Authorization: 'Bearer persistent-max-one-token',
    });
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const firstResponse = await firstResponsePromise;

    const deniedResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'error',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const deniedResponse = await deniedResponsePromise;
    socket.close();

    expect(firstResponse?.type).toBe('response.completed');
    expect(deniedResponse).toMatchObject({
      type: 'error',
      status: 403,
      error: {
        message: 'API key has exceeded max requests',
      },
    });
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(3);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(206);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upstreamConnectionCount).toBe(0);
  });

  it('preserves exactly-once accounting for managed search-only fallback frames', async () => {
    (config as any).codexUpstreamWebsocketEnabled = false;
    (config as any).authenticatedRateLimitMax = 10;
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'managed-search-only-token',
      key: { id: 212, name: 'managed-search-only-key' },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
        excludedSiteIds: [],
        excludedCredentialRefs: [],
      },
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ title: 'Search result', url: 'https://example.com/result' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const socket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-search-only-token',
    });
    await waitForSocketOpen(socket);
    const responsePromise = waitForSocketMessages(socket, 1);
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      tools: [{ type: 'web_search_preview' }],
      input: [{
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'search for the latest result' }],
      }],
    }));
    const [response] = await responsePromise;
    socket.close();

    expect(response?.type).toBe('response.completed');
    expect(response?.response?.output?.[0]?.type).toBe('web_search_call');
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(2);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(212);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reselects a channel when refreshed managed policy revokes the reused site', async () => {
    (config as any).authenticatedRateLimitMax = 10;
    let authorizeCalls = 0;
    authorizeDownstreamTokenMock.mockImplementation(async (token: string) => {
      authorizeCalls += 1;
      return {
        ok: true as const,
        source: 'managed' as const,
        token,
        key: { id: 211, name: 'managed-refresh-policy-key' },
        policy: authorizeCalls >= 3
          ? {
            supportedModels: [],
            allowedRouteIds: [],
            siteWeightMultipliers: {},
            excludedSiteIds: [44],
            excludedCredentialRefs: [],
          }
          : {
            supportedModels: [],
            allowedRouteIds: [],
            siteWeightMultipliers: {},
            excludedSiteIds: [],
            excludedCredentialRefs: [],
          },
      };
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    const selectedChannelA = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
      actualModel: 'gpt-5.4',
    });
    const selectedChannelB = {
      ...createSelectedChannel({
        sitePlatform: 'openai',
        actualModel: 'gpt-5.4',
      }),
      site: {
        ...createSelectedChannel({
          sitePlatform: 'openai',
          actualModel: 'gpt-5.4',
        }).site,
        id: 45,
      },
    };
    selectChannelMock.mockImplementation((_model: string, policy: { excludedSiteIds?: number[] }) => (
      policy?.excludedSiteIds?.includes(44) ? selectedChannelB : selectedChannelA
    ));
    previewSelectedChannelMock.mockImplementation(async (_model: string, policy: { excludedSiteIds?: number[] }) => (
      policy?.excludedSiteIds?.includes(44) ? selectedChannelB : selectedChannelA
    ));
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_reselected_channel","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-refresh-policy-token',
    });
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    await secondResponsePromise;
    socket.close();

    expect(authorizeCalls).toBe(3);
    expect(selectChannelMock).toHaveBeenCalledTimes(3);
    expect(selectChannelMock.mock.calls[1]?.[1]).toMatchObject({ excludedSiteIds: [44] });
    expect(upstreamRequests).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts response.create over GET /v1/responses websocket and forwards streamed responses events', async () => {
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'sk-managed-websocket',
      key: { id: 77, name: 'websocket-key' },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamMessageHandler = (socket) => {
      socket.send(JSON.stringify({
        type: 'response.created',
        response: {
          id: 'resp_ws',
          model: 'gpt-5.4',
          created_at: 1706000000,
          status: 'in_progress',
          output: [],
        },
      }));
      socket.send(JSON.stringify({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          id: 'msg_ws',
          type: 'message',
          role: 'assistant',
          status: 'in_progress',
          content: [],
        },
      }));
      socket.send(JSON.stringify({
        type: 'response.output_text.delta',
        output_index: 0,
        item_id: 'msg_ws',
        delta: 'pong',
      }));
      socket.send(JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_ws',
          model: 'gpt-5.4',
          status: 'completed',
          output: [{
            id: 'msg_ws',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'pong' }],
          }],
          usage: {
            input_tokens: 3,
            output_tokens: 1,
            total_tokens: 4,
          },
        },
      }));
    };

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessages(socket, 4);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello websocket' }],
        },
      ],
    }));

    const messages = await messagesPromise;
    socket.close();

    expect(messages.map((message) => message.type)).toEqual([
      'response.created',
      'response.output_item.added',
      'response.output_text.delta',
      'response.completed',
    ]);
    expect(messages[3]?.response?.output?.[0]?.content?.[0]?.text).toBe('pong');
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(upstreamConnectionCount).toBe(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(77);
  });

  it('uses the configured site api endpoint pool for codex websocket transport', async () => {
    siteApiEndpointRows = [{
      id: 901,
      siteId: 44,
      url: upstreamSiteUrl,
      enabled: true,
      sortOrder: 0,
      cooldownUntil: null,
      lastSelectedAt: null,
      lastFailedAt: null,
      lastFailureReason: null,
      updatedAt: null,
    }];
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const message = await messagePromise;
    socket.close();

    expect(message?.type).toBe('response.completed');
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(upstreamConnectionCount).toBe(1);
  });

  it('preserves the site endpoint exhaustion message on websocket errors', async () => {
    siteApiEndpointRows = [{
      id: 902,
      siteId: 44,
      url: upstreamSiteUrl,
      enabled: false,
      sortOrder: 0,
      cooldownUntil: null,
      lastSelectedAt: null,
      lastFailedAt: null,
      lastFailureReason: null,
      updatedAt: null,
    }];
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const errorPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'error',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const errorMessage = await errorPromise;
    socket.close();

    expect(errorMessage).toMatchObject({
      type: 'error',
      status: 408,
      error: {
        message: '当前站点的 API 请求地址均不可用',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(upstreamConnectionCount).toBe(0);
  });

  it('echoes x-codex-turn-state on websocket upgrade responses', async () => {
    const socket = createClientSocket(baseUrl, {
      'x-codex-turn-state': 'turn-state-123',
    });

    const [upgrade] = await Promise.all([
      waitForSocketUpgrade(socket),
      waitForSocketOpen(socket),
    ]);
    socket.close();

    expect(upgrade.headers['x-codex-turn-state']).toBe('turn-state-123');
  });

  it('reuses one upstream codex websocket session across sequential websocket turns', async () => {
    (config as any).codexResponsesWebsocketBeta = 'responses_websockets=2099-01-01';
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl, {
      'x-codex-turn-state': 'turn-state-123',
      'x-codex-beta-features': 'feature-a,feature-b',
    });
    await waitForSocketOpen(socket);
    const firstMessagesPromise = waitForSocketMessages(socket, 1);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const firstMessages = await firstMessagesPromise;

    const secondMessagesPromise = waitForSocketMessages(socket, 1);
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      previous_response_id: firstMessages[0]?.response?.id,
      input: [],
    }));

    const secondMessages = await secondMessagesPromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(firstMessages[0]?.type).toBe('response.completed');
    expect(secondMessages[0]?.type).toBe('response.completed');
    expect(upstreamConnectionCount).toBe(1);
    expect(upstreamRequests).toHaveLength(2);
    expect(upstreamRequests[0]).toMatchObject({
      type: 'response.create',
      model: 'gpt-5.4',
    });
    expect(upstreamRequests[1]).toMatchObject({
      type: 'response.create',
      previous_response_id: firstMessages[0]?.response?.id,
    });
    expect(upstreamUpgradeHeaders['x-codex-turn-state']).toBe('turn-state-123');
    expect(upstreamUpgradeHeaders['x-codex-beta-features']).toBe('feature-a,feature-b');
    expect(upstreamUpgradeHeaders['openai-beta']).toContain('responses_websockets=2099-01-01');
  });

  it('infers previous_response_id for websocket tool-output follow-up turns when the client omits it', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl, {
      session_id: 'ws-session-prev-infer',
    });
    await waitForSocketOpen(socket);

    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const firstResponse = await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_upstream_2',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [
        {
          id: 'tool_out_ws_1',
          type: 'function_call_output',
          call_id: 'call_ws_1',
          output: '{"ok":true}',
        },
      ],
    }));
    await secondResponsePromise;
    socket.close();

    expect(firstResponse?.response?.id).toBe('resp_upstream_1');
    expect(upstreamRequests).toHaveLength(2);
    expect(upstreamRequests[1]).toMatchObject({
      type: 'response.create',
      previous_response_id: 'resp_upstream_1',
      input: [
        {
          id: 'tool_out_ws_1',
          type: 'function_call_output',
          call_id: 'call_ws_1',
          output: '{"ok":true}',
        },
      ],
    });
  });

  it('infers previous_response_id for websocket tool-output follow-up turns when the client only sends conversation_id', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl, {
      conversation_id: 'ws-conversation-prev-infer',
    });
    await waitForSocketOpen(socket);

    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    const firstResponse = await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_upstream_2',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [
        {
          id: 'tool_out_ws_conv_1',
          type: 'function_call_output',
          call_id: 'call_ws_conv_1',
          output: '{"ok":true}',
        },
      ],
    }));
    await secondResponsePromise;
    socket.close();

    expect(firstResponse?.response?.id).toBe('resp_upstream_1');
    expect(upstreamUpgradeHeaders.session_id).toBe('ws-conversation-prev-infer');
    expect(upstreamUpgradeHeaders.conversation_id).toBe('ws-conversation-prev-infer');
    expect(upstreamRequests).toHaveLength(2);
    expect(upstreamRequests[1]).toMatchObject({
      type: 'response.create',
      previous_response_id: 'resp_upstream_1',
      input: [
        {
          id: 'tool_out_ws_conv_1',
          type: 'function_call_output',
          call_id: 'call_ws_conv_1',
          output: '{"ok":true}',
        },
      ],
    });
  });

  it('preserves websocket continuation across downstream reconnects on the same conversation_id', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const firstSocket = createClientSocket(baseUrl, {
      conversation_id: 'ws-conversation-reconnect-1',
    });
    await waitForSocketOpen(firstSocket);

    const firstResponsePromise = waitForSocketMessageMatching(
      firstSocket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_upstream_1',
    );
    firstSocket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));
    await firstResponsePromise;
    firstSocket.close();
    await waitForSocketClose(firstSocket);

    const secondSocket = createClientSocket(baseUrl, {
      conversation_id: 'ws-conversation-reconnect-1',
    });
    await waitForSocketOpen(secondSocket);

    const secondResponsePromise = waitForSocketMessageMatching(
      secondSocket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_upstream_2',
    );
    secondSocket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [
        {
          id: 'tool_out_ws_reconnect_1',
          type: 'function_call_output',
          call_id: 'call_ws_reconnect_1',
          output: '{"ok":true}',
        },
      ],
    }));
    await secondResponsePromise;
    secondSocket.close();

    expect(upstreamConnectionCount).toBe(2);
    expect(upstreamRequests).toHaveLength(2);
    expect(upstreamRequests[1]).toMatchObject({
      type: 'response.create',
      previous_response_id: 'resp_upstream_1',
      input: [
        {
          id: 'tool_out_ws_reconnect_1',
          type: 'function_call_output',
          call_id: 'call_ws_reconnect_1',
          output: '{"ok":true}',
        },
      ],
    });
  });

  it('retries websocket turns once without previous_response_id when the upstream reports previous_response_not_found', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamMessageHandler = (socket, parsed, requestIndex) => {
      if (requestIndex === 1) {
        socket.send(JSON.stringify({
          type: 'error',
          error: {
            message: 'previous_response_not_found',
            code: 'previous_response_not_found',
            type: 'invalid_request_error',
          },
        }));
        return;
      }
      socket.send(JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_upstream_recovered',
          object: 'response',
          model: parsed.model || 'gpt-5.4',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        },
      }));
    };

    const socket = createClientSocket(baseUrl, {
      session_id: 'ws-session-prev-recovery',
    });
    await waitForSocketOpen(socket);

    const responsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_upstream_recovered',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      previous_response_id: 'resp_stale_ws',
      input: [
        {
          id: 'tool_out_ws_retry_1',
          type: 'function_call_output',
          call_id: 'call_ws_retry_1',
          output: '{"retry":true}',
        },
      ],
    }));
    await responsePromise;
    socket.close();

    expect(upstreamRequests).toHaveLength(2);
    expect(upstreamRequests[0]).toMatchObject({
      type: 'response.create',
      previous_response_id: 'resp_stale_ws',
    });
    expect(upstreamRequests[1]).toMatchObject({
      type: 'response.create',
      input: [
        {
          id: 'tool_out_ws_retry_1',
          type: 'function_call_output',
          call_id: 'call_ws_retry_1',
          output: '{"retry":true}',
        },
      ],
    });
    expect(upstreamRequests[1]?.previous_response_id).toBeUndefined();
  });

  it('falls back to the HTTP responses executor when the upstream codex websocket upgrade returns 426', async () => {
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'managed-runtime-fallback-token',
      key: { id: 209, name: 'managed-runtime-fallback-key' },
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_http_fallback","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl, {
      Authorization: 'Bearer managed-runtime-fallback-token',
    });
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const message = await messagesPromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(209);
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledTimes(2);
    expect(message?.type).toBe('response.completed');
    expect(message?.response?.id).toBe('resp_http_fallback');
  });

  it('treats response.incomplete as a terminal HTTP fallback payload without appending websocket error', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.incomplete\n',
      'data: {"type":"response.incomplete","response":{"id":"resp_http_incomplete","model":"gpt-5.4","status":"incomplete","output":[{"id":"msg_http_incomplete","type":"message","role":"assistant","status":"incomplete","content":[{"type":"output_text","text":"partial"}]}],"output_text":"partial","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessages(socket, 2);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const messages = await messagesPromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(messages.map((message) => message?.type)).toEqual([
      'response.created',
      'response.incomplete',
    ]);
    expect(messages.some((message) => message?.type === 'error')).toBe(false);
    const terminalMessage = messages[1];
    expect(terminalMessage?.response?.incomplete_details?.reason).toBe('max_output_tokens');
  });

  it('falls back to the HTTP responses executor when the upstream codex websocket upgrade returns 401', async () => {
    rejectedUpgradeStatus = 401;
    rejectedUpgradeStatusText = 'Unauthorized';
    rejectedUpgradeBody = JSON.stringify({
      error: {
        message: 'expired token',
        type: 'invalid_request_error',
      },
    });
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_http_fallback_401","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const message = await messagesPromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(message?.type).toBe('response.completed');
    expect(message?.response?.id).toBe('resp_http_fallback_401');
  });

  it('treats response.incomplete as a terminal HTTP fallback event instead of appending a websocket error', async () => {
    rejectedUpgradeStatus = 426;
    rejectedUpgradeStatusText = 'Upgrade Required';
    rejectedUpgradeBody = JSON.stringify({
      error: {
        message: 'upgrade required',
        type: 'invalid_request_error',
      },
    });
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.incomplete\n',
      'data: {"type":"response.incomplete","response":{"id":"resp_http_incomplete","model":"gpt-5.4","status":"incomplete","output":[{"id":"msg_incomplete","type":"message","role":"assistant","status":"incomplete","content":[{"type":"output_text","text":"partial"}]}],"output_text":"partial","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.incomplete',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const message = await messagePromise;
    await expect(
      waitForSocketMessageMatching(
        socket,
        (nextMessage) => nextMessage?.type === 'error',
        150,
      ),
    ).rejects.toThrow('Timed out waiting for matching websocket message');
    socket.close();

    expect(message?.response?.id).toBe('resp_http_incomplete');
  });

  it('preserves previous_response_id when websocket upgrade fallback uses HTTP on incremental-capable upstreams', async () => {
    rejectedUpgradeStatus = 426;
    rejectedUpgradeStatusText = 'Upgrade Required';
    rejectedUpgradeBody = JSON.stringify({
      error: {
        message: 'upgrade required',
        type: 'invalid_request_error',
      },
    });

    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_fallback_1","model":"gpt-5.4","status":"completed","output":[{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"first"}]}],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_fallback_2","model":"gpt-5.4","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"second"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      instructions: 'be helpful',
      input: [],
    }));

    const firstMessage = await firstResponsePromise;
    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_http_fallback_2',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      previous_response_id: 'resp_http_fallback_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));

    await secondResponsePromise;
    socket.close();

    expect(firstMessage?.type).toBe('response.completed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.previous_response_id).toBe('resp_http_fallback_1');
    expect(secondBody.input).toEqual([
      {
        id: 'tool_out_1',
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'tool result',
      },
    ]);
  });

  it('carries forward incomplete-turn output into the next fallback websocket request input', async () => {
    rejectedUpgradeStatus = 426;
    rejectedUpgradeStatusText = 'Upgrade Required';
    rejectedUpgradeBody = JSON.stringify({
      error: {
        message: 'upgrade required',
        type: 'invalid_request_error',
      },
    });

    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.incomplete\n',
        'data: {"type":"response.incomplete","response":{"id":"resp_http_incomplete_1","model":"gpt-5.4","status":"incomplete","output":[{"id":"msg_http_incomplete_1","type":"message","role":"assistant","status":"incomplete","content":[{"type":"output_text","text":"carry me"}]}],"output_text":"carry me","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_incomplete_2","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.incomplete',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const firstMessage = await firstResponsePromise;
    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'continue' }],
        },
      ],
    }));

    await secondResponsePromise;
    socket.close();

    expect(firstMessage?.type).toBe('response.incomplete');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.input).toHaveLength(2);
    expect(secondBody.input[0]).toMatchObject({
      type: 'message',
      role: 'assistant',
      status: 'incomplete',
      content: [{ type: 'output_text', text: 'carry me' }],
    });
    expect(secondBody.input[1]).toEqual({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'continue' }],
    });
  });

  it('carries forward terminal output from incomplete HTTP fallback turns on non-incremental upstreams', async () => {
    rejectedUpgradeStatus = 426;
    rejectedUpgradeStatusText = 'Upgrade Required';
    rejectedUpgradeBody = JSON.stringify({
      error: {
        message: 'upgrade required',
        type: 'invalid_request_error',
      },
    });

    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      siteUrl: rejectedUpgradeSiteUrl,
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.incomplete\n',
        'data: {"type":"response.incomplete","response":{"id":"resp_http_incomplete_1","model":"gpt-4.1","status":"incomplete","output":[{"id":"msg_1","type":"message","role":"assistant","status":"incomplete","content":[{"type":"output_text","text":"partial tool call"}]}],"output_text":"partial tool call","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_complete_2","model":"gpt-4.1","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"done"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);

    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.incomplete',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      instructions: 'be helpful',
      input: [
        {
          id: 'msg_user_1',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'call the tool' }],
        },
      ],
    }));
    await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      previous_response_id: 'resp_http_incomplete_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));
    await secondResponsePromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.previous_response_id).toBeUndefined();
    expect(secondBody.model).toBe('gpt-4.1');
    expect(secondBody.instructions).toBe('be helpful');
    expect(secondBody.input).toHaveLength(3);
    expect(secondBody.input[0]).toEqual({
      id: 'msg_user_1',
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'call the tool' }],
    });
    expect(secondBody.input[1]).toMatchObject({
      type: 'message',
      role: 'assistant',
      status: 'incomplete',
      content: [{ type: 'output_text', text: 'partial tool call' }],
    });
    expect(secondBody.input[2]).toEqual({
      id: 'tool_out_1',
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'tool result',
    });
  });

  it('preserves query parameter auth when websocket transport falls back to the HTTP responses route', async () => {
    rejectedUpgradeStatus = 401;
    rejectedUpgradeStatusText = 'Unauthorized';
    rejectedUpgradeBody = JSON.stringify({
      error: {
        message: 'expired token',
        type: 'invalid_request_error',
      },
    });
    const selectedChannel = createSelectedChannel({
      siteUrl: rejectedUpgradeSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    authorizeDownstreamTokenMock.mockResolvedValueOnce({
      ok: true,
      source: 'global',
      token: 'sk-query-auth',
      key: null,
      policy: {
        supportedModels: [],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_http_fallback_query","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocketForPath(`${baseUrl}/v1/responses?key=sk-query-auth`);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessages(socket, 1);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const messages = await messagesPromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(messages[0]?.response?.id).toBe('resp_http_fallback_query');
  });

  it('rejects websocket turns whose model is blocked by the downstream key policy before channel selection', async () => {
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'sk-managed-denied',
      key: {
        id: 99,
        name: 'limited-key',
      },
      policy: {
        supportedModels: ['gpt-4.1'],
        allowedRouteIds: [],
        siteWeightMultipliers: {},
      },
    });

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessages(socket, 1);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const messages = await messagesPromise;
    socket.close();

    expect(messages[0]).toMatchObject({
      type: 'error',
      status: 403,
    });
    expect(selectChannelMock).not.toHaveBeenCalled();
  });

  it('merges follow-up response.create payloads when the selected upstream does not support incremental mode', async () => {
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.output_item.done\n',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"fc_1","type":"function_call","call_id":"call_1"}}\n\n',
        'event: response.output_item.done\n',
        'data: {"type":"response.output_item.done","output_index":1,"item":{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"call tool"}]}}\n\n',
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_ws_1","model":"gpt-4.1","status":"completed","output":[{"id":"fc_1","type":"function_call","call_id":"call_1"},{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"call tool"}]}],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_ws_2","model":"gpt-4.1","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"done"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);

    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      instructions: 'be helpful',
      input: [
        {
          id: 'msg_user_1',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'call the tool' }],
        },
      ],
    }));
    await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      previous_response_id: 'resp_ws_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));
    await secondResponsePromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const firstBody = JSON.parse(String(firstOptions.body));
    const secondBody = JSON.parse(String(secondOptions.body));

    expect(firstBody.input).toHaveLength(1);
    expect(secondBody.previous_response_id).toBeUndefined();
    expect(secondBody.model).toBe('gpt-4.1');
    expect(secondBody.instructions).toBe('be helpful');
    expect(secondBody.input).toHaveLength(4);
    expect(secondBody.input[0]).toEqual({
      id: 'msg_user_1',
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'call the tool' }],
    });
    expect(secondBody.input[1]).toMatchObject({
      id: 'fc_1',
      type: 'function_call',
      call_id: 'call_1',
    });
    expect(secondBody.input[2]).toEqual({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'call tool' }],
    });
    expect(secondBody.input[3]).toEqual({
      id: 'tool_out_1',
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'tool result',
    });
  });

  it('applies service_tier policy to websocket frames before upstream dispatch', async () => {
    (config as any).openAiServiceTierRules = [{
      action: 'filter',
      tiers: ['priority'],
      platforms: ['openai'],
    }];
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_ws_tier","model":"gpt-4.1","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const responsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      service_tier: 'fast',
      input: [],
    }));
    await responsePromise;
    socket.close();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const forwardedBody = JSON.parse(String(options.body));
    expect(forwardedBody.service_tier).toBeUndefined();
    (config as any).openAiServiceTierRules = undefined;
  });

  it('blocks websocket service_tier before upstream dispatch', async () => {
    (config as any).openAiServiceTierRules = [{
      action: 'block',
      tiers: ['priority'],
      platforms: ['openai'],
    }];
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const errorPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'error',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      service_tier: 'fast',
      input: [],
    }));
    const message = await errorPromise;
    socket.close();

    expect(message.status).toBe(400);
    expect(message.error.message).toContain('service_tier');
    expect(fetchMock).not.toHaveBeenCalled();
    (config as any).openAiServiceTierRules = undefined;
  });

  it('keeps streamed output items for follow-up turns when the terminal HTTP fallback payload has an empty output array', async () => {
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.output_item.done\n',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"fc_1","type":"function_call","call_id":"call_1"}}\n\n',
        'event: response.output_item.done\n',
        'data: {"type":"response.output_item.done","output_index":1,"item":{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"call tool"}]}}\n\n',
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_ws_empty_output","model":"gpt-4.1","status":"completed","output":[],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_ws_followup","model":"gpt-4.1","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"done"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);

    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      instructions: 'be helpful',
      input: [
        {
          id: 'msg_user_1',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'call the tool' }],
        },
      ],
    }));
    await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      instructions: 'be helpful',
      previous_response_id: 'resp_ws_empty_output',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));
    await secondResponsePromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));

    expect(secondBody.input).toHaveLength(4);
    expect(secondBody.input[1]).toMatchObject({
      id: 'fc_1',
      type: 'function_call',
      call_id: 'call_1',
    });
    expect(secondBody.input[2]).toEqual({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'call tool' }],
    });
  });

  it('serializes websocket messages per connection so follow-up turns wait for the previous HTTP fallback to finish', async () => {
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    const firstResponseGate = createDeferred<Response>();
    fetchMock
      .mockImplementationOnce(() => firstResponseGate.promise)
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_ws_2","model":"gpt-4.1","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"done"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      instructions: 'be helpful',
      input: [
        {
          id: 'msg_user_1',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'call the tool' }],
        },
      ],
    }));

    while (fetchMock.mock.calls.length < 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    socket.send(JSON.stringify({
      type: 'response.create',
      previous_response_id: 'resp_ws_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondTurnPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_ws_2',
    );
    firstResponseGate.resolve(createSseResponse([
      'event: response.output_item.done\n',
      'data: {"type":"response.output_item.done","output_index":0,"item":{"id":"fc_1","type":"function_call","call_id":"call_1"}}\n\n',
      'event: response.output_item.done\n',
      'data: {"type":"response.output_item.done","output_index":1,"item":{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"call tool"}]}}\n\n',
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_ws_1","model":"gpt-4.1","status":"completed","output":[{"id":"fc_1","type":"function_call","call_id":"call_1"},{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"call tool"}]}],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    while (fetchMock.mock.calls.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const secondTurnMessage = await secondTurnPromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondTurnMessage).toMatchObject({
      type: 'response.completed',
      response: {
        id: 'resp_ws_2',
      },
    });
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.input).toHaveLength(4);
    expect(secondBody.input[0]).toEqual({
      id: 'msg_user_1',
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'call the tool' }],
    });
    expect(secondBody.input[1]).toMatchObject({
      id: 'fc_1',
      type: 'function_call',
      call_id: 'call_1',
    });
    expect(secondBody.input[2]).toEqual({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'call tool' }],
    });
    expect(secondBody.input[3]).toEqual({
      id: 'tool_out_1',
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'tool result',
    });
  });

  it('preserves incremental response.create payloads with previous_response_id for websocket-capable upstreams', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamMessageHandler = (socket, _parsed, requestIndex) => {
      if (requestIndex === 1) {
        socket.send(JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_ws_1',
            model: 'gpt-5.4',
            status: 'completed',
            output: [{
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'call tool' }],
            }],
            usage: {
              input_tokens: 3,
              output_tokens: 1,
              total_tokens: 4,
            },
          },
        }));
        return;
      }
      socket.send(JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_ws_2',
          model: 'gpt-5.4',
          status: 'completed',
          output: [{
            id: 'msg_2',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'done' }],
          }],
          usage: {
            input_tokens: 5,
            output_tokens: 1,
            total_tokens: 6,
          },
        },
      }));
    };

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);

    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      instructions: 'be helpful',
      input: [
        {
          id: 'msg_user_1',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'call the tool' }],
        },
      ],
    }));
    await firstResponsePromise;

    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_ws_2',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      previous_response_id: 'resp_ws_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));
    const secondResponse = await secondResponsePromise;
    socket.close();

    expect(secondResponse).toMatchObject({
      type: 'response.completed',
      response: {
        id: 'resp_ws_2',
      },
    });
    expect(upstreamConnectionCount).toBe(1);
    expect(upstreamRequests).toHaveLength(2);
    expect(upstreamRequests[0]).toMatchObject({
      type: 'response.create',
      model: 'gpt-5.4',
      instructions: 'be helpful',
    });
    expect(upstreamRequests[1]).toMatchObject({
      type: 'response.create',
      previous_response_id: 'resp_ws_1',
      model: 'gpt-5.4',
      instructions: 'be helpful',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    });
  });

  it('falls back to the HTTP responses route when codex upstream websocket is globally disabled', async () => {
    (config as any).codexUpstreamWebsocketEnabled = false;

    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_1","model":"gpt-5.4","status":"completed","output":[{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"first"}]}],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_2","model":"gpt-5.4","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"second"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_http_1',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      instructions: 'be helpful',
      input: [],
    }));

    const firstMessage = await firstResponsePromise;
    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_http_2',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      previous_response_id: 'resp_http_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));
    const secondMessage = await secondResponsePromise;
    socket.close();

    expect(firstMessage).toMatchObject({
      type: 'response.completed',
      response: {
        id: 'resp_http_1',
      },
    });
    expect(secondMessage).toMatchObject({
      type: 'response.completed',
      response: {
        id: 'resp_http_2',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-5.4',
        instructions: 'be helpful',
        input: [],
        stream: true,
        store: false,
      }),
    });
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.previous_response_id).toBeUndefined();
    expect(secondBody.instructions).toBe('be helpful');
    expect(secondBody.stream).toBe(true);
    expect(secondBody.store).toBe(false);
    expect(secondBody.input).toEqual([
      {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'first' }],
      },
      {
        id: 'tool_out_1',
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'tool result',
      },
    ]);
  });

  it('disables codex websocket incremental transport when the selected account marks websockets as disabled', async () => {
    const selectedChannel = createSelectedChannel({
      extraConfig: {
        credentialMode: 'session',
        websockets: false,
        oauth: {
          provider: 'codex',
          accountId: 'chatgpt-account-123',
          email: 'codex-user@example.com',
        },
      },
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_1","model":"gpt-5.4","status":"completed","output":[{"id":"msg_1","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"first"}]}],"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_http_2","model":"gpt-5.4","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"second"}]}],"usage":{"input_tokens":5,"output_tokens":1,"total_tokens":6}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_http_1',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      instructions: 'be helpful',
      input: [],
    }));

    const firstMessage = await firstResponsePromise;
    const secondResponsePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_http_2',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      previous_response_id: 'resp_http_1',
      input: [
        {
          id: 'tool_out_1',
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'tool result',
        },
      ],
    }));

    await secondResponsePromise;
    socket.close();

    expect(firstMessage?.type).toBe('response.completed');
    expect(upstreamConnectionCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.previous_response_id).toBeUndefined();
    expect(secondBody.input).toEqual([
      {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'first' }],
      },
      {
        id: 'tool_out_1',
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'tool result',
      },
    ]);
  });

  it('handles generate=false locally only for non-websocket-capable upstreams', async () => {
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock.mockResolvedValueOnce(createSseResponse([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_ws_after_prewarm","model":"gpt-4.1","status":"completed","output":[{"id":"msg_2","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"done"}]}],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
      'data: [DONE]\n\n',
    ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);

    const prewarmMessagesPromise = waitForSocketMessages(socket, 2);
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      generate: false,
    }));
    const prewarmMessages = await prewarmMessagesPromise;
    expect(prewarmMessages.map((message) => message.type)).toEqual(['response.created', 'response.completed']);
    expect(fetchMock).toHaveBeenCalledTimes(0);

    const secondResponsePromise = waitForSocketMessages(socket, 1);
    socket.send(JSON.stringify({
      type: 'response.create',
      previous_response_id: prewarmMessages[0]?.response?.id,
      input: [
        {
          id: 'msg_followup_1',
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'continue' }],
        },
      ],
    }));
    await secondResponsePromise;
    socket.close();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const forwardedBody = JSON.parse(String(options.body));
    expect(forwardedBody.generate).toBeUndefined();
    expect(forwardedBody.previous_response_id).toBeUndefined();
    expect(forwardedBody.model).toBe('gpt-4.1');
    expect(forwardedBody.input).toEqual([
      {
        id: 'msg_followup_1',
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'continue' }],
      },
    ]);
  });

  it('forwards generate=false upstream for websocket-capable upstreams instead of synthesizing prewarm events', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessages(socket, 1);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      generate: false,
    }));

    const messages = await messagesPromise;
    socket.close();

    expect(messages.map((message) => message.type)).toEqual(['response.completed']);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(upstreamRequests[0]).toMatchObject({
      type: 'response.create',
      generate: false,
    });
  });

  it('emits websocket error when the upstream stream closes before a terminal responses event', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamMessageHandler = (socket) => {
      socket.send(JSON.stringify({
        type: 'response.created',
        response: {
          id: 'resp_incomplete',
          model: 'gpt-5.4',
          created_at: 1706000000,
          status: 'in_progress',
          output: [],
        },
      }));
      socket.send(JSON.stringify({
        type: 'response.output_text.delta',
        output_index: 0,
        item_id: 'msg_ws',
        delta: 'partial',
      }));
      socket.close();
    };

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const messagesPromise = waitForSocketMessages(socket, 3, 400);

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello websocket' }],
        },
      ],
    }));

    const messages = await messagesPromise;
    socket.close();

    expect(messages.map((message) => message.type)).toEqual([
      'response.created',
      'response.output_text.delta',
      'error',
    ]);
    expect(messages[2]?.error?.message).toContain('stream closed before response.completed');
  });

  it('does not append websocket error after an upstream response.incomplete terminal event', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamMessageHandler = (socket) => {
      socket.send(JSON.stringify({
        type: 'response.incomplete',
        response: {
          id: 'resp_ws_incomplete',
          model: 'gpt-5.4',
          status: 'incomplete',
          output: [{
            id: 'msg_ws_incomplete',
            type: 'message',
            role: 'assistant',
            status: 'incomplete',
            content: [{ type: 'output_text', text: 'partial' }],
          }],
          incomplete_details: {
            reason: 'max_output_tokens',
          },
        },
      }));
      socket.close();
    };

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const incompletePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.incomplete',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const message = await incompletePromise;
    socket.close();

    expect(message?.type).toBe('response.incomplete');
    expect(message?.response?.incomplete_details?.reason).toBe('max_output_tokens');
  });

  it('does not append websocket error after an upstream response.failed terminal event with output', async () => {
    const selectedChannel = createSelectedChannel({
      siteUrl: upstreamSiteUrl,
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    upstreamMessageHandler = (socket) => {
      socket.send(JSON.stringify({
        type: 'response.failed',
        response: {
          id: 'resp_ws_failed',
          model: 'gpt-5.4',
          status: 'failed',
          output: [{
            id: 'msg_ws_failed',
            type: 'message',
            role: 'assistant',
            status: 'failed',
            content: [{ type: 'output_text', text: 'partial before failure' }],
          }],
          error: {
            message: 'tool crashed',
            type: 'server_error',
          },
        },
      }));
      socket.close();
    };

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const failedPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.failed',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const message = await failedPromise;
    socket.close();

    expect(message?.type).toBe('response.failed');
    expect(message?.response?.error?.message).toBe('tool crashed');
    expect(message?.response?.output?.[0]?.content?.[0]?.text).toBe('partial before failure');
  });

  it('carries forward output from response.incomplete terminal payloads on non-incremental websocket turns', async () => {
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.incomplete\n',
        'data: {"type":"response.incomplete","response":{"id":"resp_incomplete_followup","model":"gpt-5.4","status":"incomplete","output":[{"id":"msg_incomplete_followup","type":"message","role":"assistant","status":"incomplete","content":[{"type":"output_text","text":"partial"}]}],"output_text":"partial","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_followup_done","model":"gpt-5.4","status":"completed","output":[],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstMessagesPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.incomplete',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      input: [],
    }));

    const firstMessage = await firstMessagesPromise;
    const secondMessagesPromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_followup_done',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-5.4',
      previous_response_id: 'resp_incomplete_followup',
      input: [],
    }));

    await secondMessagesPromise;
    socket.close();

    expect(firstMessage?.response?.output).toEqual([
      {
        id: 'msg_incomplete_followup',
        type: 'message',
        role: 'assistant',
        status: 'incomplete',
        content: [{ type: 'output_text', text: 'partial' }],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.input).toHaveLength(1);
    expect(secondBody.input[0]).toMatchObject({
      type: 'message',
      role: 'assistant',
      status: 'incomplete',
      content: [{ type: 'output_text', text: 'partial' }],
    });
  });

  it('carries forward output from response.failed terminal payloads on non-incremental websocket turns', async () => {
    const selectedChannel = createSelectedChannel({
      sitePlatform: 'openai',
      actualModel: 'gpt-4.1',
    });
    selectChannelMock.mockReturnValue(selectedChannel);
    previewSelectedChannelMock.mockResolvedValue(selectedChannel);
    fetchMock
      .mockResolvedValueOnce(createSseResponse([
        'event: response.failed\n',
        'data: {"type":"response.failed","response":{"id":"resp_failed_followup","model":"gpt-4.1","status":"failed","output":[{"id":"msg_failed_followup","type":"message","role":"assistant","status":"failed","content":[{"type":"output_text","text":"partial failure"}]}],"error":{"message":"tool crashed","type":"server_error"},"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.completed\n',
        'data: {"type":"response.completed","response":{"id":"resp_failed_followup_done","model":"gpt-4.1","status":"completed","output":[],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n',
        'data: [DONE]\n\n',
      ]));

    const socket = createClientSocket(baseUrl);
    await waitForSocketOpen(socket);
    const firstMessagePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.failed',
    );

    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      input: [],
    }));

    const firstMessage = await firstMessagePromise;
    const secondMessagePromise = waitForSocketMessageMatching(
      socket,
      (message) => message?.type === 'response.completed' && message?.response?.id === 'resp_failed_followup_done',
    );
    socket.send(JSON.stringify({
      type: 'response.create',
      model: 'gpt-4.1',
      previous_response_id: 'resp_failed_followup',
      input: [],
    }));

    await secondMessagePromise;
    socket.close();

    expect(firstMessage?.response?.output).toEqual([
      {
        id: 'msg_failed_followup',
        type: 'message',
        role: 'assistant',
        status: 'failed',
        content: [{ type: 'output_text', text: 'partial failure' }],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondOptions.body));
    expect(secondBody.input).toHaveLength(1);
    expect(secondBody.input[0]).toMatchObject({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'partial failure' }],
    });
    expect(['failed', 'incomplete']).toContain(secondBody.input[0]?.status);
  });
});
