import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  SiteConcurrencyLimitError,
  type SiteConcurrencyLimitReason,
} from '../../services/proxyChannelCoordinator.js';

function isSiteConcurrencyReason(value: unknown): value is SiteConcurrencyLimitReason {
  return value === 'queue_full' || value === 'wait_timeout' || value === 'aborted';
}

export function isSiteConcurrencyLimitError(error: unknown): error is SiteConcurrencyLimitError {
  if (error instanceof SiteConcurrencyLimitError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<SiteConcurrencyLimitError>;
  return candidate.code === 'site_concurrency_limit'
    && candidate.statusCode === 503
    && isSiteConcurrencyReason(candidate.reason)
    && typeof candidate.siteId === 'number';
}

export function replySiteConcurrencyLimit(
  reply: FastifyReply,
  error: SiteConcurrencyLimitError,
): FastifyReply | undefined {
  const raw = reply.raw as typeof reply.raw & {
    destroyed?: boolean;
    writableEnded?: boolean;
    writableFinished?: boolean;
  };
  if (error.reason === 'aborted' && (raw.destroyed || raw.writableEnded || raw.writableFinished)) {
    return undefined;
  }

  const retryAfterMs = Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 0;
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1_000));
  return reply
    .code(503)
    .header('Retry-After', String(retryAfterSeconds))
    .send({
      error: {
        type: 'site_concurrency_limit',
        message: 'Site concurrency limit reached',
      },
    });
}

export function createProxyRequestAbortSignal(
  request: FastifyRequest,
  reply: FastifyReply,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    request.raw.off('aborted', abort);
    reply.raw.off('close', abort);
  };

  const abort = () => {
    if (controller.signal.aborted) return;
    dispose();
    controller.abort();
  };

  request.raw.once('aborted', abort);
  reply.raw.once('close', abort);

  return { signal: controller.signal, dispose };
}
