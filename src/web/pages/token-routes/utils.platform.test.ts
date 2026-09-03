import { describe, expect, it } from 'vitest';
import { inferEndpointTypesFromPlatform } from './utils.js';

describe('inferEndpointTypesFromPlatform', () => {
  it('treats AxonHub routes as OpenAI-compatible', () => {
    expect(inferEndpointTypesFromPlatform('axonhub')).toEqual(['openai']);
  });

  it('normalizes the AxonHub alias before inferring endpoint metadata', () => {
    expect(inferEndpointTypesFromPlatform('axon-hub')).toEqual(['openai']);
  });
});
