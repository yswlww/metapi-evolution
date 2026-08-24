import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

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

export function createGlobalRateLimitHook(app: FastifyInstance) {
  const enforceGlobalRateLimit = app.rateLimit();
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (request.routeOptions.config?.rateLimit !== undefined) return;
    await enforceGlobalRateLimit.call(app, request, reply);
  };
}
