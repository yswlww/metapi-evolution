import { describe, expect, it } from 'vitest';

import { evaluateImageProviderEligibility } from './imageProviderEligibility.js';

describe('evaluateImageProviderEligibility', () => {
  it('keeps empty and legacy site values OpenAI-compatible', () => {
    expect(evaluateImageProviderEligibility({
      site: { id: 1, imageProvider: null },
      operation: 'edit',
      modelName: 'gpt-image-1',
    })).toEqual({ eligible: true, providerId: 'openai-compatible' });
  });

  it('rejects invalid and not-yet-registered providers with concrete reasons', () => {
    expect(evaluateImageProviderEligibility({
      site: { id: 2, name: 'invalid-site', imageProvider: 'invented' },
      operation: 'generate',
      modelName: 'image-model',
    })).toMatchObject({ eligible: false, providerId: null, reason: expect.stringContaining('配置无效') });

    expect(evaluateImageProviderEligibility({
      site: { id: 3, name: 'zhipu-site', imageProvider: 'zhipu' },
      operation: 'edit',
      modelName: 'cogview-4',
    })).toMatchObject({ eligible: false, providerId: 'zhipu', reason: expect.stringContaining('不支持图片编辑') });

    expect(evaluateImageProviderEligibility({
      site: { id: 4, name: 'zhipu-site', imageProvider: 'zhipu' },
      operation: 'generate',
      modelName: 'glm-4.5',
    })).toMatchObject({ eligible: false, providerId: 'zhipu', reason: expect.stringContaining('不支持以 generate 操作使用模型') });
  });
});
