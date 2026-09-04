import { describe, expect, it } from 'vitest';

import { dashscopeImageProvider } from './dashscope.js';

describe('dashscopeImageProvider', () => {
  it('accepts only explicit Qwen image model families and supports both operations', () => {
    expect(dashscopeImageProvider.capabilities).toEqual({ generate: true, edit: true });
    expect(dashscopeImageProvider.supportsModel('qwen-image-3.0-pro')).toBe(true);
    expect(dashscopeImageProvider.supportsModel('qwen-image-2.0-pro-2026-06-22')).toBe(true);
    expect(dashscopeImageProvider.supportsModel('qwen-image-edit-plus-2025-12-15')).toBe(true);
    expect(dashscopeImageProvider.supportsModel('qwen-turbo')).toBe(false);
  });

  it('builds synchronous multimodal text-to-image requests', async () => {
    const prepared = await dashscopeImageProvider.prepareRequest({
      operation: 'generate',
      baseUrl: 'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1',
      modelName: 'qwen-image-3.0-pro',
      tokenValue: 'dashscope-token',
      jsonBody: {
        prompt: 'a paper crane',
        negative_prompt: 'blurry',
        prompt_extend: true,
        watermark: false,
        size: '1024*1024',
        n: 2,
        response_format: 'url',
      },
    });
    expect(prepared.url).toBe('https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(new Headers(prepared.init.headers).get('authorization')).toBe('Bearer dashscope-token');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'qwen-image-3.0-pro',
      input: { messages: [{ role: 'user', content: [{ text: 'a paper crane' }] }] },
      parameters: { negative_prompt: 'blurry', prompt_extend: true, watermark: false, size: '1024*1024', n: 2 },
    });
  });

  it('converts edit multipart images to DashScope data URL content', async () => {
    const form = new FormData();
    form.append('prompt', 'remove the tree');
    form.append('image', new Blob(['png'], { type: 'image/png' }), 'source.png');
    const prepared = await dashscopeImageProvider.prepareRequest({
      operation: 'edit', baseUrl: 'https://dashscope.aliyuncs.com', modelName: 'qwen-image-edit', tokenValue: 'token', multipartForm: form,
    });
    const body = JSON.parse(String(prepared.init.body));
    expect(body.input.messages[0].content).toEqual([
      { image: 'data:image/png;base64,cG5n' },
      { text: 'remove the tree' },
    ]);
  });

  it('normalizes multimodal choices and rejects malformed responses', () => {
    expect(dashscopeImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'qwen-image-3.0', status: 200, headers: new Headers(),
      bodyText: JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'https://cdn.example/qwen.png' }] } }] } }),
    })).toEqual({ ok: true, value: { created: 0, data: [{ url: 'https://cdn.example/qwen.png' }] } });
    expect(dashscopeImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'qwen-image-3.0', status: 200, headers: new Headers(), bodyText: 'bad',
    })).toEqual({ ok: false, message: 'bad' });
  });
});
