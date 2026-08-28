import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'react-test-renderer';
import ImageResultGallery, {
  copyImageText,
  downloadImageResult,
} from './ImageResultGallery.js';
import type { NormalizedImageResult } from './imageResults.js';

const WEBP_BASE64 = 'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=';
const URL_IMAGE: NormalizedImageResult = {
  id: 'url-image',
  kind: 'url',
  src: 'https://cdn.example/a.png',
  url: 'https://cdn.example/a.png',
  mimeType: 'image/png',
  revisedPrompt: null,
  downloadName: 'generated-1.png',
};

const createAnchor = () => ({
  href: '',
  download: '',
  rel: '',
  click: vi.fn(),
  setAttribute: vi.fn(),
  select: vi.fn(),
  style: {},
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ImageResultGallery', () => {
  it('renders each valid image with lazy asynchronous decoding and exposes URL/download/revised prompt actions', () => {
    const root = create(
      <ImageResultGallery
        result={{
          data: [
            { url: 'https://cdn.example/a.png', revised_prompt: 'revised a' },
            { b64_json: WEBP_BASE64, output_format: 'png' },
            { url: 'javascript:alert(1)' },
          ],
        }}
        outputFormat="png"
      />,
    );

    const images = root.root.findAllByType('img');
    expect(images).toHaveLength(2);
    expect(images[0].props.loading).toBe('lazy');
    expect(images[0].props.decoding).toBe('async');
    expect(images[1].props.src).toBe(`data:image/webp;base64,${WEBP_BASE64}`);
    const labels = root.root.findAllByType('button').map((button) => button.props['aria-label']);
    expect(labels).toEqual([
      '下载图片 1',
      '新标签打开图片 1',
      '复制图片 URL 1',
      '复制修订提示词 1',
      '下载图片 2',
    ]);
  });

  it('does not render broken images for empty or error payloads', () => {
    const empty = create(<ImageResultGallery result={{ data: [{ b64_json: 'not-base64!' }] }} />);
    expect(empty.root.findAllByType('img')).toHaveLength(0);
    expect(empty.root.findByProps({ role: 'status' })).toBeTruthy();

    const error = create(<ImageResultGallery result={{ error: { message: 'bad prompt' } }} />);
    expect(error.root.findAllByType('img')).toHaveLength(0);
    expect(error.root.findByProps({ role: 'status' }).children.join('')).toContain('bad prompt');
  });

  it('downloads URL-backed images through an omit-credentials blob request', async () => {
    const anchor = createAnchor();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    vi.stubGlobal('window', { open: vi.fn() });

    await expect(Promise.resolve(downloadImageResult(URL_IMAGE))).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(URL_IMAGE.url, { credentials: 'omit' });
    expect(anchor.href).toBe('blob:download');
    expect(anchor.download).toBe('generated-1.png');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:download');
    expect((globalThis.window as any).open).not.toHaveBeenCalled();
  });

  it('opens URL-backed images in a new tab when blob download cannot be used', async () => {
    const anchor = createAnchor();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    vi.stubGlobal('window', { open: vi.fn() });

    await expect(Promise.resolve(downloadImageResult(URL_IMAGE))).resolves.toBe(true);

    expect(anchor.click).not.toHaveBeenCalled();
    expect((globalThis.window as any).open).toHaveBeenCalledWith(URL_IMAGE.url, '_blank', 'noopener,noreferrer');
  });

  it('falls back to legacy copy when Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    const area = createAnchor();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => area),
      body: { appendChild, removeChild },
      execCommand: vi.fn(() => true),
    });

    await expect(copyImageText('https://cdn.example/a.png')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('https://cdn.example/a.png');
    expect((globalThis.document as any).execCommand).toHaveBeenCalledWith('copy');
    expect(appendChild).toHaveBeenCalledWith(area);
    expect(removeChild).toHaveBeenCalledWith(area);
  });
});
