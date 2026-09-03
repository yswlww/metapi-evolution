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

  it('forwards stream activity to the lease so the coordinator owns keepalive throttling', async () => {
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
    expect(lease.touch.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps an actively consumed stream leased with a near-TTL keepalive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const originalTtl = config.proxySiteConcurrencyLeaseTtlMs;
    const originalKeepalive = config.proxySiteConcurrencyLeaseKeepaliveMs;
    config.proxySiteConcurrencyLeaseTtlMs = 5_000;
    config.proxySiteConcurrencyLeaseKeepaliveMs = 4_999;

    const lease = await proxyChannelCoordinator.acquireSiteLease({ siteId: 19, maxConcurrency: 1 });
    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const wrapped = bindSiteLeaseToResponse(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
      },
    })), lease);
    const reader = wrapped.body!.getReader();

    for (let second = 1; second <= 6; second += 1) {
      controllerRef!.enqueue(encoder.encode(String(second)));
      const read = reader.read();
      await vi.advanceTimersByTimeAsync(1_000);
      await read;
      expect(lease.isActive()).toBe(true);
    }

    controllerRef!.close();
    await reader.read();
    expect(lease.isActive()).toBe(false);
    config.proxySiteConcurrencyLeaseTtlMs = originalTtl;
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
