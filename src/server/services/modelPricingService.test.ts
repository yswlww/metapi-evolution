import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock, withSiteProxyRequestInitMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  withSiteProxyRequestInitMock: vi.fn(),
}));

vi.mock('undici', () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('./siteProxy.js', () => ({
  withSiteProxyRequestInit: (...args: unknown[]) => withSiteProxyRequestInitMock(...args),
}));

import {
  calculateModelUsageBreakdown,
  calculateModelUsageCost,
  estimateProxyCost,
  fallbackTokenCost,
  fetchModelPricingCatalog,
  getCachedModelRoutingReferenceCost,
  refreshModelPricingCatalog,
  type EstimateProxyCostInput,
  type PricingModel,
} from './modelPricingService.js';

const CPA_PLATFORM_CASES = [
  { platform: 'cliproxyapi', id: 1 },
  { platform: ' CLIProxyAPI ', id: 2 },
  { platform: 'cpa', id: 3 },
  { platform: 'cli-proxy-api', id: 4 },
] as const;

function buildPricingInput(platform: string, id: number): EstimateProxyCostInput {
  return {
    site: {
      id,
      url: `https://cpa-${id}.example.com`,
      platform,
    },
    account: {
      id,
      accessToken: 'sk-cpa',
    },
    modelName: 'gpt-4o-mini',
    totalTokens: 1500,
  };
}

function mockCommonPricingResponse(): void {
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify([{
      model_name: 'gpt-4o-mini',
      quota_type: 0,
      model_ratio: 10,
      completion_ratio: 1,
      enable_groups: ['default'],
    }]),
  });
}

describe('modelPricingService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    withSiteProxyRequestInitMock.mockReset();
    withSiteProxyRequestInitMock.mockImplementation(async (_url: string, init: Record<string, unknown>) => init);
  });

  it('calculates token-based cost from model ratio and completion ratio', () => {
    const model: PricingModel = {
      modelName: 'gpt-4o',
      quotaType: 0,
      modelRatio: 2,
      completionRatio: 1.5,
      modelPrice: null,
      enableGroups: ['vip'],
    };

    const cost = calculateModelUsageCost(
      model,
      {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      },
      { default: 1, vip: 2 },
    );

    expect(cost).toBe(0.014);
  });

  it('falls back to total tokens when split token usage is missing', () => {
    const model: PricingModel = {
      modelName: 'claude-sonnet',
      quotaType: 0,
      modelRatio: 1,
      completionRatio: 2,
      modelPrice: null,
      enableGroups: ['default'],
    };

    const cost = calculateModelUsageCost(
      model,
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 2000,
      },
      { default: 1 },
    );

    expect(cost).toBe(0.004);
  });

  it('calculates per-call cost when quota type is call-based', () => {
    const model: PricingModel = {
      modelName: 'gpt-image-1',
      quotaType: 1,
      modelRatio: 1,
      completionRatio: 1,
      modelPrice: 0.3,
      enableGroups: ['vip'],
    };

    const cost = calculateModelUsageCost(
      model,
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      { default: 1, vip: 1.5 },
    );

    expect(cost).toBe(0.45);
  });

  it('calculates times-based per-call cost from input ratio only', () => {
    const model: PricingModel = {
      modelName: 'flux-kontext-pro',
      quotaType: 1,
      modelRatio: 1,
      completionRatio: 1,
      modelPrice: { input: 1, output: 3 },
      enableGroups: ['vip'],
    };

    const cost = calculateModelUsageCost(
      model,
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      { default: 1, vip: 2 },
    );

    expect(cost).toBe(0.004);
  });

  it('splits cache read and cache creation costs from prompt cost', () => {
    const model: PricingModel = {
      modelName: 'gpt-4o',
      quotaType: 0,
      modelRatio: 2.5,
      completionRatio: 5,
      cacheRatio: 0.1,
      cacheCreationRatio: 1.25,
      modelPrice: null,
      enableGroups: ['default'],
    };

    const detail = calculateModelUsageBreakdown(
      model,
      {
        promptTokens: 146638,
        completionTokens: 172,
        totalTokens: 146810,
        cacheReadTokens: 145692,
        cacheCreationTokens: 945,
        promptTokensIncludeCache: true,
      },
      { default: 1 },
    );

    expect(detail).toMatchObject({
      usage: {
        billablePromptTokens: 1,
        cacheReadTokens: 145692,
        cacheCreationTokens: 945,
      },
      pricing: {
        modelRatio: 2.5,
        completionRatio: 5,
        cacheRatio: 0.1,
        cacheCreationRatio: 1.25,
        groupRatio: 1,
      },
      breakdown: {
        inputPerMillion: 5,
        outputPerMillion: 25,
        cacheReadPerMillion: 0.5,
        cacheCreationPerMillion: 6.25,
        inputCost: 0.000005,
        outputCost: 0.0043,
        cacheReadCost: 0.072846,
        cacheCreationCost: 0.005906,
        totalCost: 0.083057,
      },
    });
  });

  it('keeps prompt tokens intact when upstream reports cache tokens separately', () => {
    const model: PricingModel = {
      modelName: 'claude-sonnet',
      quotaType: 0,
      modelRatio: 3,
      completionRatio: 5,
      cacheRatio: 0.3,
      cacheCreationRatio: 1.25,
      modelPrice: null,
      enableGroups: ['default'],
    };

    const cost = calculateModelUsageCost(
      model,
      {
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        cacheReadTokens: 1000,
        cacheCreationTokens: 40,
        promptTokensIncludeCache: false,
      },
      { default: 1 },
    );

    expect(cost).toBe(0.00372);
  });

  it('uses platform-specific fallback token divisor', () => {
    expect(fallbackTokenCost(1500, 'new-api')).toBe(0.003);
    expect(fallbackTokenCost(1500, 'veloera')).toBe(0.0015);
  });

  describe.each(CPA_PLATFORM_CASES)('CPA platform $platform', ({ platform, id }) => {
    it('does not request common pricing metadata while estimating proxy cost', async () => {
      const input = buildPricingInput(platform, 10_000 + id);

      const cost = await estimateProxyCost(input);

      expect(cost).toBe(0.003);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not request common pricing metadata for the cached catalog', async () => {
      const catalog = await fetchModelPricingCatalog(buildPricingInput(platform, 20_000 + id));

      expect(catalog).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not request common pricing metadata during forced refresh', async () => {
      const catalog = await refreshModelPricingCatalog(buildPricingInput(platform, 30_000 + id));

      expect(catalog).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not reuse warm pricing or routing-reference caches while estimating cost', async () => {
      const cacheId = 50_000 + id;
      mockCommonPricingResponse();
      const warmCatalog = await fetchModelPricingCatalog(buildPricingInput('new-api', cacheId));
      expect(warmCatalog?.models).toHaveLength(1);
      expect(getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: 'new-api',
        modelName: 'gpt-4o-mini',
      })).not.toBeNull();
      fetchMock.mockClear();

      const cost = await estimateProxyCost(buildPricingInput(platform, cacheId));

      expect(cost).toBe(0.003);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: platform,
        modelName: 'gpt-4o-mini',
      })).toBeNull();
    });

    it('does not reuse a warm cached catalog or routing-reference cache', async () => {
      const cacheId = 60_000 + id;
      mockCommonPricingResponse();
      const warmCatalog = await fetchModelPricingCatalog(buildPricingInput('new-api', cacheId));
      expect(warmCatalog?.models).toHaveLength(1);
      expect(getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: 'new-api',
        modelName: 'gpt-4o-mini',
      })).not.toBeNull();
      fetchMock.mockClear();

      const catalog = await fetchModelPricingCatalog(buildPricingInput(platform, cacheId));

      expect(catalog).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: platform,
        modelName: 'gpt-4o-mini',
      })).toBeNull();
    });

    it('invalidates warm pricing and routing-reference caches during forced refresh', async () => {
      const cacheId = 70_000 + id;
      mockCommonPricingResponse();
      const warmCatalog = await fetchModelPricingCatalog(buildPricingInput('new-api', cacheId));
      expect(warmCatalog?.models).toHaveLength(1);
      expect(getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: 'new-api',
        modelName: 'gpt-4o-mini',
      })).not.toBeNull();
      fetchMock.mockClear();

      const catalog = await refreshModelPricingCatalog(buildPricingInput(platform, cacheId));

      expect(catalog).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: platform,
        modelName: 'gpt-4o-mini',
      })).toBeNull();
    });

    it('does not expose a warm routing-reference cache for the CPA platform', async () => {
      const cacheId = 80_000 + id;
      mockCommonPricingResponse();
      const warmCatalog = await fetchModelPricingCatalog(buildPricingInput('new-api', cacheId));
      expect(warmCatalog?.models).toHaveLength(1);
      fetchMock.mockClear();

      const routingCost = getCachedModelRoutingReferenceCost({
        siteId: cacheId,
        accountId: cacheId,
        sitePlatform: platform,
        modelName: 'gpt-4o-mini',
      });

      expect(routingCost).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await fetchModelPricingCatalog(buildPricingInput(platform, cacheId))).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it.each(['orcarouter', 'orca-router', 'orca router'])('rejects insecure %s pricing requests before a bearer fetch', async (platform) => {
    await expect(fetchModelPricingCatalog({
      ...buildPricingInput(platform, 91_001 + platform.length),
      site: {
        id: 91_001 + platform.length,
        url: 'http://legacy.orcarouter.example',
        platform,
      },
      account: {
        id: 91_001 + platform.length,
        apiToken: 'orc-pricing-key',
      },
    })).rejects.toThrow('credential-free HTTPS');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(withSiteProxyRequestInitMock).not.toHaveBeenCalled();
  });

  it('fetches pricing metadata for a credential-free HTTPS OrcaRouter site', async () => {
    mockCommonPricingResponse();

    const catalog = await fetchModelPricingCatalog({
      ...buildPricingInput('orcarouter', 91_100),
      site: {
        id: 91_100,
        url: 'https://custom.orcarouter.example',
        platform: 'orcarouter',
      },
      account: {
        id: 91_100,
        apiToken: 'orc-pricing-key',
      },
    });

    expect(catalog?.models).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.orcarouter.example/api/pricing',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer orc-pricing-key' }) }),
    );
  });

  it('continues requesting common pricing metadata for generic new-api sites', async () => {
    mockCommonPricingResponse();

    const catalog = await fetchModelPricingCatalog(buildPricingInput('new-api', 40_001));

    expect(catalog?.models).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cpa-40001.example.com/api/pricing',
      expect.any(Object),
    );
  });
});
