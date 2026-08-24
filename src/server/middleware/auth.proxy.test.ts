import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimitGuard, resetRequestRateLimitStore } from './requestRateLimit.js';

const authorizeDownstreamTokenMock = vi.fn();
const consumeManagedKeyRequestMock = vi.fn();

vi.mock('../services/downstreamApiKeyService.js', () => ({
  authorizeDownstreamToken: (...args: unknown[]) => authorizeDownstreamTokenMock(...args),
  consumeManagedKeyRequest: (...args: unknown[]) => consumeManagedKeyRequestMock(...args),
}));

describe('proxyAuthMiddleware', () => {
  beforeEach(() => {
    authorizeDownstreamTokenMock.mockReset();
    consumeManagedKeyRequestMock.mockReset();
    resetRequestRateLimitStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetRequestRateLimitStore();
  });

  it('rejects missing proxy credentials', async () => {
    const { proxyAuthMiddleware } = await import('./auth.js');
    const app = Fastify();
    app.addHook('onRequest', proxyAuthMiddleware);
    app.get('/v1/ping', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/v1/ping' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: expect.stringContaining('Missing Authorization') });
    await app.close();
  });

  it('returns no proxy rate-limit identity before authentication', async () => {
    const { getProxyRateLimitIdentity } = await import('./auth.js');
    const app = Fastify();
    app.get('/v1/ping', async (request) => ({
      identity: getProxyRateLimitIdentity(request),
    }));

    const response = await app.inject({ method: 'GET', url: '/v1/ping' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ identity: null });
    await app.close();
  });
  it('stores managed key context without consuming quota in the auth hook', async () => {
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'sk-managed-001',
      key: { id: 12, name: 'project-key' },
      policy: { supportedModels: ['gpt-5.2'], allowedRouteIds: [3], siteWeightMultipliers: { 1: 1.2 } },
    });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);

    const { proxyAuthMiddleware, getProxyAuthContext, getProxyResourceOwner } = await import('./auth.js');
    const app = Fastify();
    app.addHook('onRequest', proxyAuthMiddleware);
    app.get('/v1/ping', async (request) => ({
      auth: getProxyAuthContext(request),
      owner: getProxyResourceOwner(request),
    }));

    const res = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { Authorization: 'Bearer sk-managed-001' },
    });

    expect(res.statusCode).toBe(200);
    expect(authorizeDownstreamTokenMock).toHaveBeenCalledWith('sk-managed-001');
    expect(consumeManagedKeyRequestMock).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({
      auth: {
        source: 'managed',
        keyId: 12,
        keyName: 'project-key',
        policy: {
          supportedModels: ['gpt-5.2'],
          allowedRouteIds: [3],
          siteWeightMultipliers: { 1: 1.2 },
        },
      },
      owner: {
        ownerType: 'managed_key',
        ownerId: '12',
      },
    });
    await app.close();
  });

  it('returns the managed key identity after successful proxy authentication', async () => {
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'managed',
      token: 'managed-token',
      key: { id: 42, name: 'project-key' },
      policy: {},
    });

    const { proxyAuthMiddleware, getProxyRateLimitIdentity } = await import('./auth.js');
    const app = Fastify();
    app.addHook('onRequest', proxyAuthMiddleware);
    app.get('/v1/ping', async (request) => ({
      identity: getProxyRateLimitIdentity(request),
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer managed-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ identity: 'managed:42' });
    await app.close();
  });

  it('returns the global identity after successful global proxy authentication', async () => {
    authorizeDownstreamTokenMock.mockResolvedValue({
      ok: true,
      source: 'global',
      token: 'global-token',
      policy: {},
    });

    const { proxyAuthMiddleware, getProxyRateLimitIdentity } = await import('./auth.js');
    const app = Fastify();
    app.addHook('onRequest', proxyAuthMiddleware);
    app.get('/v1/ping', async (request) => ({
      identity: getProxyRateLimitIdentity(request),
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer global-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ identity: 'global' });
    await app.close();
  });

  it('consumes managed quota only after the authenticated guard accepts', async () => {
    authorizeDownstreamTokenMock.mockImplementation(async (token: string) => ({
      ok: true as const,
      source: 'managed' as const,
      token,
      key: { id: token === 'managed-token-2' ? 43 : 42, name: 'project-key' },
      policy: {},
    }));
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);

    const { createProxyAuthRateLimitHook } = await import('./auth.js');
    const app = Fastify();
    await app.register(async (scope) => {
      scope.addHook('onRequest', createProxyAuthRateLimitHook({
        bucket: 'proxy-authenticated-lifecycle-test',
        max: 1,
        windowMs: 60_000,
      }));
      scope.get('/v1/ping', async () => ({ ok: true }));
    });

    const first = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer managed-token' },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer managed-token' },
    });
    const differentKey = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer managed-token-2' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(differentKey.statusCode).toBe(200);
    expect(consumeManagedKeyRequestMock.mock.calls).toEqual([[42], [43]]);
    await app.close();
  });

  it('does not consume quota or the authenticated bucket for failed proxy authentication', async () => {
    authorizeDownstreamTokenMock
      .mockResolvedValueOnce({ ok: false, statusCode: 401, error: 'Invalid token' })
      .mockResolvedValue({
        ok: true,
        source: 'managed',
        token: 'managed-token',
        key: { id: 42, name: 'project-key' },
        policy: {},
      });
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);

    const { createProxyAuthRateLimitHook } = await import('./auth.js');
    const app = Fastify();
    await app.register(async (scope) => {
      scope.addHook('onRequest', createProxyAuthRateLimitHook({
        bucket: 'proxy-authenticated-failed-auth-test',
        max: 1,
        windowMs: 60_000,
      }));
      scope.get('/v1/ping', async () => ({ ok: true }));
    });

    const rejected = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer invalid-token' },
    });
    const accepted = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer managed-token' },
    });
    const rateLimited = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer managed-token' },
    });

    expect(rejected.statusCode).toBe(401);
    expect(accepted.statusCode).toBe(200);
    expect(rateLimited.statusCode).toBe(429);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledTimes(1);
    expect(consumeManagedKeyRequestMock).toHaveBeenCalledWith(42);
    await app.close();
  });

  it('buckets authenticated proxy requests by managed key identity', async () => {
    authorizeDownstreamTokenMock.mockImplementation(async (token: string) => ({
      ok: true as const,
      source: 'managed' as const,
      token,
      key: { id: token === 'managed-token-2' ? 43 : 42, name: 'project-key' },
      policy: {},
    }));
    consumeManagedKeyRequestMock.mockResolvedValue(undefined);

    const { proxyAuthMiddleware, getProxyRateLimitIdentity } = await import('./auth.js');
    const app = Fastify();
    app.addHook('onRequest', proxyAuthMiddleware);
    app.addHook('onRequest', createRateLimitGuard({
      bucket: 'proxy-authenticated-test',
      max: 1,
      windowMs: 60_000,
      keyGenerator: (request) => getProxyRateLimitIdentity(request) || 'missing',
    }));
    app.get('/v1/ping', async () => ({ ok: true }));

    const first = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: {
        authorization: 'Bearer managed-token',
        'x-forwarded-for': '198.51.100.1',
      },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: {
        authorization: 'Bearer managed-token',
        'x-forwarded-for': '203.0.113.2',
      },
    });
    const differentKey = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: {
        authorization: 'Bearer managed-token-2',
        'x-forwarded-for': '203.0.113.2',
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(differentKey.statusCode).toBe(200);
    await app.close();
  });
});
