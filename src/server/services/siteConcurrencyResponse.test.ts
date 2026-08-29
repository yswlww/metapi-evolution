import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '../config.js';
import { proxyChannelCoordinator, resetProxyChannelCoordinatorState, type ProxySiteLease } from './proxyChannelCoordinator.js';
import { bindSiteLeaseToResponse } from './siteConcurrencyResponse.js';

function buildLease() {
  return {
    siteId: 9,
    isActive: vi.fn(() => true),
    isTransferred: vi.fn(() => true),
    markTransferred: vi.fn(),
    release: vi.fn(),
    touch: vi.fn(),
  } satisfies ProxySiteLease;
}

afterEach(() => {
  vi.useRealTimers();
  resetProxyChannelCoordinatorState();
});

describe('bindSiteLeaseToResponse', () => {
  it('forwards chunks and releases exactly once at EOF', async () => {
    const lease = buildLease();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello '));
        controller.enqueue(new TextEncoder().encode('world'));
        controller.close();
      },
    });

    const wrapped = bindSiteLeaseToResponse(new Response(body, {
      status: 201,
      statusText: 'Created',
      headers: { 'x-test': 'yes' },
    }), lease);

    expect(lease.markTransferred).toHaveBeenCalledTimes(1);
    expect(wrapped.status).toBe(201);
    expect(wrapped.statusText).toBe('Created');
    expect(wrapped.headers.get('x-test')).toBe('yes');
    expect(await wrapped.text()).toBe('hello world');
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('propagates an upstream reader error and releases exactly once', async () => {
    const lease = buildLease();
    const expected = new Error('upstream stream failed');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(expected);
      },
    });

    const wrapped = bindSiteLeaseToResponse(new Response(body), lease);

    await expect(wrapped.arrayBuffer()).rejects.toBe(expected);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('propagates consumer cancellation to the source and releases exactly once', async () => {
    const lease = buildLease();
    const sourceCancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'));
      },
      cancel: sourceCancel,
    });

    const wrapped = bindSiteLeaseToResponse(new Response(body), lease);
    const reader = wrapped.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();
    await reader?.cancel('downstream stopped');

    expect(sourceCancel).toHaveBeenCalledWith('downstream stopped');
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('releases and cancels the upstream reader when the request aborts', async () => {
    const lease = buildLease();
    const controller = new AbortController();
    const sourceCancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(sourceController) {
        sourceController.enqueue(new TextEncoder().encode('partial'));
      },
      cancel: sourceCancel,
    });

    const wrapped = bindSiteLeaseToResponse(new Response(body), lease, controller.signal);
    const reader = wrapped.body?.getReader();
    await reader?.read();
    controller.abort();
    await vi.waitFor(() => expect(lease.release).toHaveBeenCalledTimes(1));

    expect(sourceCancel).toHaveBeenCalled();
  });

  it('releases immediately for a bodyless response while preserving metadata', () => {
    const lease = buildLease();
    const wrapped = bindSiteLeaseToResponse(new Response(null, {
      status: 204,
      statusText: 'No Content',
      headers: { 'x-test': 'bodyless' },
    }), lease);

    expect(wrapped.body).toBeNull();
    expect(wrapped.status).toBe(204);
    expect(wrapped.statusText).toBe('No Content');
    expect(wrapped.headers.get('x-test')).toBe('bodyless');
    expect(lease.markTransferred).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it('does not touch a lease more often than the configured keepalive interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const originalKeepalive = config.proxySiteConcurrencyLeaseKeepaliveMs;
    config.proxySiteConcurrencyLeaseKeepaliveMs = 1_000;
    const lease = buildLease();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('x'));
        controller.enqueue(new TextEncoder().encode('y'));
        controller.close();
      },
    });

    const wrapped = bindSiteLeaseToResponse(new Response(body), lease);
    await wrapped.text();
    expect(lease.touch).toHaveBeenCalledTimes(1);

    config.proxySiteConcurrencyLeaseKeepaliveMs = originalKeepalive;
  });

  it('allows an open stream to remain leased until the coordinator TTL expires', async () => {
    vi.useFakeTimers();
    const originalTtl = config.proxySiteConcurrencyLeaseTtlMs;
    config.proxySiteConcurrencyLeaseTtlMs = 5_000;
    const lease = await proxyChannelCoordinator.acquireSiteLease({ siteId: 9, maxConcurrency: 1 });
    const wrapped = bindSiteLeaseToResponse(new Response(new ReadableStream<Uint8Array>({
      pull() {},
    })), lease);

    expect(lease.isActive()).toBe(true);
    vi.advanceTimersByTime(4_999);
    expect(lease.isActive()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(lease.isActive()).toBe(false);
    await wrapped.body?.cancel();

    config.proxySiteConcurrencyLeaseTtlMs = originalTtl;
  });
});
