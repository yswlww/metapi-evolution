import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as requestRateLimit from './requestRateLimit.js';
import { createRateLimitGuard, resetRequestRateLimitStore } from './requestRateLimit.js';

describe('request rate-limit guard', () => {
  beforeEach(() => {
    resetRequestRateLimitStore();
  });

  afterEach(async () => {
    resetRequestRateLimitStore();
  });

  it('uses a trusted custom identity instead of forwarded IP headers', async () => {
    const app = Fastify();
    app.get('/limited', {
      preHandler: [createRateLimitGuard({
        bucket: 'trusted-test',
        max: 1,
        windowMs: 60_000,
        keyGenerator: (request) => String(request.headers['x-test-identity'] || 'missing'),
      })],
    }, async () => ({ ok: true }));

    try {
      const first = await app.inject({
        method: 'GET', url: '/limited',
        headers: { 'x-test-identity': 'same', 'x-forwarded-for': '198.51.100.1' },
      });
      const second = await app.inject({
        method: 'GET', url: '/limited',
        headers: { 'x-test-identity': 'same', 'x-forwarded-for': '203.0.113.2' },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
      expect(second.headers['retry-after']).toMatch(/^\d+$/);
      expect(second.json()).toEqual({
        success: false,
        message: '请求过于频繁，请稍后再试',
      });
    } finally {
      await app.close();
    }
  });

  it('exposes the fixed-window operation used by transport-neutral callers', () => {
    type LimitResult = { allowed: boolean; retryAfterSec: number };
    type LimitOperation = (options: {
      bucket: string;
      identity: string;
      max: number;
      windowMs: number;
    }) => LimitResult;
    const consumeRateLimit = (requestRateLimit as unknown as {
      consumeRateLimit?: LimitOperation;
    }).consumeRateLimit;

    const first = consumeRateLimit
      ? consumeRateLimit({ bucket: 'transport-neutral-test', identity: 'socket-1', max: 1, windowMs: 60_000 })
      : null;
    const blocked = consumeRateLimit
      ? consumeRateLimit({ bucket: 'transport-neutral-test', identity: 'socket-1', max: 1, windowMs: 60_000 })
      : null;

    expect(first).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(blocked).toMatchObject({ allowed: false });
    expect(blocked?.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('shares one bucket between transport-neutral consumption and the Fastify guard', async () => {
    const app = Fastify();
    app.get('/limited', {
      preHandler: [createRateLimitGuard({
        bucket: 'shared-transport-test',
        max: 1,
        windowMs: 60_000,
        keyGenerator: () => 'shared-identity',
      })],
    }, async () => ({ ok: true }));

    try {
      const consumeRateLimit = (requestRateLimit as typeof requestRateLimit & {
        consumeRateLimit: (options: {
          bucket: string;
          identity: string;
          max: number;
          windowMs: number;
        }) => { allowed: boolean; retryAfterSec: number };
      }).consumeRateLimit;
      const first = consumeRateLimit({
        bucket: 'shared-transport-test',
        identity: 'shared-identity',
        max: 1,
        windowMs: 60_000,
      });
      const guarded = await app.inject({ method: 'GET', url: '/limited' });

      expect(first.allowed).toBe(true);
      expect(guarded.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});
