import * as routeRefreshWorkflow from '../services/routeRefreshWorkflow.js';
import { proxyChannelCoordinator } from '../services/proxyChannelCoordinator.js';
import { canRetryProxyChannel } from '../services/proxyChannelRetry.js';
import type { DownstreamRoutingPolicy } from '../services/downstreamPolicyTypes.js';
import { tokenRouter, type TokenRouterSelectionConstraint } from '../services/tokenRouter.js';
import { evaluateImageProviderEligibility } from '../services/imageProviderEligibility.js';
import type { ImageOperation } from '../services/imageProviders/types.js';

type SelectedChannel = Awaited<ReturnType<typeof tokenRouter.selectChannel>>;

export const TESTER_FORCED_CHANNEL_HEADER = 'x-metapi-tester-forced-channel-id';
export const TESTER_REQUEST_HEADER = 'x-metapi-tester-request';

function headerValueEquals(
  headers: Record<string, unknown> | undefined,
  expectedKey: string,
  expectedValue: string,
): boolean {
  if (!headers) return false;
  const normalizedExpectedKey = expectedKey.trim().toLowerCase();
  const normalizedExpectedValue = expectedValue.trim().toLowerCase();
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    if (rawKey.trim().toLowerCase() !== normalizedExpectedKey) continue;
    if (typeof rawValue === 'string' && rawValue.trim().toLowerCase() === normalizedExpectedValue) {
      return true;
    }
  }
  return false;
}

function isLoopbackClientIp(value: string | null | undefined): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return false;
  if (trimmed === '::1' || trimmed === '127.0.0.1') return true;
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice('::ffff:'.length).trim() === '127.0.0.1';
  }
  return false;
}

export function normalizeForcedChannelId(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

type TesterRequestInput = {
  headers?: Record<string, unknown>;
  clientIp?: string | null;
};

export function isTrustedTesterRequest(input?: TesterRequestInput): boolean {
  if (!input) return false;
  if (!isLoopbackClientIp(input.clientIp)) return false;
  return headerValueEquals(input.headers, TESTER_REQUEST_HEADER, '1');
}

export function getTesterForcedChannelId(input?: TesterRequestInput): number | null {
  if (!isTrustedTesterRequest(input)) return null;
  const headers = input?.headers;
  if (!headers) return null;
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    if (rawKey.trim().toLowerCase() !== TESTER_FORCED_CHANNEL_HEADER) continue;
    return normalizeForcedChannelId(rawValue);
  }
  return null;
}

export function buildForcedChannelUnavailableMessage(forcedChannelId?: number | null, detail?: string | null): string {
  const normalizedForcedChannelId = normalizeForcedChannelId(forcedChannelId);
  if (normalizedForcedChannelId === null) {
    return 'No available channels for this model';
  }
  const suffix = detail?.trim() ? `：${detail.trim()}` : '';
  return `指定通道 #${normalizedForcedChannelId} 当前不可用，固定通道模式不会自动切换其他通道${suffix}`;
}

export function canRetryChannelSelection(retryCount: number, forcedChannelId?: number | null): boolean {
  if (normalizeForcedChannelId(forcedChannelId) !== null) return false;
  return canRetryProxyChannel(retryCount);
}

export async function selectProxyChannelForAttempt(input: {
  requestedModel: string;
  downstreamPolicy: DownstreamRoutingPolicy;
  excludeChannelIds: number[];
  retryCount: number;
  stickySessionKey?: string | null;
  forcedChannelId?: number | null;
  imageOperation?: ImageOperation;
  onImageEligibilityRejected?: (reason: string) => void;
}): Promise<SelectedChannel> {
  const normalizedForcedChannelId = normalizeForcedChannelId(input.forcedChannelId);
  const selectionConstraint: TokenRouterSelectionConstraint | undefined = input.imageOperation
    ? ({ site, modelName }) => {
      const eligibility = evaluateImageProviderEligibility({
        site,
        operation: input.imageOperation!,
        modelName,
      });
      if (eligibility.eligible) return null;
      input.onImageEligibilityRejected?.(eligibility.reason);
      return eligibility.reason;
    }
    : undefined;
  const selectChannel = () => selectionConstraint
    ? tokenRouter.selectChannel(input.requestedModel, input.downstreamPolicy, selectionConstraint)
    : tokenRouter.selectChannel(input.requestedModel, input.downstreamPolicy);
  const selectNextChannel = () => selectionConstraint
    ? tokenRouter.selectNextChannel(
      input.requestedModel,
      input.excludeChannelIds,
      input.downstreamPolicy,
      selectionConstraint,
    )
    : tokenRouter.selectNextChannel(input.requestedModel, input.excludeChannelIds, input.downstreamPolicy);
  const selectPreferredChannel = (channelId: number) => selectionConstraint
    ? tokenRouter.selectPreferredChannel(
      input.requestedModel,
      channelId,
      input.downstreamPolicy,
      input.excludeChannelIds,
      selectionConstraint,
    )
    : tokenRouter.selectPreferredChannel(
      input.requestedModel,
      channelId,
      input.downstreamPolicy,
      input.excludeChannelIds,
    );
  if (normalizedForcedChannelId !== null) {
    if (input.retryCount > 0) return null;
    return await selectPreferredChannel(normalizedForcedChannelId);
  }

  let selected: SelectedChannel = null;
  let refreshedRoutes = false;

  const refreshRoutesForFirstAttempt = async (): Promise<boolean> => {
    if (input.retryCount > 0 || refreshedRoutes) return false;
    refreshedRoutes = true;
    try {
      await routeRefreshWorkflow.refreshModelsAndRebuildRoutes();
      return true;
    } catch (error) {
      console.warn('[proxy/surface] failed to refresh routes after empty selection', error);
      return false;
    }
  };

  if (input.retryCount === 0 && input.stickySessionKey) {
    const preferredChannelId = proxyChannelCoordinator.getStickyChannelId(input.stickySessionKey);
    if (preferredChannelId && !input.excludeChannelIds.includes(preferredChannelId)) {
      selected = await selectPreferredChannel(preferredChannelId);
      if (!selected) {
        const refreshSucceeded = await refreshRoutesForFirstAttempt();
        selected = await selectPreferredChannel(preferredChannelId);
        if (!selected && refreshSucceeded) {
          proxyChannelCoordinator.clearStickyChannel(input.stickySessionKey, preferredChannelId);
        }
      }
    }
  }

  if (!selected) {
    selected = input.retryCount === 0
      ? await selectChannel()
      : await selectNextChannel();
  }

  if (!selected && input.retryCount === 0 && !refreshedRoutes) {
    await refreshRoutesForFirstAttempt();
    selected = await selectChannel();
  }

  return selected;
}
