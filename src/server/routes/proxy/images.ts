import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fetch } from 'undici';
import { config } from '../../config.js';
import { tokenRouter } from '../../services/tokenRouter.js';
import { reportProxyAllFailed, reportTokenExpired } from '../../services/alertService.js';
import { isTokenExpiredError } from '../../services/alertRules.js';
import { estimateProxyCost } from '../../services/modelPricingService.js';
import { shouldRetryProxyRequest } from '../../services/proxyRetryPolicy.js';
import { ensureModelAllowedForDownstreamKey, getDownstreamRoutingPolicy, recordDownstreamCostUsage } from '../../services/downstreamRoutingPolicy.js';
import { composeProxyLogMessage } from '../../services/proxyLogMessage.js';
import { formatUtcSqlDateTime } from '../../services/localTimeService.js';
import { ensureMultipartBufferParser, parseMultipartFormData } from '../../services/multipartFormData.js';
import { getProxyAuthContext } from '../../middleware/auth.js';
import { detectDownstreamClientContext, type DownstreamClientContext } from '../../proxy-core/downstreamClientContext.js';
import { insertProxyLog } from '../../services/proxyLogStore.js';
import { fetchWithObservedFirstByte } from '../../proxy-core/firstByteTimeout.js';
import { getProxyMaxChannelRetries } from '../../services/proxyChannelRetry.js';
import { runWithProxySiteApiEndpointPool, SiteApiEndpointRequestError } from '../../services/siteApiEndpointService.js';
import {
  createProxyRequestAbortSignal,
  isSiteConcurrencyLimitError,
  replySiteConcurrencyLimit,
} from './siteConcurrencyBoundary.js';
import {
  executeImageProviderAttempt,
  getImageAttemptFirstByteLatencyMs,
  normalizeImageProviderResponse,
} from '../../services/imageProviderRequest.js';
import type { NeutralImageRequest } from '../../services/imageProviderRequest.js';
import {
  buildForcedChannelUnavailableMessage,
  canRetryChannelSelection,
  getTesterForcedChannelId,
  selectProxyChannelForAttempt,
} from '../../proxy-core/channelSelection.js';

export async function imagesProxyRoute(app: FastifyInstance) {
  ensureMultipartBufferParser(app);

  app.post('/v1/images/generations', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const requestedModel = body?.model || 'gpt-image-1';
    if (!await ensureModelAllowedForDownstreamKey(request, reply, requestedModel)) return;
    const downstreamPolicy = getDownstreamRoutingPolicy(request);
    const forcedChannelId = getTesterForcedChannelId({
      headers: request.headers as Record<string, unknown>,
      clientIp: request.ip,
    });
    const downstreamApiKeyId = getProxyAuthContext(request)?.keyId ?? null;
    const downstreamPath = '/v1/images/generations';
    const clientContext = detectDownstreamClientContext({
      downstreamPath,
      headers: request.headers as Record<string, unknown>,
      body,
    });
    const firstByteTimeoutMs = Math.max(0, Math.trunc((config.proxyFirstByteTimeoutSec || 0) * 1000));
    const neutralRequest: NeutralImageRequest = {
      operation: 'generate',
      requestedModel,
      jsonBody: body as Record<string, unknown>,
    };
    const excludeChannelIds: number[] = [];
    let retryCount = 0;
    let imageEligibilityReason: string | null = null;

    while (retryCount <= getProxyMaxChannelRetries()) {
      const selected = await selectProxyChannelForAttempt({
        requestedModel,
        downstreamPolicy,
        excludeChannelIds,
        retryCount,
        forcedChannelId,
        imageOperation: 'generate',
        onImageEligibilityRejected: (reason) => { imageEligibilityReason = reason; },
      });

      if (!selected) {
        const noChannelMessage = buildForcedChannelUnavailableMessage(forcedChannelId, imageEligibilityReason);
        await reportProxyAllFailed({
          model: requestedModel,
          reason: forcedChannelId ? noChannelMessage : 'No available channels after retries',
        });
        return reply.code(503).send({
          error: { message: noChannelMessage, type: 'server_error' },
        });
      }

      excludeChannelIds.push(selected.channel.id);
      const upstreamModel = selected.actualModel || requestedModel;
      const startTime = Date.now();
      const abort = createProxyRequestAbortSignal(request, reply);

      try {
        const { upstream, text, firstByteLatencyMs, provider } = await runWithProxySiteApiEndpointPool(selected.site, async (target, lease) => {
          const attemptStartedAtMs = Date.now();
          const attempt = await executeImageProviderAttempt({
            selected,
            target,
            request: neutralRequest,
            signal: abort.signal,
            fetchRequest: (url, init) => fetchWithObservedFirstByte(
              async (signal) => fetch(url, {
                ...(init as any),
                signal: signal
                  ? AbortSignal.any([abort.signal, signal])
                  : abort.signal,
              }),
              { firstByteTimeoutMs, startedAtMs: attemptStartedAtMs },
            ),
          });
          const observedFirstByteLatencyMs = getImageAttemptFirstByteLatencyMs(attempt.response);
          const responseText = await attempt.response.text();
          if (!attempt.response.ok) {
            throw new SiteApiEndpointRequestError(responseText || 'unknown error', {
              status: attempt.response.status,
              rawErrText: responseText || null,
              firstByteLatencyMs: observedFirstByteLatencyMs,
            });
          }
          return {
            upstream: attempt.response,
            provider: attempt.provider,
            text: responseText,
            firstByteLatencyMs: observedFirstByteLatencyMs,
          };
        }, { signal: abort.signal });

        const data = normalizeImageProviderResponse({
          provider,
          operation: neutralRequest.operation,
          modelName: upstreamModel,
          response: upstream,
          bodyText: text,
        });
        if (!data.ok) {
          await recordTokenRouterEventBestEffort('record malformed upstream response', () => tokenRouter.recordFailure(selected.channel.id, {
            status: 502,
            errorText: data.message,
            modelName: upstreamModel,
          }));
          logProxy(
            selected,
            requestedModel,
            'failed',
            502,
            Date.now() - startTime,
            data.message,
            retryCount,
            downstreamApiKeyId,
            0,
            downstreamPath,
            clientContext,
            false,
            firstByteLatencyMs,
          );
          if (canRetryChannelSelection(retryCount, forcedChannelId)) {
            retryCount++;
            continue;
          }
          await reportProxyAllFailed({
            model: requestedModel,
            reason: data.message,
          });
          return reply.code(502).send({
            error: { message: data.message, type: 'upstream_error' },
          });
        }

        const latency = Date.now() - startTime;
        let estimatedCost = 0;
        await recordTokenRouterEventBestEffort('estimate proxy cost', async () => {
          estimatedCost = await estimateProxyCost({
            site: selected.site,
            account: selected.account,
            modelName: upstreamModel,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          });
        });
        await recordTokenRouterEventBestEffort('record channel success', () => (
          tokenRouter.recordSuccess(selected.channel.id, latency, estimatedCost, upstreamModel)
        ));
        await recordTokenRouterEventBestEffort('record downstream cost usage', () => (
          recordDownstreamCostUsage(request, estimatedCost)
        ));
        logProxy(
          selected,
          requestedModel,
          'success',
          upstream.status,
          latency,
          null,
          retryCount,
          downstreamApiKeyId,
          estimatedCost,
          downstreamPath,
          clientContext,
          false,
          firstByteLatencyMs,
        );
        return reply.code(upstream.status).send(data.value);
      } catch (err: any) {
        if (isSiteConcurrencyLimitError(err)) {
          return replySiteConcurrencyLimit(reply, err);
        }
        const status = err instanceof SiteApiEndpointRequestError ? (err.status || 0) : 0;
        const errorText = err?.message || 'network failure';
        const firstByteLatencyMs = err instanceof SiteApiEndpointRequestError ? err.firstByteLatencyMs : null;
        await recordTokenRouterEventBestEffort('record channel failure', () => tokenRouter.recordFailure(selected.channel.id, {
          status,
          errorText,
          modelName: upstreamModel,
        }));
        logProxy(
          selected,
          requestedModel,
          'failed',
          status,
          Date.now() - startTime,
          errorText,
          retryCount,
          downstreamApiKeyId,
          0,
          downstreamPath,
          clientContext,
          false,
          firstByteLatencyMs,
        );
        if (status > 0 && isTokenExpiredError({ status, message: errorText })) {
          await reportTokenExpired({
            accountId: selected.account.id,
            username: selected.account.username,
            siteName: selected.site.name,
            detail: `HTTP ${status}`,
          });
        }
        if ((status > 0 ? shouldRetryProxyRequest(status, errorText) : true) && canRetryChannelSelection(retryCount, forcedChannelId)) {
          retryCount++;
          continue;
        }
        await reportProxyAllFailed({
          model: requestedModel,
          reason: errorText || 'network failure',
        });
        return reply.code(status || 502).send({
          error: {
            message: status > 0 ? errorText : `Upstream error: ${errorText}`,
            type: 'upstream_error',
          },
        });
      } finally {
        abort.dispose();
      }
    }
  });

  app.post('/v1/images/edits', async (request: FastifyRequest, reply: FastifyReply) => {
    const multipartForm = await parseMultipartFormData(request);
    const jsonBody = (!multipartForm && request.body && typeof request.body === 'object')
      ? request.body as Record<string, unknown>
      : null;
    const requestedModel = typeof multipartForm?.get('model') === 'string'
      ? String(multipartForm.get('model')).trim()
      : (typeof jsonBody?.model === 'string' ? jsonBody.model.trim() : '') || 'gpt-image-1';

    if (!await ensureModelAllowedForDownstreamKey(request, reply, requestedModel)) return;
    const downstreamPolicy = getDownstreamRoutingPolicy(request);
    const forcedChannelId = getTesterForcedChannelId({
      headers: request.headers as Record<string, unknown>,
      clientIp: request.ip,
    });
    const downstreamApiKeyId = getProxyAuthContext(request)?.keyId ?? null;
    const downstreamPath = '/v1/images/edits';
    const clientContext = detectDownstreamClientContext({
      downstreamPath,
      headers: request.headers as Record<string, unknown>,
      body: jsonBody || Object.fromEntries(multipartForm?.entries?.() || []),
    });
    const firstByteTimeoutMs = Math.max(0, Math.trunc((config.proxyFirstByteTimeoutSec || 0) * 1000));
    const neutralRequest: NeutralImageRequest = {
      operation: 'edit',
      requestedModel,
      jsonBody: jsonBody || undefined,
      multipartForm: multipartForm || undefined,
    };
    const excludeChannelIds: number[] = [];
    let retryCount = 0;
    let imageEligibilityReason: string | null = null;

    while (retryCount <= getProxyMaxChannelRetries()) {
      const selected = await selectProxyChannelForAttempt({
        requestedModel,
        downstreamPolicy,
        excludeChannelIds,
        retryCount,
        forcedChannelId,
        imageOperation: 'edit',
        onImageEligibilityRejected: (reason) => { imageEligibilityReason = reason; },
      });

      if (!selected) {
        const noChannelMessage = buildForcedChannelUnavailableMessage(forcedChannelId, imageEligibilityReason);
        await reportProxyAllFailed({
          model: requestedModel,
          reason: forcedChannelId ? noChannelMessage : 'No available channels after retries',
        });
        return reply.code(503).send({
          error: { message: noChannelMessage, type: 'server_error' },
        });
      }

      excludeChannelIds.push(selected.channel.id);
      const upstreamModel = selected.actualModel || requestedModel;
      const startTime = Date.now();
      const abort = createProxyRequestAbortSignal(request, reply);

      try {
        const { upstream, text, firstByteLatencyMs, provider } = await runWithProxySiteApiEndpointPool(selected.site, async (target, lease) => {
          const attemptStartedAtMs = Date.now();
          const attempt = await executeImageProviderAttempt({
            selected,
            target,
            request: neutralRequest,
            signal: abort.signal,
            fetchRequest: (url, init) => fetchWithObservedFirstByte(
              async (signal) => fetch(url, {
                ...(init as any),
                signal: signal
                  ? AbortSignal.any([abort.signal, signal])
                  : abort.signal,
              }),
              { firstByteTimeoutMs, startedAtMs: attemptStartedAtMs },
            ),
          });
          const observedFirstByteLatencyMs = getImageAttemptFirstByteLatencyMs(attempt.response);
          const responseText = await attempt.response.text();
          if (!attempt.response.ok) {
            throw new SiteApiEndpointRequestError(responseText || 'unknown error', {
              status: attempt.response.status,
              rawErrText: responseText || null,
              firstByteLatencyMs: observedFirstByteLatencyMs,
            });
          }
          return {
            upstream: attempt.response,
            provider: attempt.provider,
            text: responseText,
            firstByteLatencyMs: observedFirstByteLatencyMs,
          };
        }, { signal: abort.signal });

        const data = normalizeImageProviderResponse({
          provider,
          operation: neutralRequest.operation,
          modelName: upstreamModel,
          response: upstream,
          bodyText: text,
        });
        if (!data.ok) {
          await recordTokenRouterEventBestEffort('record malformed upstream response', () => tokenRouter.recordFailure(selected.channel.id, {
            status: 502,
            errorText: data.message,
            modelName: upstreamModel,
          }));
          logProxy(
            selected,
            requestedModel,
            'failed',
            502,
            Date.now() - startTime,
            data.message,
            retryCount,
            downstreamApiKeyId,
            0,
            downstreamPath,
            clientContext,
            false,
            firstByteLatencyMs,
          );
          if (canRetryChannelSelection(retryCount, forcedChannelId)) {
            retryCount++;
            continue;
          }
          await reportProxyAllFailed({
            model: requestedModel,
            reason: data.message,
          });
          return reply.code(502).send({
            error: { message: data.message, type: 'upstream_error' },
          });
        }

        const latency = Date.now() - startTime;
        let estimatedCost = 0;
        await recordTokenRouterEventBestEffort('estimate proxy cost', async () => {
          estimatedCost = await estimateProxyCost({
            site: selected.site,
            account: selected.account,
            modelName: upstreamModel,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          });
        });
        await recordTokenRouterEventBestEffort('record channel success', () => (
          tokenRouter.recordSuccess(selected.channel.id, latency, estimatedCost, upstreamModel)
        ));
        await recordTokenRouterEventBestEffort('record downstream cost usage', () => (
          recordDownstreamCostUsage(request, estimatedCost)
        ));
        logProxy(
          selected,
          requestedModel,
          'success',
          upstream.status,
          latency,
          null,
          retryCount,
          downstreamApiKeyId,
          estimatedCost,
          downstreamPath,
          clientContext,
          false,
          firstByteLatencyMs,
        );
        return reply.code(upstream.status).send(data.value);
      } catch (err: any) {
        if (isSiteConcurrencyLimitError(err)) {
          return replySiteConcurrencyLimit(reply, err);
        }
        const status = err instanceof SiteApiEndpointRequestError ? (err.status || 0) : 0;
        const errorText = err?.message || 'network failure';
        const firstByteLatencyMs = err instanceof SiteApiEndpointRequestError ? err.firstByteLatencyMs : null;
        await recordTokenRouterEventBestEffort('record channel failure', () => tokenRouter.recordFailure(selected.channel.id, {
          status,
          errorText,
          modelName: upstreamModel,
        }));
        logProxy(
          selected,
          requestedModel,
          'failed',
          status,
          Date.now() - startTime,
          errorText,
          retryCount,
          downstreamApiKeyId,
          0,
          downstreamPath,
          clientContext,
          false,
          firstByteLatencyMs,
        );
        if (status > 0 && isTokenExpiredError({ status, message: errorText })) {
          await reportTokenExpired({
            accountId: selected.account.id,
            username: selected.account.username,
            siteName: selected.site.name,
            detail: `HTTP ${status}`,
          });
        }
        if ((status > 0 ? shouldRetryProxyRequest(status, errorText) : true) && canRetryChannelSelection(retryCount, forcedChannelId)) {
          retryCount++;
          continue;
        }
        await reportProxyAllFailed({
          model: requestedModel,
          reason: errorText || 'network failure',
        });
        return reply.code(status || 502).send({
          error: {
            message: status > 0 ? errorText : `Upstream error: ${errorText}`,
            type: 'upstream_error',
          },
        });
      } finally {
        abort.dispose();
      }
    }
  });

  app.post('/v1/images/variations', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(400).send({
      error: {
        message: 'Image variations are not supported',
        type: 'invalid_request_error',
      },
    });
  });
}

async function logProxy(
  selected: any,
  modelRequested: string,
  status: string,
  httpStatus: number,
  latencyMs: number,
  errorMessage: string | null,
  retryCount: number,
  downstreamApiKeyId: number | null = null,
  estimatedCost = 0,
  downstreamPath = '/v1/images/generations',
  clientContext: DownstreamClientContext | null = null,
  isStream = false,
  firstByteLatencyMs: number | null = null,
) {
  try {
    const createdAt = formatUtcSqlDateTime(new Date());
    const normalizedErrorMessage = composeProxyLogMessage({
      clientKind: clientContext?.clientKind && clientContext.clientKind !== 'generic'
        ? clientContext.clientKind
        : null,
      sessionId: clientContext?.sessionId || null,
      traceHint: clientContext?.traceHint || null,
      downstreamPath,
      errorMessage,
    });
    await insertProxyLog({
      routeId: selected.channel.routeId,
      channelId: selected.channel.id,
      accountId: selected.account.id,
      downstreamApiKeyId,
      modelRequested,
      modelActual: selected.actualModel || modelRequested,
      status,
      httpStatus,
      isStream,
      firstByteLatencyMs,
      latencyMs,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost,
      clientFamily: clientContext?.clientKind || null,
      clientAppId: clientContext?.clientAppId || null,
      clientAppName: clientContext?.clientAppName || null,
      clientConfidence: clientContext?.clientConfidence || null,
      errorMessage: normalizedErrorMessage,
      retryCount,
      createdAt,
    });
  } catch (error) {
    console.warn('[proxy/images] failed to write proxy log', error);
  }
}

async function recordTokenRouterEventBestEffort(
  label: string,
  operation: () => Promise<unknown> | unknown,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.warn(`[proxy/images] failed to ${label}`, error);
  }
}
