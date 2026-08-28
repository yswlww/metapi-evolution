import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/BrandIcon.js', () => ({
  getBrand: () => null,
  normalizeBrandIconKey: (icon: string) => icon.trim().toLowerCase(),
}));

import {
  ROUTE_ICON_NONE_VALUE,
  inferEndpointTypesFromPlatform,
  normalizeRouteDisplayIconValue,
  resolveRouteIcon,
} from './utils.js';

describe('token route icon helpers', () => {
  it('uses OpenAI endpoints for OrcaRouter site fallbacks', () => {
    expect(inferEndpointTypesFromPlatform('orcarouter')).toEqual(['openai']);
  });

  it('preserves the explicit no-icon sentinel during normalization', () => {
    expect(normalizeRouteDisplayIconValue(ROUTE_ICON_NONE_VALUE)).toBe(ROUTE_ICON_NONE_VALUE);
  });

  it('treats the explicit no-icon sentinel as no icon', () => {
    expect(resolveRouteIcon({ displayIcon: ROUTE_ICON_NONE_VALUE })).toEqual({ kind: 'none' });
  });
});
