import { describe, expect, it } from 'vitest';

import { normalizeImageProviderResponse } from '../imageProviderRequest.js';
import { openAiCompatibleImageProvider } from './openAiCompatible.js';
import { resolveImageProviderAdapter } from './registry.js';

function respond(bodyText: string, status = 200) {
  return normalizeImageProviderResponse({
    provider: openAiCompatibleImageProvider,
    operation: 'generate',
    modelName: 'gpt-image-1',
    response: new Response(bodyText, { status }) as never,
    bodyText,
  });
}

describe('OpenAI-compatible image response validation', () => {
  it('accepts a response containing at least one usable image', () => {
    const result = respond(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }));
    expect(result.ok).toBe(true);
  });

  it('rejects an empty data array instead of passing it through as success', () => {
    const result = respond(JSON.stringify({ data: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no image/i);
  });

  it('rejects image entries that carry neither b64_json nor url', () => {
    const result = respond(JSON.stringify({ data: [{ revised_prompt: 'no payload' }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no image/i);
  });

  it('accepts an entry with a url when b64_json is absent', () => {
    const result = respond(JSON.stringify({ data: [{ url: 'https://cdn.example/image.png' }] }));
    expect(result.ok).toBe(true);
  });

  it('keeps non-generation payloads usable when the upstream returns an error body', () => {
    const result = normalizeImageProviderResponse({
      provider: openAiCompatibleImageProvider,
      operation: 'generate',
      modelName: 'gpt-image-1',
      response: new Response('{"error":{"message":"bad prompt"}}', { status: 400 }) as never,
      bodyText: '{"error":{"message":"bad prompt"}}',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/bad prompt/);
  });
});

describe('image provider registry', () => {
  it('resolves the OpenAI-compatible provider for a generic model', () => {
    expect(resolveImageProviderAdapter('openai-compatible')).toBe(openAiCompatibleImageProvider);
  });
});
