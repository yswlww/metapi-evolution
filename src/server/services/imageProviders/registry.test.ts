import { describe, expect, it } from 'vitest';

import {
  IMAGE_PROVIDER_IDS,
  normalizeImageProviderId,
  resolveImageProviderAdapter,
} from './registry.js';

describe('image provider registry', () => {
  it.each([null, undefined, '', '   '])('defaults %j to openai-compatible', (value) => {
    expect(normalizeImageProviderId(value)).toBe('openai-compatible');
    expect(resolveImageProviderAdapter(value)?.id).toBe('openai-compatible');
  });

  it('normalizes declared provider IDs without inventing aliases', () => {
    expect(IMAGE_PROVIDER_IDS).toEqual([
      'openai-compatible',
      'zhipu',
      'volcengine',
      'minimax',
      'dashscope',
      'gemini-imagen',
    ]);
    expect(normalizeImageProviderId(' ZHIPU ')).toBe('zhipu');
    expect(normalizeImageProviderId('openai')).toBeNull();
    expect(normalizeImageProviderId(42)).toBeNull();
  });

  it('does not claim an adapter exists before the provider is registered', () => {
    expect(resolveImageProviderAdapter('zhipu')).toBeNull();
    expect(resolveImageProviderAdapter('not-a-provider')).toBeNull();
  });

  it('exposes operation and model support on the default adapter', () => {
    const adapter = resolveImageProviderAdapter(null);
    expect(adapter?.capabilities).toEqual({ generate: true, edit: true });
    expect(adapter?.supportsModel('gpt-image-1')).toBe(true);
  });
});
