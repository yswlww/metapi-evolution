import { describe, expect, it } from 'vitest';
import { ADAPTER_NAMES, ADAPTER_FALLBACK_LIST } from './adapters';
import { PLATFORM_ALIASES } from '../../../../src/shared/platformIdentity.js';
import { getAdapter } from '../../../../src/server/services/platforms/index.js';

describe('site platform choices', () => {
  it('offers every registered canonical platform, including generic API providers', () => {
    const values = Object.keys(ADAPTER_NAMES);
    for (const platform of new Set(Object.values(PLATFORM_ALIASES))) {
      expect(getAdapter(platform), platform).toBeDefined();
      expect(values, `missing site choice: ${platform}`).toContain(platform);
    }
  });

  it('uses backend-accepted identities and includes generic providers in fallback summaries', () => {
    for (const value of Object.keys(ADAPTER_NAMES)) expect(getAdapter(value), value).toBeDefined();
    expect(ADAPTER_NAMES.openai).toMatch(/OpenAI.*Compatible/i);
    expect(ADAPTER_FALLBACK_LIST.map(adapter => adapter.name)).toContain('OpenAI Compatible');
  });
});
