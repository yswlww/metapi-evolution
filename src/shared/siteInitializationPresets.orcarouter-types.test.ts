import { describe, expectTypeOf, it } from 'vitest';
import type { SiteInitializationPresetId } from './siteInitializationPresets.js';

describe('site initialization preset declaration', () => {
  it('accepts the OrcaRouter preset ID exposed by the runtime registry', () => {
    expectTypeOf<'orcarouter-openai'>().toMatchTypeOf<SiteInitializationPresetId>();
  });
});
