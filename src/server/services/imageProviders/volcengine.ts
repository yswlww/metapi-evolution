import { buildUpstreamUrl } from '../../proxy-core/orchestration/upstreamRequest.js';
import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

const VOLCENGINE_IMAGE_MODEL_PATTERN = /^(?:doubao|seedream|ep-)[a-z0-9._-]+$/i;

function buildVolcengineUrl(baseUrl: string): string {
  const nativePath = '/api/v3/images/generations';
  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const versionPath = '/api/v3';
    if (pathname.toLowerCase() === versionPath) {
      parsed.pathname = `${pathname}${nativePath.slice(versionPath.length)}`;
    } else {
      parsed.pathname = `${pathname === '/' ? '' : pathname}${nativePath}`;
    }
    return parsed.toString();
  } catch {
    const normalized = baseUrl.replace(/\/+$/, '');
    return normalized.toLowerCase().endsWith('/api/v3')
      ? `${normalized}/images/generations`
      : `${normalized}${nativePath}`;
  }
}

function readFormString(form: FormData | undefined, key: string): string | undefined {
  const value = form?.get(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBodyValue(input: PrepareImageRequestInput, key: string): unknown {
  return input.jsonBody?.[key] ?? readFormString(input.multipartForm, key);
}

async function resolveFirstImageDataUrl(form: FormData | undefined): Promise<string | undefined> {
  if (!form) return undefined;
  for (const [key, value] of form.entries()) {
    if (!(value instanceof Blob) || !/^image(?:\[\d+\])?$/i.test(key)) continue;
    const bytes = Buffer.from(await value.arrayBuffer()).toString('base64');
    return `data:${value.type || 'application/octet-stream'};base64,${bytes}`;
  }
  return undefined;
}

async function buildBody(input: PrepareImageRequestInput): Promise<Record<string, unknown>> {
  const native: Record<string, unknown> = {
    model: input.modelName,
    prompt: readBodyValue(input, 'prompt') || '',
  };
  for (const key of ['size', 'response_format', 'watermark', 'seed', 'guidance_scale', 'n']) {
    const value = readBodyValue(input, key);
    if (value !== undefined) native[key] = value;
  }
  if (input.operation === 'edit') {
    const image = await resolveFirstImageDataUrl(input.multipartForm);
    const explicitImage = readBodyValue(input, 'image');
    if (image) native.image = image;
    else if (typeof explicitImage === 'string' && explicitImage.trim()) native.image = explicitImage;
  }
  return native;
}

function parseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return null;
  }
}

function normalizeData(parsed: unknown): Array<Record<string, unknown>> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const data = (parsed as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const normalized = data.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.url === 'string' || typeof record.b64_json === 'string') return [record];
    if (typeof record.image_url === 'string') return [{ url: record.image_url }];
    return [];
  });
  return normalized.length === data.length ? normalized : null;
}

export const volcengineImageProvider: ImageProviderAdapter = {
  id: 'volcengine',
  capabilities: { generate: true, edit: true },
  supportsModel(modelName) {
    return VOLCENGINE_IMAGE_MODEL_PATTERN.test(modelName.trim());
  },
  async prepareRequest(input) {
    return {
      url: buildVolcengineUrl(input.baseUrl),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.tokenValue}`,
        },
        body: JSON.stringify(await buildBody(input)),
        signal: input.signal,
      },
      responseMode: 'provider-json',
    };
  },
  normalizeResponse(input) {
    const parsed = parseJson(input.bodyText);
    const data = normalizeData(parsed);
    if (!data) {
      return { ok: false, message: input.bodyText || 'Volcengine returned malformed image JSON' };
    }
    return { ok: true, value: { created: 0, data } };
  },
};
