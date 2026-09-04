import { describe, expect, it } from 'vitest';

import { geminiImagenImageProvider } from './geminiImagen.js';

describe('geminiImagenImageProvider compatibility adapter', () => {
  it('routes the legacy provider id to current Gemini Image models', () => {
    expect(geminiImagenImageProvider.capabilities).toEqual({ generate: true, edit: true });
    expect(geminiImagenImageProvider.supportsModel('gemini-2.5-flash-image')).toBe(true);
    expect(geminiImagenImageProvider.supportsModel('gemini-3.1-flash-image')).toBe(true);
    expect(geminiImagenImageProvider.supportsModel('gemini-3.1-flash-lite-image')).toBe(true);
    expect(geminiImagenImageProvider.supportsModel('gemini-3-pro-image')).toBe(true);
    expect(geminiImagenImageProvider.supportsModel('imagen-4.0-generate-001')).toBe(false);
  });

  it('builds current Gemini Interactions image generation requests without leaking the key in the URL', async () => {
    const prepared = await geminiImagenImageProvider.prepareRequest({
      operation: 'generate',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelName: 'gemini-3.1-flash-image',
      tokenValue: 'google-api-key',
      jsonBody: {
        prompt: 'a blue whale',
        output_format: 'png',
        aspect_ratio: '16:9',
        image_size: '2K',
      },
    });
    expect(prepared.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(prepared.url).not.toContain('google-api-key');
    const headers = new Headers(prepared.init.headers);
    expect(headers.get('x-goog-api-key')).toBe('google-api-key');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'gemini-3.1-flash-image',
      input: [{ type: 'text', text: 'a blue whale' }],
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' },
    });
  });

  it('converts multipart edits into Gemini interaction image input', async () => {
    const form = new FormData();
    form.append('prompt', 'make it watercolor');
    form.append('image', new Blob(['jpeg'], { type: 'image/jpeg' }), 'source.jpg');
    const prepared = await geminiImagenImageProvider.prepareRequest({
      operation: 'edit',
      baseUrl: 'https://generativelanguage.googleapis.com',
      modelName: 'gemini-2.5-flash-image',
      tokenValue: 'key',
      multipartForm: form,
    });
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      model: 'gemini-2.5-flash-image',
      input: [
        { type: 'text', text: 'make it watercolor' },
        { type: 'image', mime_type: 'image/jpeg', data: 'anBlZw==' },
      ],
    });
  });

  it('normalizes current interaction output images', () => {
    expect(geminiImagenImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'gemini-3.1-flash-image', status: 200, headers: new Headers(),
      bodyText: JSON.stringify({ output_image: { data: 'Zm9v', mime_type: 'image/png' } }),
    })).toEqual({ ok: true, value: { created: 0, data: [{ b64_json: 'Zm9v' }] } });
    expect(geminiImagenImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'gemini-3.1-flash-image', status: 200, headers: new Headers(), bodyText: '{}',
    })).toEqual({ ok: false, message: '{}' });
  });
});
