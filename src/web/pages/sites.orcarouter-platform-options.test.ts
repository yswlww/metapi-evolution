import { describe, expect, it } from 'vitest';
import { SITE_PLATFORM_OPTIONS } from './Sites.js';

describe('Sites platform options', () => {
  it('offers OrcaRouter as a named API-key-compatible platform', () => {
    expect(SITE_PLATFORM_OPTIONS).toContainEqual({
      value: 'orcarouter',
      label: 'OrcaRouter',
      description: 'OpenAI 兼容 API 中转，使用 API Key 发现和调用模型',
    });
  });
});
