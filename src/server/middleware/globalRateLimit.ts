import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getProxyAuthExecutionKey,
  resolveProxyAuthSocketAddress,
} from './auth.js';

export type GlobalRateLimitOptions = {
  max: number;
  windowMs: number;
};

function isActiveInternalSearchRequest(request: FastifyRequest): boolean {
  const rawUrl = request.raw.url || request.url || '';
  if (rawUrl.split('?')[0] !== '/v1/search') return false;

  const executionKey = getProxyAuthExecutionKey();
  if (!executionKey) return false;
  return request.raw.socket.remoteAddress === executionKey;
}

export async function registerGlobalRateLimit(
  app: FastifyInstance,
  options: GlobalRateLimitOptions,
): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.windowMs,
    keyGenerator: (request) => resolveProxyAuthSocketAddress(request),
    allowList: (request, _key) => isActiveInternalSearchRequest(request),
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
