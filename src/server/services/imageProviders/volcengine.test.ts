import { describe, expect, it } from 'vitest';

import { volcengineImageProvider } from './volcengine.js';

describe('volcengineImageProvider', () => {
  it('supports generation and edit for declared Seedream/Doubao image models', () => {
    expect(volcengineImageProvider.capabilities).toEqual({ generate: true, edit: true });
    expect(volcengineImageProvider.supportsModel('doubao-seedream-4-0-250828')).toBe(true);
    expect(volcengineImageProvider.supportsModel('seedream-4-0')).toBe(true);
    expect(volcengineImageProvider.supportsModel('ep-20250101000000-abc')).toBe(true);
    expect(volcengineImageProvider.supportsModel('gpt-image-1')).toBe(false);
  });

  it('builds native generation JSON and keeps supported parameters', async () => {
    const prepared = await volcengineImageProvider.prepareRequest({
      operation: 'generate',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      modelName: 'doubao-seedream-4-0-250828',
      tokenValue: 'volcengine-token',
      jsonBody: {
        prompt: 'a red fox',
        size: '1024x1024',
        response_format: 'url',
        watermark: true,
        seed: 7,
        n: 2,
        ignored_openai_field: 'drop',
      },
    });

    expect(prepared.url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
    expect(new Headers(prepared.init.headers).get('authorization')).toBe('Bearer volcengine-token');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'doubao-seedream-4-0-250828',
      prompt: 'a red fox',
      size: '1024x1024',
      response_format: 'url',
      watermark: true,
      seed: 7,
      n: 2,
    });
  });

  it('converts a multipart edit image into a retry-safe data URL JSON request', async () => {
    const form = new FormData();
    form.append('prompt', 'turn it blue');
    form.append('image', new Blob(['png-bytes'], { type: 'image/png' }), 'source.png');

    const prepared = await volcengineImageProvider.prepareRequest({
      operation: 'edit',
      baseUrl: 'https://ark.example.com/api/v3',
      modelName: 'seedream-4-0',
      tokenValue: 'volcengine-token',
      multipartForm: form,
    });

    expect(prepared.url).toBe('https://ark.example.com/api/v3/images/generations');
    const body = JSON.parse(String(prepared.init.body));
    expect(body).toMatchObject({
      model: 'seedream-4-0',
      prompt: 'turn it blue',
      image: 'data:image/png;base64,cG5nLWJ5dGVz',
    });
    expect(form.get('image')).toBeInstanceOf(Blob);
  });

  it('normalizes URL, base64, and image_url response entries', () => {
    expect(volcengineImageProvider.normalizeResponse({
      operation: 'edit', modelName: 'seedream-4-0', status: 200, headers: new Headers(),
      bodyText: JSON.stringify({ data: [{ image_url: 'https://cdn.example/edited.png' }, { b64_json: 'Zm9v' }] }),
    })).toEqual({
      ok: true,
      value: { created: 0, data: [{ url: 'https://cdn.example/edited.png' }, { b64_json: 'Zm9v' }] },
    });
    expect(volcengineImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'seedream-4-0', status: 200, headers: new Headers(), bodyText: '{}',
    })).toEqual({ ok: false, message: '{}' });
  });
});
