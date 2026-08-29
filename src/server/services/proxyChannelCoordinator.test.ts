import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config.js';
import {
  proxyChannelCoordinator,
  resetProxyChannelCoordinatorState,
} from './proxyChannelCoordinator.js';

describe('proxyChannelCoordinator', () => {
  const originalStickyEnabled = config.proxyStickySessionEnabled;
  const originalStickyTtlMs = config.proxyStickySessionTtlMs;
  const originalConcurrencyLimit = config.proxySessionChannelConcurrencyLimit;
  const originalQueueWaitMs = config.proxySessionChannelQueueWaitMs;
  const originalLeaseTtlMs = config.proxySessionChannelLeaseTtlMs;
  const originalLeaseKeepaliveMs = config.proxySessionChannelLeaseKeepaliveMs;
  const originalSiteQueueLimit = config.proxySiteConcurrencyQueueLimit;
  const originalSiteQueueWaitMs = config.proxySiteConcurrencyQueueWaitMs;
  const originalSiteLeaseTtlMs = config.proxySiteConcurrencyLeaseTtlMs;
  const originalSiteLeaseKeepaliveMs = config.proxySiteConcurrencyLeaseKeepaliveMs;

  beforeEach(() => {
    vi.useFakeTimers();
    config.proxyStickySessionEnabled = true;
    config.proxyStickySessionTtlMs = 31_000;
    config.proxySessionChannelConcurrencyLimit = 1;
    config.proxySessionChannelQueueWaitMs = 200;
    config.proxySessionChannelLeaseTtlMs = 100;
    config.proxySessionChannelLeaseKeepaliveMs = 30;
    config.proxySiteConcurrencyQueueLimit = 2;
    config.proxySiteConcurrencyQueueWaitMs = 200;
    config.proxySiteConcurrencyLeaseTtlMs = 100;
    config.proxySiteConcurrencyLeaseKeepaliveMs = 30;
    resetProxyChannelCoordinatorState();
  });

  afterEach(() => {
    config.proxyStickySessionEnabled = originalStickyEnabled;
    config.proxyStickySessionTtlMs = originalStickyTtlMs;
    config.proxySessionChannelConcurrencyLimit = originalConcurrencyLimit;
    config.proxySessionChannelQueueWaitMs = originalQueueWaitMs;
    config.proxySessionChannelLeaseTtlMs = originalLeaseTtlMs;
    config.proxySessionChannelLeaseKeepaliveMs = originalLeaseKeepaliveMs;
    config.proxySiteConcurrencyQueueLimit = originalSiteQueueLimit;
    config.proxySiteConcurrencyQueueWaitMs = originalSiteQueueWaitMs;
    config.proxySiteConcurrencyLeaseTtlMs = originalSiteLeaseTtlMs;
    config.proxySiteConcurrencyLeaseKeepaliveMs = originalSiteLeaseKeepaliveMs;
    resetProxyChannelCoordinatorState();
    vi.useRealTimers();
  });

  it('stores sticky bindings for session-scoped channels and expires them by ttl', async () => {
    const key = proxyChannelCoordinator.buildStickySessionKey({
      clientKind: 'codex',
      sessionId: 'turn-123',
      requestedModel: 'gpt-5.2',
      downstreamPath: '/v1/responses',
      downstreamApiKeyId: 9,
    });

    proxyChannelCoordinator.bindStickyChannel(key, 42, JSON.stringify({ credentialMode: 'session' }));
    expect(proxyChannelCoordinator.getStickyChannelId(key)).toBe(42);

    await vi.advanceTimersByTimeAsync(31_100);
    expect(proxyChannelCoordinator.getStickyChannelId(key)).toBeNull();
  });

  it('does not store sticky bindings for apikey-only channels', () => {
    const key = proxyChannelCoordinator.buildStickySessionKey({
      clientKind: 'codex',
      sessionId: 'turn-456',
      requestedModel: 'gpt-5.2',
      downstreamPath: '/v1/responses',
      downstreamApiKeyId: 9,
    });

    proxyChannelCoordinator.bindStickyChannel(key, 42, JSON.stringify({ credentialMode: 'apikey' }));
    expect(proxyChannelCoordinator.getStickyChannelId(key)).toBeNull();
  });

  it('treats structured oauth providers as session-scoped even when extraConfig omits oauth.provider', () => {
    const key = proxyChannelCoordinator.buildStickySessionKey({
      clientKind: 'codex',
      sessionId: 'turn-oauth-structured',
      requestedModel: 'gpt-5.2',
      downstreamPath: '/v1/responses',
      downstreamApiKeyId: 9,
    });

    proxyChannelCoordinator.bindStickyChannel(key, 42, {
      oauthProvider: 'codex',
      extraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    expect(proxyChannelCoordinator.getStickyChannelId(key)).toBe(42);
  });

  it('queues requests behind the active lease and grants the next waiter after release', async () => {
    const first = await proxyChannelCoordinator.acquireChannelLease({
      channelId: 11,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    expect(first.status).toBe('acquired');
    if (first.status !== 'acquired') return;

    let secondSettled = false;
    const secondPromise = proxyChannelCoordinator.acquireChannelLease({
      channelId: 11,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    }).then((result) => {
      secondSettled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(secondSettled).toBe(false);

    first.lease.release();
    await vi.advanceTimersByTimeAsync(0);

    const second = await secondPromise;
    expect(second.status).toBe('acquired');
    if (second.status === 'acquired') {
      second.lease.release();
    }
  });

  it('times out queued requests when no slot becomes available', async () => {
    const first = await proxyChannelCoordinator.acquireChannelLease({
      channelId: 11,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    expect(first.status).toBe('acquired');
    if (first.status !== 'acquired') return;

    const secondPromise = proxyChannelCoordinator.acquireChannelLease({
      channelId: 11,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });

    await vi.advanceTimersByTimeAsync(250);
    await expect(secondPromise).resolves.toEqual({
      status: 'timeout',
      waitMs: 200,
    });

    first.lease.release();
  });

  it('keeps active leases alive until they are explicitly released', async () => {
    const first = await proxyChannelCoordinator.acquireChannelLease({
      channelId: 11,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    expect(first.status).toBe('acquired');
    if (first.status !== 'acquired') return;

    let secondSettled = false;
    const secondPromise = proxyChannelCoordinator.acquireChannelLease({
      channelId: 11,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    }).then((result) => {
      secondSettled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(180);
    expect(first.lease.isActive()).toBe(true);
    expect(secondSettled).toBe(false);

    first.lease.release();
    await vi.advanceTimersByTimeAsync(0);

    const second = await secondPromise;
    expect(second.status).toBe('acquired');
    if (second.status === 'acquired') {
      second.lease.release();
    }
  });

  it('exposes the set of currently active leased channels', async () => {
    const lease = await proxyChannelCoordinator.acquireChannelLease({
      channelId: 23,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    expect(lease.status).toBe('acquired');
    if (lease.status !== 'acquired') return;

    expect(proxyChannelCoordinator.getActiveChannelIds()).toEqual([23]);

    lease.lease.release();
    expect(proxyChannelCoordinator.getActiveChannelIds()).toEqual([]);
  });

  it('reports active and waiting load for a guarded session channel', async () => {
    const first = await proxyChannelCoordinator.acquireChannelLease({
      channelId: 31,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    expect(first.status).toBe('acquired');
    if (first.status !== 'acquired') return;

    const secondPromise = proxyChannelCoordinator.acquireChannelLease({
      channelId: 31,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(proxyChannelCoordinator.getChannelLoadSnapshot({
      channelId: 31,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
    })).toEqual({
      channelId: 31,
      sessionScoped: true,
      concurrencyLimit: 1,
      activeLeaseCount: 1,
      waitingCount: 1,
      loadRatio: 2,
      saturated: true,
    });

    first.lease.release();
    await vi.advanceTimersByTimeAsync(0);

    const second = await secondPromise;
    expect(second.status).toBe('acquired');
    if (second.status === 'acquired') {
      second.lease.release();
    }
  });

  it('acquires site leases in FIFO order at the configured cap', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const acquisitionOrder: number[] = [];
    const secondPromise = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 })
      .then((lease) => {
        acquisitionOrder.push(2);
        return lease;
      });
    await vi.advanceTimersByTimeAsync(0);
    const thirdPromise = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 })
      .then((lease) => {
        acquisitionOrder.push(3);
        return lease;
      });
    await vi.advanceTimersByTimeAsync(0);

    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toEqual({
      siteId: 1,
      limit: 1,
      activeLeaseCount: 1,
      waitingCount: 2,
    });

    first.release();
    const second = await secondPromise;
    expect(acquisitionOrder).toEqual([2]);
    expect(second.isActive()).toBe(true);

    second.release();
    const third = await thirdPromise;
    expect(acquisitionOrder).toEqual([2, 3]);
    third.release();
  });

  it('keeps site limits independent', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const otherSite = await proxyChannelCoordinator.acquireSiteLease({ siteId: 2, maxConcurrency: 1 });

    expect(first.isActive()).toBe(true);
    expect(otherSite.isActive()).toBe(true);

    first.release();
    otherSite.release();
  });

  it('rejects a full site queue with a typed error and diagnostic', async () => {
    config.proxySiteConcurrencyQueueLimit = 1;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const waiting = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });

    await expect(proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 }))
      .rejects.toMatchObject({
        code: 'site_concurrency_limit',
        reason: 'queue_full',
        statusCode: 503,
        retryAfterMs: 200,
        siteId: 1,
      });
    expect(warn).toHaveBeenCalledWith('[site-concurrency]', expect.objectContaining({
      event: 'queue_full', siteId: 1,
    }));

    first.release();
    (await waiting).release();
    warn.mockRestore();
  });

  it('times out site waiters and logs the exceptional outcome', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const waiting = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });

    const waitingExpectation = expect(waiting).rejects.toMatchObject({
      code: 'site_concurrency_limit',
      reason: 'wait_timeout',
      retryAfterMs: 200,
      siteId: 1,
    });
    await vi.advanceTimersByTimeAsync(201);
    await waitingExpectation;
    expect(warn).toHaveBeenCalledWith('[site-concurrency]', expect.objectContaining({
      event: 'wait_timeout', siteId: 1,
    }));
    first.release();
    warn.mockRestore();
  });

  it('removes an aborted site waiter without allocating a lease', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const controller = new AbortController();
    const waiting = proxyChannelCoordinator.acquireSiteLease({
      siteId: 1,
      maxConcurrency: 1,
      signal: controller.signal,
    });

    controller.abort();
    await expect(waiting).rejects.toMatchObject({ reason: 'aborted', siteId: 1 });
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toMatchObject({
      activeLeaseCount: 1,
      waitingCount: 0,
    });
    first.release();
  });

  it('expires site leases at TTL unless touch refreshes them', async () => {
    config.proxySiteConcurrencyLeaseTtlMs = 5_000;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lease = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });

    await vi.advanceTimersByTimeAsync(4_990);
    lease.touch();
    await vi.advanceTimersByTimeAsync(4_990);
    expect(lease.isActive()).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(lease.isActive()).toBe(false);
    expect(warn).toHaveBeenCalledWith('[site-concurrency]', expect.objectContaining({
      event: 'lease_ttl_expired', siteId: 1,
    }));
    warn.mockRestore();
  });

  it('bounds site lease timers to Node safe timeout range', async () => {
    config.proxySiteConcurrencyLeaseTtlMs = Number.MAX_SAFE_INTEGER;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const lease = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const ttlDelay = Number(setTimeoutSpy.mock.calls.at(-1)?.[1]);

    expect(ttlDelay).toBeLessThanOrEqual(2_147_483_647);
    await vi.advanceTimersByTimeAsync(1);
    expect(lease.isActive()).toBe(true);

    lease.release();
    setTimeoutSpy.mockRestore();
  });

  it('limits site lease touch renewals to the keepalive cadence', async () => {
    config.proxySiteConcurrencyLeaseTtlMs = 5_000;
    config.proxySiteConcurrencyLeaseKeepaliveMs = 1_000;
    const lease = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });

    await vi.advanceTimersByTimeAsync(500);
    lease.touch();
    await vi.advanceTimersByTimeAsync(4_500);
    expect(lease.isActive()).toBe(false);
  });

  it('rejects an expired site waiter during drain and continues FIFO processing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const expiredResult = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 })
      .then((lease) => ({ kind: 'resolved' as const, lease }), (error) => ({ kind: 'rejected' as const, error }));
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 100);
    const nextResult = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 })
      .then((lease) => ({ kind: 'resolved' as const, lease }), (error) => ({ kind: 'rejected' as const, error }));
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(Date.now() + 101);
    first.release();

    const expired = await expiredResult;
    if (expired.kind === 'resolved') expired.lease.release();
    const next = await nextResult;
    if (next.kind === 'resolved') next.lease.release();

    expect(expired).toMatchObject({
      kind: 'rejected',
      error: {
        code: 'site_concurrency_limit',
        reason: 'wait_timeout',
        statusCode: 503,
        siteId: 1,
      },
    });
    expect(next.kind).toBe('resolved');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[site-concurrency]', expect.objectContaining({
      event: 'wait_timeout', siteId: 1,
    }));
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toMatchObject({
      activeLeaseCount: 0,
      waitingCount: 0,
    });
    warn.mockRestore();
  });

  it('supports idempotent release and transferred ownership for tracked and unlimited leases', async () => {
    const lease = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    expect(lease.isTransferred()).toBe(false);
    lease.markTransferred();
    lease.markTransferred();
    expect(lease.isTransferred()).toBe(true);
    lease.release();
    lease.release();
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toMatchObject({ activeLeaseCount: 0 });

    const unlimited = await proxyChannelCoordinator.acquireSiteLease({ siteId: 2, maxConcurrency: 0 });
    expect(unlimited.isActive()).toBe(false);
    expect(unlimited.isTransferred()).toBe(false);
    unlimited.markTransferred();
    expect(unlimited.isTransferred()).toBe(true);
  });

  it('uses the latest site limit while draining dynamic decreases and increases', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 2 });
    const second = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 2 });
    const third = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 2 });
    await vi.advanceTimersByTimeAsync(0);

    proxyChannelCoordinator.updateSiteConcurrencyLimit(1, 1);
    first.release();
    let settled = false;
    void third.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    second.release();
    proxyChannelCoordinator.updateSiteConcurrencyLimit(1, 2);
    const granted = await third;
    expect(granted.isActive()).toBe(true);
    granted.release();
  });

  it('grants existing site waiters before a later caller after a limit increase', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const acquisitionOrder: string[] = [];
    const olderPromise = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 })
      .then((lease) => {
        acquisitionOrder.push('older');
        return lease;
      });
    await vi.advanceTimersByTimeAsync(0);

    const laterPromise = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 2 })
      .then((lease) => {
        acquisitionOrder.push('later');
        return lease;
      });
    await vi.advanceTimersByTimeAsync(0);

    expect(acquisitionOrder).toEqual(['older']);
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toMatchObject({
      limit: 2,
      activeLeaseCount: 2,
      waitingCount: 1,
    });

    const older = await olderPromise;
    first.release();
    older.release();
    const later = await laterPromise;
    expect(acquisitionOrder).toEqual(['older', 'later']);
    later.release();
  });

  it('immediately grants queued site waiters as no-op leases when the limit becomes unlimited', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const waiting = proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    proxyChannelCoordinator.updateSiteConcurrencyLimit(1, null);
    const granted = await waiting;
    expect(granted.isActive()).toBe(false);
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1)).toEqual({
      siteId: 1, limit: 0, activeLeaseCount: 1, waitingCount: 0,
    });
    first.release();
  });

  it('rejects queued site waiters and clears leases when reset', async () => {
    const first = await proxyChannelCoordinator.acquireSiteLease({ siteId: 1, maxConcurrency: 1 });
    const waiterController = new AbortController();
    const waiting = proxyChannelCoordinator.acquireSiteLease({
      siteId: 1,
      maxConcurrency: 1,
      signal: waiterController.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(proxyChannelCoordinator.getSiteConcurrencySnapshot(1).waitingCount).toBe(1);

    const waitingExpectation = expect(waiting).rejects.toMatchObject({ reason: 'aborted', siteId: 1 });
    resetProxyChannelCoordinatorState();
    await waitingExpectation;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(first.isActive()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('treats structured oauth providers as session-scoped in load snapshots', () => {
    expect(proxyChannelCoordinator.getChannelLoadSnapshot({
      channelId: 41,
      accountExtraConfig: JSON.stringify({ credentialMode: 'session' }),
      accountOauthProvider: 'codex',
    })).toEqual({
      channelId: 41,
      sessionScoped: true,
      concurrencyLimit: 1,
      activeLeaseCount: 0,
      waitingCount: 0,
      loadRatio: 0,
      saturated: false,
    });
  });
});
