import { describe, expect, it } from 'vitest';

import { geminiImagenImageProvider } from './geminiImagen.js';

describe('geminiImagenImageProvider', () => {
  it('accepts Imagen generate model names only', () => {
    expect(geminiImagenImageProvider.capabilities).toEqual({ generate: true, edit: false });
    expect(geminiImagenImageProvider.supportsModel('imagen-4.0-generate-001')).toBe(true);
    expect(geminiImagenImageProvider.supportsModel('imagen-4.0-fast-generate-001')).toBe(true);
    expect(geminiImagenImageProvider.supportsModel('gemini-2.5-flash-image')).toBe(false);
  });

  it('builds Vertex/Gemini predict requests with API-key transport', async () => {
    const controller = new AbortController();
    const prepared = await geminiImagenImageProvider.prepareRequest({
      operation: 'generate', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelName: 'imagen-4.0-generate-001', tokenValue: 'google-api-key',
      jsonBody: { prompt: 'a blue whale', n: 2, aspect_ratio: '16:9', negative_prompt: 'blurry' }, signal: controller.signal,
    });
    expect(prepared.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict');
    const headers = new Headers(prepared.init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-goog-api-key')).toBe('google-api-key');
    expect(JSON.parse(String(prepared.init.body))).toEqual({
      instances: [{ prompt: 'a blue whale' }],
      parameters: { sampleCount: 2, aspectRatio: '16:9', negativePrompt: 'blurry' },
    });
  });

  it('normalizes base64 and URI predictions', () => {
    expect(geminiImagenImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'imagen-4.0-generate-001', status: 200, headers: new Headers(),
      bodyText: JSON.stringify({ predictions: [{ bytesBase64Encoded: 'Zm9v' }, { uri: 'gs://bucket/image.png' }] }),
    })).toEqual({ ok: true, value: { created: 0, data: [{ b64_json: 'Zm9v' }, { url: 'gs://bucket/image.png' }] } });
    expect(geminiImagenImageProvider.normalizeResponse({
      operation: 'generate', modelName: 'imagen-4.0-generate-001', status: 200, headers: new Headers(), bodyText: '{}',
    })).toEqual({ ok: false, message: '{}' });
  });
});
