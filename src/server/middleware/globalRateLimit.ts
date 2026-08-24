import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export type GlobalRateLimitOptions = {
  max: number;
  windowMs: number;
};

export async function registerGlobalRateLimit(
  app: FastifyInstance,
  options: GlobalRateLimitOptions,
): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: (request) => request.raw.socket.remoteAddress || 'unknown',
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: 'Too many requests',
      retryAfter: context.after,
    }),
  });
}
