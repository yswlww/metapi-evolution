import { normalizeImageProviderId, resolveImageProviderAdapter } from './imageProviders/registry.js';
import type { ImageOperation, ImageProviderId } from './imageProviders/types.js';
import type { TokenRouterSelectionConstraint } from './tokenRouter.js';

export type ImageProviderEligibilityInput = {
  site: {
    id?: number;
    name?: string | null;
    imageProvider?: string | null;
  };
  operation: ImageOperation;
  modelName: string;
};

export type ImageProviderEligibilityResult =
  | { eligible: true; providerId: ImageProviderId }
  | { eligible: false; providerId: ImageProviderId | null; reason: string };

export function evaluateImageProviderEligibility(
  input: ImageProviderEligibilityInput,
): ImageProviderEligibilityResult {
  const providerId = normalizeImageProviderId(input.site.imageProvider);
  const siteLabel = input.site.name?.trim() || (input.site.id ? `#${input.site.id}` : 'unknown');
  if (!providerId) {
    return {
      eligible: false,
      providerId: null,
      reason: `站点 ${siteLabel} 的图片供应商配置无效`,
    };
  }

  const adapter = resolveImageProviderAdapter(providerId);
  if (!adapter) {
    return {
      eligible: false,
      providerId,
      reason: `站点 ${siteLabel} 的图片供应商 ${providerId} 尚未注册`,
    };
  }

  if (!adapter.capabilities[input.operation]) {
    const operationLabel = input.operation === 'generate' ? '图片生成' : '图片编辑';
    return {
      eligible: false,
      providerId,
      reason: `图片供应商 ${providerId} 不支持${operationLabel}`,
    };
  }

  if (!adapter.supportsModel(input.modelName)) {
    return {
      eligible: false,
      providerId,
      reason: `图片供应商 ${providerId} 不支持模型 ${input.modelName}`,
    };
  }

  return { eligible: true, providerId };
}

export function createImageProviderSelectionConstraint(
  operation: ImageOperation,
): TokenRouterSelectionConstraint {
  return ({ site, modelName }) => {
    const result = evaluateImageProviderEligibility({ site, operation, modelName });
    return result.eligible ? null : result.reason;
  };
}
