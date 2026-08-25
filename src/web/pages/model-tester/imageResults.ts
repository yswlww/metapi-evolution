export type NormalizedImageResult = {
  id: string;
  kind: 'url' | 'b64_json';
  src: string;
  url?: string;
  b64Json?: string;
  mimeType: string | null;
  revisedPrompt: string | null;
  downloadName: string;
};

export type NormalizedImageResults = {
  images: NormalizedImageResult[];
  errorMessage: string | null;
};

const IMAGE_FORMATS = new Set(['png', 'webp', 'jpeg']);

export const imageMimeType = (format: unknown): string => {
  const normalized = typeof format === 'string' ? format.trim().toLowerCase() : '';
  return normalized === 'webp'
    ? 'image/webp'
    : normalized === 'jpeg' || normalized === 'jpg'
      ? 'image/jpeg'
      : 'image/png';
};

const imageExtension = (mimeType: string): string => {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpeg';
  return 'png';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorMessage = (payload: Record<string, unknown>): string | null => {
  const error = payload.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return null;
};

export const normalizeImageResults = (
  payload: unknown,
  selectedOutputFormat: string | null | undefined = 'png',
): NormalizedImageResults => {
  if (!isRecord(payload)) return { images: [], errorMessage: null };
  const errorMessage = getErrorMessage(payload);
  const data = Array.isArray(payload.data) ? payload.data : [];
  const images: NormalizedImageResult[] = [];

  data.forEach((item, index) => {
    if (!isRecord(item)) return;
    const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : '';
    const b64Json = typeof item.b64_json === 'string' && item.b64_json.trim() ? item.b64_json.trim() : '';
    if (!url && !b64Json) return;

    const returnedFormat = typeof item.output_format === 'string' ? item.output_format : '';
    const returnedMime = typeof item.mime_type === 'string' && item.mime_type.trim().toLowerCase().startsWith('image/')
      ? item.mime_type.trim().toLowerCase()
      : null;
    const normalizedFormat = returnedFormat.trim().toLowerCase();
    const mimeType = returnedMime || (IMAGE_FORMATS.has(normalizedFormat) ? imageMimeType(normalizedFormat) : imageMimeType(selectedOutputFormat));
    const extension = imageExtension(mimeType);
    const revisedPrompt = typeof item.revised_prompt === 'string' && item.revised_prompt.trim()
      ? item.revised_prompt.trim()
      : null;

    if (url) {
      images.push({
        id: `image-${index}`,
        kind: 'url',
        src: url,
        url,
        mimeType: returnedMime,
        revisedPrompt,
        downloadName: `generated-${images.length + 1}.${extension}`,
      });
      return;
    }

    images.push({
      id: `image-${index}`,
      kind: 'b64_json',
      src: `data:${mimeType};base64,${b64Json}`,
      b64Json,
      mimeType,
      revisedPrompt,
      downloadName: `generated-${images.length + 1}.${extension}`,
    });
  });

  return { images, errorMessage };
};
