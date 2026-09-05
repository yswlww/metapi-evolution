import { buildUpstreamUrl } from '../../proxy-core/orchestration/upstreamRequest.js';
import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

const MINIMAX_IMAGE_MODEL_PATTERN = /^image-[a-z0-9-]+$/i;

function getString(body: Record<string, unknown>, key: string): string | undefined {
  return typeof body[key] === 'string' && body[key].trim() ? body[key] as string : undefined;
}

function getNumber(body: Record<string, unknown>, key: string): number | undefined {
  return typeof body[key] === 'number' && Number.isFinite(body[key]) ? body[key] as number : undefined;
}

function buildBody(input: PrepareImageRequestInput): Record<string, unknown> {
  const body = input.jsonBody ?? {};
  const native: Record<string, unknown> = {
    model: input.modelName,
    prompt: getString(body, 'prompt') || '',
  };
  const mappings: Array<[string, string]> = [
    ['aspect_ratio', 'aspect_ratio'],
    ['response_format', 'response_format'],
    ['prompt_optimizer', 'prompt_optimizer'],
    ['watermark', 'watermark'],
  ];
  for (const [source, target] of mappings) {
    if (body[source] !== undefined) native[target] = body[source];
  }
  const count = getNumber(body, 'n');
  if (count !== undefined) native.n = count;
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
  const record = parsed as { data?: unknown; base_resp?: unknown };
  if (Array.isArray(record.data)) {
    const data = record.data.filter((item): item is Record<string, unknown> => (
      !!item && typeof item === 'object' && !Array.isArray(item)
      && (typeof (item as Record<string, unknown>).url === 'string'
        || typeof (item as Record<string, unknown>).b64_json === 'string')
    ));
    if (data.length === record.data.length) return data;
  }
  const urls = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? (record.data as { image_urls?: unknown }).image_urls
    : undefined;
  if (Array.isArray(urls) && urls.every((url) => typeof url === 'string')) {
    return urls.map((url) => ({ url }));
  }
  return null;
}

export const minimaxImageProvider: ImageProviderAdapter = {
  id: 'minimax',
  capabilities: { generate: true, edit: false },
  supportsModel(modelName) {
    return MINIMAX_IMAGE_MODEL_PATTERN.test(modelName.trim());
  },
  async prepareRequest(input) {
    if (input.operation !== 'generate') {
      throw new Error('MiniMax image provider supports generation only');
    }
    return {
      url: buildUpstreamUrl(input.baseUrl, '/v1/image_generation'),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.tokenValue}`,
        },
        body: JSON.stringify(buildBody(input)),
        signal: input.signal,
      },
      responseMode: 'provider-json',
    };
  },
  normalizeResponse(input) {
    const parsed = parseJson(input.bodyText);
    const data = normalizeData(parsed);
    if (!data) {
      return { ok: false, message: input.bodyText || 'MiniMax returned malformed image JSON' };
    }
    return { ok: true, value: { created: 0, data } };
  },
};
