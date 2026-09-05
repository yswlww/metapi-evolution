import { describe, expect, it } from 'vitest';

import { zhipuImageProvider } from './zhipu.js';

describe('zhipuImageProvider', () => {
  it('supports CogView generation models only', () => {
    expect(zhipuImageProvider.capabilities).toEqual({ generate: true, edit: false });
    expect(zhipuImageProvider.supportsModel('cogview-4-250304')).toBe(true);
    expect(zhipuImageProvider.supportsModel('glm-4.5')).toBe(false);
    expect(zhipuImageProvider.supportsModel('')).toBe(false);
  });

  it('builds the Zhipu native generation request', async () => {
    const controller = new AbortController();
    const prepared = await zhipuImageProvider.prepareRequest({
      operation: 'generate',
      baseUrl: 'https://open.bigmodel.cn',
      modelName: 'cogview-4-250304',
      tokenValue: 'zhipu-token',
      jsonBody: {
        model: 'downstream-model',
        prompt: 'draw a mountain',
        size: '1024x1024',
        watermark: false,
        user: 'user-1',
        output_format: 'png',
      },
      signal: controller.signal,
    });

    expect(prepared.url).toBe('https://open.bigmodel.cn/api/paas/v4/images/generations');
    expect(prepared.responseMode).toBe('provider-json');
    expect(new Headers(prepared.init.headers).get('authorization')).toBe('Bearer zhipu-token');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'cogview-4-250304',
      prompt: 'draw a mountain',
      size: '1024x1024',
      watermark: false,
      user: 'user-1',
    });
    expect(new Headers(prepared.init.headers).get('content-type')).toBe('application/json');
  });

  it('rejects edits before request construction', async () => {
    await expect(zhipuImageProvider.prepareRequest({
      operation: 'edit',
      baseUrl: 'https://open.bigmodel.cn',
      modelName: 'cogview-4',
      tokenValue: 'zhipu-token',
    })).rejects.toThrow('generation only');
  });

  it('normalizes successful and malformed provider responses', () => {
    expect(zhipuImageProvider.normalizeResponse({
      operation: 'generate',
      modelName: 'cogview-4',
      status: 200,
      headers: new Headers(),
      bodyText: JSON.stringify({ created: 123, data: [{ url: 'https://cdn.example/zhipu.png' }] }),
    })).toEqual({
      ok: true,
      value: { created: 123, data: [{ url: 'https://cdn.example/zhipu.png' }] },
    });
    expect(zhipuImageProvider.normalizeResponse({
      operation: 'generate',
      modelName: 'cogview-4',
      status: 200,
      headers: new Headers(),
      bodyText: 'not-json',
    })).toEqual({ ok: false, message: 'not-json' });
  });
});
