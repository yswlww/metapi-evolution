import { describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import ImageResultGallery from './ImageResultGallery.js';

describe('ImageResultGallery', () => {
  it('renders each valid image and exposes URL/download/revised prompt actions', () => {
    const root = create(
      <ImageResultGallery
        result={{
          data: [
            { url: 'https://cdn.example/a.png', revised_prompt: 'revised a' },
            { b64_json: 'WEBP', output_format: 'webp' },
            { invalid: true },
          ],
        }}
        outputFormat="png"
      />,
    );

    expect(root.root.findAllByType('img')).toHaveLength(2);
    expect(root.root.findAllByType('img')[1].props.src).toBe('data:image/webp;base64,WEBP');
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
    const empty = create(<ImageResultGallery result={{ data: [{ nope: true }] }} />);
    expect(empty.root.findAllByType('img')).toHaveLength(0);
    expect(empty.root.findByProps({ role: 'status' })).toBeTruthy();

    const error = create(<ImageResultGallery result={{ error: { message: 'bad prompt' } }} />);
    expect(error.root.findAllByType('img')).toHaveLength(0);
    expect(error.root.findByProps({ role: 'status' }).children.join('')).toContain('bad prompt');
  });

  it('routes browser actions through clipboard, download, and new-tab boundaries', async () => {
    const writeText = vi.fn(async () => undefined);
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createElement = vi.fn(() => ({
      href: '',
      download: '',
      rel: '',
      click,
      setAttribute: vi.fn(),
      select: vi.fn(),
      style: {},
    }));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', { createElement, body: { appendChild, removeChild }, execCommand: vi.fn(() => true) });
    vi.stubGlobal('window', { open: vi.fn() });

    const root = create(<ImageResultGallery result={{ data: [{ url: 'https://cdn.example/a.png', revised_prompt: 'revised' }] }} />);
    const buttons = root.root.findAllByType('button');
    await act(async () => {
      buttons[0].props.onClick();
      buttons[1].props.onClick();
      buttons[2].props.onClick();
      buttons[3].props.onClick();
      await Promise.resolve();
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect((globalThis.window as any).open).toHaveBeenCalledWith('https://cdn.example/a.png', '_blank', 'noopener,noreferrer');
    expect(writeText).toHaveBeenCalledWith('https://cdn.example/a.png');
    expect(writeText).toHaveBeenCalledWith('revised');

    vi.unstubAllGlobals();
  });
});
