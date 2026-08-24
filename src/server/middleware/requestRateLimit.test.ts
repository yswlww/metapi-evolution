import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
