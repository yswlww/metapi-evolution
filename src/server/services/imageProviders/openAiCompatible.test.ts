import { describe, expect, it } from 'vitest';

import { openAiCompatibleImageProvider } from './openAiCompatible.js';

function normalizeInput(bodyText: string) {
  return openAiCompatibleImageProvider.normalizeResponse({
    operation: 'generate',
    modelName: 'gpt-image-1',
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    bodyText,
  });
}

describe('openAiCompatibleImageProvider', () => {
  it('prepares generation JSON without dropping extension fields', async () => {
    const controller = new AbortController();
    const prepared = await openAiCompatibleImageProvider.prepareRequest({
      operation: 'generate',
      baseUrl: 'https://images.example.com/v1',
      modelName: 'upstream-image-model',
      tokenValue: 'provider-token',
      jsonBody: {
        model: 'downstream-model',
        prompt: 'draw a fox',
        provider_extension: { keep: true },
      },
      signal: controller.signal,
    });

    expect(prepared.url).toBe('https://images.example.com/v1/images/generations');
    expect(prepared.responseMode).toBe('openai-json');
    expect(prepared.init.method).toBe('POST');
    expect(prepared.init.signal).toBe(controller.signal);
    expect(new Headers(prepared.init.headers).get('authorization')).toBe('Bearer provider-token');
    expect(new Headers(prepared.init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'upstream-image-model',
      prompt: 'draw a fox',
      provider_extension: { keep: true },
    });
  });

  it('prepares multipart edits from a fresh form and overrides only the model', async () => {
    const form = new FormData();
    form.append('model', 'downstream-model');
    form.append('prompt', 'edit the fox');
    form.append('image', new Blob(['image-bytes'], { type: 'image/png' }), 'fox.png');

    const prepared = await openAiCompatibleImageProvider.prepareRequest({
      operation: 'edit',
      baseUrl: 'https://images.example.com',
      modelName: 'upstream-image-model',
      tokenValue: 'provider-token',
      multipartForm: form,
    });

    expect(prepared.url).toBe('https://images.example.com/v1/images/edits');
    expect(new Headers(prepared.init.headers).get('authorization')).toBe('Bearer provider-token');
    expect(new Headers(prepared.init.headers).has('content-type')).toBe(false);
    expect(prepared.init.body).toBeInstanceOf(FormData);
    expect(prepared.init.body).not.toBe(form);
    const forwarded = prepared.init.body as FormData;
    expect(forwarded.get('model')).toBe('upstream-image-model');
    expect(forwarded.get('prompt')).toBe('edit the fox');
    expect((forwarded.get('image') as File).name).toBe('fox.png');
    expect(form.get('model')).toBe('downstream-model');
  });

  it('preserves the existing JSON edit fallback', async () => {
    const prepared = await openAiCompatibleImageProvider.prepareRequest({
      operation: 'edit',
      baseUrl: 'https://images.example.com/',
      modelName: 'upstream-image-model',
      tokenValue: 'provider-token',
      jsonBody: { image: 'https://cdn.example.com/input.png', prompt: 'edit it' },
    });

    expect(prepared.url).toBe('https://images.example.com/v1/images/edits');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      image: 'https://cdn.example.com/input.png',
      prompt: 'edit it',
      model: 'upstream-image-model',
    });
  });

  it('passes valid OpenAI Images JSON through unchanged', () => {
    const value = { created: 1, data: [{ url: 'https://cdn.example.com/image.png' }] };
    expect(normalizeInput(JSON.stringify(value))).toEqual({ ok: true, value });
  });

  it('returns useful malformed JSON diagnostics', () => {
    expect(normalizeInput('upstream-not-json')).toEqual({
      ok: false,
      message: 'upstream-not-json',
    });
    expect(normalizeInput('')).toEqual({
      ok: false,
      message: 'Upstream returned malformed JSON',
    });
  });
});
