import React, { useMemo } from 'react';
import {
  normalizeImageResults,
  type NormalizedImageResult,
} from './imageResults.js';

type ImageResultGalleryProps = {
  result: unknown;
  outputFormat?: string | null;
  isMobile?: boolean;
};

export const copyImageText = async (text: string): Promise<boolean> => {
  const value = text.trim();
  if (!value) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    if (typeof document === 'undefined') return false;
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
};

export const downloadImageResult = (image: NormalizedImageResult): boolean => {
  if (typeof document === 'undefined') return false;
  try {
    const anchor = document.createElement('a');
    anchor.href = image.src;
    anchor.download = image.downloadName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch {
    return false;
  }
};

export const openImageUrl = (url: string): boolean => {
  if (typeof window === 'undefined' || !url.trim()) return false;
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
};

export default function ImageResultGallery({ result, outputFormat = 'png', isMobile = false }: ImageResultGalleryProps) {
  const normalized = useMemo(() => normalizeImageResults(result, outputFormat), [result, outputFormat]);

  if (normalized.errorMessage) {
    return (
      <div
        role="status"
        style={{
          padding: 14,
          border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-danger)',
          background: 'var(--color-danger-soft)',
          fontSize: 12,
        }}
      >
        {normalized.errorMessage}
      </div>
    );
  }

  if (normalized.images.length === 0) {
    return (
      <div role="status" style={{ padding: 14, color: 'var(--color-text-muted)', fontSize: 12 }}>
        暂无可显示的图片结果。
      </div>
    );
  }

  return (
    <div
      aria-label="图片结果画廊"
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {normalized.images.map((image, index) => (
        <article
          key={image.id}
          style={{
            border: '1px solid var(--color-border-light)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--color-bg-card)',
            minWidth: 0,
          }}
        >
          <img
            src={image.src}
            alt={image.revisedPrompt || `generated-${index + 1}`}
            style={{ width: '100%', display: 'block', aspectRatio: '1 / 1', objectFit: 'contain', background: 'var(--color-bg)' }}
          />
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {image.revisedPrompt && (
              <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <strong style={{ marginRight: 4 }}>revised_prompt</strong>
                {image.revisedPrompt}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ border: '1px solid var(--color-border)', padding: '4px 8px', fontSize: 11 }}
                aria-label={`下载图片 ${index + 1}`}
                onClick={() => { downloadImageResult(image); }}
              >
                下载
              </button>
              {image.kind === 'url' && image.url && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ border: '1px solid var(--color-border)', padding: '4px 8px', fontSize: 11 }}
                    aria-label={`新标签打开图片 ${index + 1}`}
                    onClick={() => { openImageUrl(image.url || ''); }}
                  >
                    新标签打开
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ border: '1px solid var(--color-border)', padding: '4px 8px', fontSize: 11 }}
                    aria-label={`复制图片 URL ${index + 1}`}
                    onClick={() => { void copyImageText(image.url || ''); }}
                  >
                    复制 URL
                  </button>
                </>
              )}
              {image.revisedPrompt && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--color-border)', padding: '4px 8px', fontSize: 11 }}
                  aria-label={`复制修订提示词 ${index + 1}`}
                  onClick={() => { void copyImageText(image.revisedPrompt || ''); }}
                >
                  复制 revised_prompt
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
