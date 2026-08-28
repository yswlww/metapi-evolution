import { describe, expect, it } from 'vitest';
import { imageMimeType, normalizeImageResults } from './imageResults.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const WEBP_BASE64 = 'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z';

describe('image result normalization', () => {
  it('keeps secure URLs and signature-valid PNG/WebP/JPEG base64 items while skipping invalid siblings', () => {
    const result = normalizeImageResults({
      data: [
        { url: 'javascript:alert(1)' },
        { url: 'data:image/png;base64,iVBORw0KGgo=' },
        { url: 'file:///private/image.png' },
        { url: 'https://person:secret@cdn.example/private.png' },
        { url: 'not a URL' },
        { url: 'https://cdn.example/one.png', revised_prompt: 'one' },
        { b64_json: PNG_BASE64, output_format: 'webp', revised_prompt: 'two' },
        { b64_json: WEBP_BASE64, output_format: 'png' },
        { b64_json: JPEG_BASE64, output_format: 'jpg' },
        { b64_json: 'not-base64!' },
        { b64_json: 'QUFBQQ==' },
        { url: 'javascript:alert(1)', b64_json: PNG_BASE64, revised_prompt: 'fallback image' },
        null,
        { revised_prompt: 'no image' },
      ],
    }, 'png');

    expect(result.images).toEqual([
      {
        id: 'image-5',
        kind: 'url',
        src: 'https://cdn.example/one.png',
        url: 'https://cdn.example/one.png',
        mimeType: null,
        revisedPrompt: 'one',
        downloadName: 'generated-1.png',
      },
      {
        id: 'image-6',
        kind: 'b64_json',
        src: `data:image/png;base64,${PNG_BASE64}`,
        b64Json: PNG_BASE64,
        mimeType: 'image/png',
        revisedPrompt: 'two',
        downloadName: 'generated-2.png',
      },
      {
        id: 'image-7',
        kind: 'b64_json',
        src: `data:image/webp;base64,${WEBP_BASE64}`,
        b64Json: WEBP_BASE64,
        mimeType: 'image/webp',
        revisedPrompt: null,
        downloadName: 'generated-3.webp',
      },
      {
        id: 'image-8',
        kind: 'b64_json',
        src: `data:image/jpeg;base64,${JPEG_BASE64}`,
        b64Json: JPEG_BASE64,
        mimeType: 'image/jpeg',
        revisedPrompt: null,
        downloadName: 'generated-4.jpeg',
      },
      {
        id: 'image-11',
        kind: 'b64_json',
        src: `data:image/png;base64,${PNG_BASE64}`,
        b64Json: PNG_BASE64,
        mimeType: 'image/png',
        revisedPrompt: 'fallback image',
        downloadName: 'generated-5.png',
      },
    ]);
    expect(result.errorMessage).toBeNull();
  });

  it('derives base64 MIME from actual bytes instead of selected or returned metadata', () => {
    expect(normalizeImageResults({
      data: [{
        b64_json: WEBP_BASE64,
        output_format: 'png',
        mime_type: 'image/jpeg',
      }],
    }, 'jpeg').images[0]).toMatchObject({
      mimeType: 'image/webp',
      src: `data:image/webp;base64,${WEBP_BASE64}`,
      downloadName: 'generated-1.webp',
    });
    expect(imageMimeType('jpg')).toBe('image/jpeg');
  });

  it('prioritizes a URL result output_format for JPEG semantics and download naming', () => {
    expect(normalizeImageResults({
      data: [{
        url: 'http://127.0.0.1:4000/image',
        output_format: 'jpg',
        mime_type: 'image/png',
      }],
    }, 'png').images[0]).toMatchObject({
      kind: 'url',
      mimeType: 'image/jpeg',
      downloadName: 'generated-1.jpeg',
    });
  });

  it('handles empty and error payloads without normalizing image elements', () => {
    expect(normalizeImageResults({ data: [] }, 'png')).toEqual({ images: [], errorMessage: null });
    expect(normalizeImageResults({ error: { message: 'provider rejected prompt' } }, 'png')).toEqual({
      images: [],
      errorMessage: 'provider rejected prompt',
    });
    expect(normalizeImageResults(null, 'png')).toEqual({ images: [], errorMessage: null });
  });
});
