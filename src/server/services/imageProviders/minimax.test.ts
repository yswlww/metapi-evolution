import { describe, expect, it } from 'vitest';

import { minimaxImageProvider } from './minimax.js';

describe('minimaxImageProvider', () => {
  it('supports image generation models only', () => {
    expect(minimaxImageProvider.capabilities).toEqual({ generate: true, edit: false });
    expect(minimaxImageProvider.supportsModel('image-01')).toBe(true);
    expect(minimaxImageProvider.supportsModel('MiniMax-M2.7')).toBe(false);
    expect(minimaxImageProvider.supportsModel('gpt-image-1')).toBe(false);
  });

  it('maps supported OpenAI-shaped options to MiniMax image generation', async () => {
    const prepared = await minimaxImageProvider.prepareRequest({
      operation: 'generate',
      baseUrl: 'https://api.minimaxi.com/v1',
      modelName: 'image-01',
      tokenValue: 'minimax-token',
      jsonBody: {
        prompt: 'a glass city',
        n: 3,
        aspect_ratio: '16:9',
        response_format: 'url',
        prompt_optimizer: true,
        watermark: false,
        size: '1024x1024',
      },
    });

    expect(prepared.url).toBe('https://api.minimaxi.com/v1/image_generation');
    expect(new Headers(prepared.init.headers).get('authorization')).toBe('Bearer minimax-token');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'image-01',
      prompt: 'a glass city',
      n: 3,
      aspect_ratio: '16:9',
      response_format: 'url',
      prompt_optimizer: true,
      watermark: false,
    });
  });

  it('rejects edits before network I/O', async () => {
    await expect(minimaxImageProvider.prepareRequest({
      operation: 'edit', baseUrl: 'https://api.minimaxi.com', modelName: 'image-01', tokenValue: 'token',
    })).rejects.toThrow('generation only');
  });

  it('normalizes MiniMax URL-list and OpenAI-shaped responses', () => {
    expect(minimaxImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'image-01', status: 200, headers: new Headers(),
      bodyText: JSON.stringify({ data: { image_urls: ['https://cdn.example/a.png', 'https://cdn.example/b.png'] } }),
    })).toEqual({
      ok: true,
      value: { created: 0, data: [{ url: 'https://cdn.example/a.png' }, { url: 'https://cdn.example/b.png' }] },
    });
    expect(minimaxImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'image-01', status: 200, headers: new Headers(),
      bodyText: JSON.stringify({ data: [{ b64_json: 'Zm9v' }] }),
    })).toEqual({ ok: true, value: { created: 0, data: [{ b64_json: 'Zm9v' }] } });
    expect(minimaxImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'image-01', status: 200, headers: new Headers(), bodyText: 'bad',
    })).toEqual({ ok: false, message: 'bad' });
  });
});
