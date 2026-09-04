import { describe, expect, it, vi } from 'vitest';

import { executeImageProviderAttempt, normalizeImageProviderResponse } from './imageProviderRequest.js';

function selected() {
  return {
    site: {
      id: 1,
      url: 'https://site.example.com',
      imageProvider: null,
      proxyUrl: null,
      useSystemProxy: false,
      customHeaders: null,
      customHeadersOverrideRequestHeaders: false,
    },
    account: { extraConfig: null },
    tokenValue: 'provider-token',
    actualModel: 'upstream-image-model',
  };
}

function target() {
  return {
    kind: 'site-fallback' as const,
    siteId: 1,
    endpointId: null,
    baseUrl: 'https://site.example.com',
    configuredEndpointCount: 0,
    endpoint: null,
  };
}

describe('imageProviderRequest', () => {
  it('rebuilds generation requests from the neutral payload for every attempt', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: any) => new Response(
      JSON.stringify({ created: 1, data: [{ url: 'https://cdn.example/image.png' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const request = {
      operation: 'generate' as const,
      requestedModel: 'downstream-model',
      jsonBody: { model: 'downstream-model', prompt: 'draw a fox', n: 2 },
    };

    const first = await executeImageProviderAttempt({ selected: selected(), target: target(), request, signal: new AbortController().signal, fetchRequest: fetchMock });
    const second = await executeImageProviderAttempt({ selected: { ...selected(), actualModel: 'fallback-image-model' }, target: target(), request, signal: new AbortController().signal, fetchRequest: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ model: 'upstream-image-model', prompt: 'draw a fox', n: 2 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ model: 'fallback-image-model', prompt: 'draw a fox', n: 2 });
    expect(first.provider.id).toBe('openai-compatible');
    expect(second.provider.id).toBe('openai-compatible');
  });

  it('clones multipart edit input for every attempt and normalizes the response through the provider', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: any) => new Response(
      JSON.stringify({ created: 1, data: [{ b64_json: 'Zm9v' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const form = new FormData();
    form.append('model', 'downstream-model');
    form.append('prompt', 'edit this');
    form.append('image', new Blob(['bytes'], { type: 'image/png' }), 'input.png');
    const request = { operation: 'edit' as const, requestedModel: 'downstream-model', multipartForm: form };

    const result = await executeImageProviderAttempt({ selected: selected(), target: target(), request, signal: new AbortController().signal, fetchRequest: fetchMock });
    const forwarded = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(forwarded).not.toBe(form);
    expect(forwarded.get('model')).toBe('upstream-image-model');
    expect(form.get('model')).toBe('downstream-model');
    const normalized = normalizeImageProviderResponse({
      provider: result.provider,
      operation: 'edit',
      modelName: 'upstream-image-model',
      response: result.response,
      bodyText: await result.response.text(),
    });
    expect(normalized).toEqual({ ok: true, value: { created: 1, data: [{ b64_json: 'Zm9v' }] } });
  });
});
