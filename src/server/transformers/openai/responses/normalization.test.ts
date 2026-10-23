import { describe, expect, it } from 'vitest';

import { normalizeResponsesInputForCompatibility } from './normalization.js';

function imageBlocks(input: unknown): Array<Record<string, unknown>> {
  const items = normalizeResponsesInputForCompatibility(input) as Array<Record<string, unknown>>;
  return items.flatMap((item) =>
    Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [],
  );
}

describe('responses input_image normalization', () => {
  it('strips file_id when an input_image block also carries image_url', () => {
    const blocks = imageBlocks([
      { type: 'message', role: 'user', content: [{ type: 'input_image', file_id: 'file-abc', image_url: 'https://cdn.example/cat.png' }] },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).not.toHaveProperty('file_id');
    expect(blocks[0].image_url).toBe('https://cdn.example/cat.png');
  });

  it('strips file_id when an image_url-typed block also carries image_url', () => {
    const blocks = imageBlocks([
      { type: 'message', role: 'user', content: [{ type: 'image_url', file_id: 'file-abc', image_url: 'https://cdn.example/cat.png' }] },
    ]);
    expect(blocks[0].type).toBe('input_image');
    expect(blocks[0]).not.toHaveProperty('file_id');
    expect(blocks[0].image_url).toBe('https://cdn.example/cat.png');
  });

  it('drops the conflicting file_id while preserving other siblings', () => {
    const blocks = imageBlocks([
      { type: 'message', role: 'user', content: [{ type: 'input_image', file_id: 'file-abc', image_url: 'https://cdn.example/cat.png', detail: 'high' }] },
    ]);
    expect(blocks[0]).not.toHaveProperty('file_id');
    expect(blocks[0].detail).toBe('high');
    expect(blocks[0].image_url).toBe('https://cdn.example/cat.png');
  });

  it('preserves a file_id-only image block through the content fallback instead of dropping the image', () => {
    const blocks = imageBlocks([
      { type: 'message', role: 'user', content: [{ type: 'input_image', file_id: 'file-abc' }] },
    ]);
    // normalizeResponsesContentItem cannot resolve a URL for this block, so it
    // returns null and normalizeResponsesMessageContent falls back to the
    // original content. Losing the user's only image would be worse.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].file_id).toBe('file-abc');
    expect(blocks[0]).not.toHaveProperty('image_url');
  });
});
