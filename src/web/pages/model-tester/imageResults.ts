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

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const imageMimeType = (format: unknown): string => {
  const normalized = typeof format === 'string' ? format.trim().toLowerCase() : '';
  return normalized === 'webp'
    ? 'image/webp'
    : normalized === 'jpeg' || normalized === 'jpg'
      ? 'image/jpeg'
      : 'image/png';
};

const outputFormatMimeType = (format: unknown): string | null => {
  const normalized = typeof format === 'string' ? format.trim().toLowerCase() : '';
  return normalized === 'png' || normalized === 'webp' || normalized === 'jpeg' || normalized === 'jpg'
    ? imageMimeType(normalized)
    : null;
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

const isActionableImageUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
};

const decodeBase64 = (value: string): Uint8Array | null => {
  if (!BASE64_PATTERN.test(value)) return null;

  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index]);
    const second = BASE64_ALPHABET.indexOf(value[index + 1]);
    const third = value[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 2]);
    const fourth = value[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(value[index + 3]);
    if (first < 0 || second < 0 || third < 0 || fourth < 0) return null;

    const group = (first << 18) | (second << 12) | (third << 6) | fourth;
    bytes.push((group >> 16) & 0xff);
    if (value[index + 2] !== '=') bytes.push((group >> 8) & 0xff);
    if (value[index + 3] !== '=') bytes.push(group & 0xff);
  }

  return Uint8Array.from(bytes);
};

const inferBase64ImageMimeType = (value: string): string | null => {
  const bytes = decodeBase64(value);
  if (!bytes) return null;

  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

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
    const revisedPrompt = typeof item.revised_prompt === 'string' && item.revised_prompt.trim()
      ? item.revised_prompt.trim()
      : null;

    if (url && isActionableImageUrl(url)) {
      const returnedOutputFormatMime = outputFormatMimeType(item.output_format);
      const returnedMime = typeof item.mime_type === 'string' && item.mime_type.trim().toLowerCase().startsWith('image/')
        ? item.mime_type.trim().toLowerCase()
        : null;
      const mimeType = returnedOutputFormatMime || returnedMime || imageMimeType(selectedOutputFormat);
      images.push({
        id: `image-${index}`,
        kind: 'url',
        src: url,
        url,
        mimeType: returnedOutputFormatMime || returnedMime,
        revisedPrompt,
        downloadName: `generated-${images.length + 1}.${imageExtension(mimeType)}`,
      });
      return;
    }

    if (!b64Json) return;
    const mimeType = inferBase64ImageMimeType(b64Json);
    if (!mimeType) return;

    images.push({
      id: `image-${index}`,
      kind: 'b64_json',
      src: `data:${mimeType};base64,${b64Json}`,
      b64Json,
      mimeType,
      revisedPrompt,
      downloadName: `generated-${images.length + 1}.${imageExtension(mimeType)}`,
    });
  });

  return { images, errorMessage };
};
