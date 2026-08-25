import { describe, expect, it } from 'vitest';
import { normalizeImageResults } from './imageResults.js';

describe('image result normalization', () => {
  it('keeps URL and PNG/WebP/JPEG base64 items while skipping malformed siblings', () => {
    const result = normalizeImageResults({
      data: [
        { url: 'https://cdn.example/one.png', revised_prompt: 'one' },
        { b64_json: 'WEBPDATA', output_format: 'webp', revised_prompt: 'two' },
        { b64_json: 'JPEGDATA', output_format: 'jpeg' },
        { b64_json: 'PNGDATA' },
        { url: '', b64_json: '' },
        null,
        { revised_prompt: 'no image' },
      ],
    }, 'png');

    expect(result.images).toEqual([
      {
        id: 'image-0',
        kind: 'url',
        src: 'https://cdn.example/one.png',
        url: 'https://cdn.example/one.png',
        mimeType: null,
        revisedPrompt: 'one',
        downloadName: 'generated-1.png',
      },
      {
        id: 'image-1',
        kind: 'b64_json',
        src: 'data:image/webp;base64,WEBPDATA',
        b64Json: 'WEBPDATA',
        mimeType: 'image/webp',
        revisedPrompt: 'two',
        downloadName: 'generated-2.webp',
      },
      {
        id: 'image-2',
        kind: 'b64_json',
        src: 'data:image/jpeg;base64,JPEGDATA',
        b64Json: 'JPEGDATA',
        mimeType: 'image/jpeg',
        revisedPrompt: null,
        downloadName: 'generated-3.jpeg',
      },
      {
        id: 'image-3',
        kind: 'b64_json',
        src: 'data:image/png;base64,PNGDATA',
        b64Json: 'PNGDATA',
        mimeType: 'image/png',
        revisedPrompt: null,
        downloadName: 'generated-4.png',
      },
    ]);
    expect(result.errorMessage).toBeNull();
  });

  it('uses the selected format for base64 MIME and handles empty/error payloads', () => {
    expect(normalizeImageResults({ data: [{ b64_json: 'DATA' }] }, 'jpeg').images[0]).toMatchObject({
      mimeType: 'image/jpeg',
      src: 'data:image/jpeg;base64,DATA',
      downloadName: 'generated-1.jpeg',
    });
    expect(normalizeImageResults({ data: [] }, 'png')).toEqual({ images: [], errorMessage: null });
    expect(normalizeImageResults({ error: { message: 'provider rejected prompt' } }, 'png')).toEqual({
      images: [],
      errorMessage: 'provider rejected prompt',
    });
    expect(normalizeImageResults(null, 'png')).toEqual({ images: [], errorMessage: null });
  });
});
