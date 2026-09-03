import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { SiteConcurrencyLimitError } from '../../services/proxyChannelCoordinator.js';
import {
  createProxyRequestAbortSignal,
  isSiteConcurrencyLimitError,
  replySiteConcurrencyLimit,
} from './siteConcurrencyBoundary.js';

function buildReplySpy(raw: Partial<NodeJS.EventEmitter & {
  destroyed?: boolean;
  writableEnded?: boolean;
}> = {}) {
  const reply = {
    raw: Object.assign(new EventEmitter(), raw),
    code: vi.fn(function code(this: any) { return this; }),
    header: vi.fn(function header(this: any) { return this; }),
    send: vi.fn(function send(this: any) { return this; }),
  };
  return reply as unknown as FastifyReply & {
    code: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

function buildRequest() {
  return { raw: new EventEmitter() } as unknown as FastifyRequest;
}

describe('site concurrency Fastify boundary', () => {
  it('maps queue and timeout errors to 503 with rounded Retry-After seconds', () => {
    const reply = buildReplySpy();
    const error = new SiteConcurrencyLimitError({
      siteId: 9,
      reason: 'wait_timeout',
      retryAfterMs: 1_500,
    });

    expect(replySiteConcurrencyLimit(reply, error)).toBe(reply);
    expect(reply.code).toHaveBeenCalledWith(503);
    expect(reply.header).toHaveBeenCalledWith('Retry-After', '2');
    expect(reply.send).toHaveBeenCalledWith({
      error: { type: 'site_concurrency_limit', message: 'Site concurrency limit reached' },
    });
  });

  it('identifies only site concurrency limit errors', () => {
    expect(isSiteConcurrencyLimitError(new SiteConcurrencyLimitError({
      siteId: 1,
      reason: 'queue_full',
      retryAfterMs: 1_500,
    }))).toBe(true);
    expect(isSiteConcurrencyLimitError(new Error('site concurrency limit'))).toBe(false);
  });

  it('does not send a replacement response after an aborted closed reply', () => {
    const reply = buildReplySpy({ destroyed: true });
    const error = new SiteConcurrencyLimitError({
      siteId: 9,
      reason: 'aborted',
      retryAfterMs: 1_500,
    });

    expect(replySiteConcurrencyLimit(reply, error)).toBeUndefined();
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('aborts once when either request or reply closes and can be disposed', () => {
    const request = buildRequest();
    const reply = buildReplySpy();
    const { signal, dispose } = createProxyRequestAbortSignal(request, reply);

    (request.raw as unknown as EventEmitter).emit('aborted');
    expect(signal.aborted).toBe(true);
    (reply.raw as unknown as EventEmitter).emit('close');
    expect(signal.aborted).toBe(true);

    const second = createProxyRequestAbortSignal(request, reply);
    second.dispose();
    (request.raw as unknown as EventEmitter).emit('aborted');
    expect(second.signal.aborted).toBe(false);
  });
});
