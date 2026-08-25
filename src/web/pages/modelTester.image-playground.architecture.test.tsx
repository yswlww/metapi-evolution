import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ModelTester image playground integration', () => {
  it('delegates image-generation controls to a dedicated panel', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/ModelTester.tsx'), 'utf8').replace(/\r\n/g, '\n');

    expect(source).toContain("import ImageGenerationPanel from './model-tester/ImageGenerationPanel.js'");
    expect(source).toContain('<ImageGenerationPanel');
    expect(source).not.toContain('image-output-compression');
  });

  it('delegates image results to a dedicated gallery while retaining raw JSON', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/ModelTester.tsx'), 'utf8').replace(/\r\n/g, '\n');

    expect(source).toContain("import ImageResultGallery from './model-tester/ImageResultGallery.js'");
    expect(source).toContain('<ImageResultGallery');
    expect(source).toContain('formatJson(nonConversationResult)');
    expect(source).not.toContain('data:image/png;base64,${item.b64_json}');
  });

  it('keeps image generation on the generations endpoint and preserves custom JSON mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/ModelTester.tsx'), 'utf8').replace(/\r\n/g, '\n');

    expect(source).toContain("path: '/v1/images/generations'");
    expect(source).toContain('rawJsonText: customRequestBody');
    expect(source).toContain('customRequestMode');
  });

  it('keeps image settings in the session serializer boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/ModelTester.tsx'), 'utf8').replace(/\r\n/g, '\n');

    expect(source).toContain('imageParameterEnabled');
    expect(source).toContain('imagesOutputCompression');
  });
});
