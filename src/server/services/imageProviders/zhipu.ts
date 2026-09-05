import { buildUpstreamUrl } from '../../proxy-core/orchestration/upstreamRequest.js';
import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

const ZHIPU_IMAGE_MODEL_PATTERN = /^cogview(?:-[a-z0-9]+)*$/i;

function pickOptionalFields(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ['size', 'watermark', 'user']) {
    if (body[key] !== undefined) result[key] = body[key];
  }
  return result;
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
  const normalized = data.filter((item): item is Record<string, unknown> => (
    !!item && typeof item === 'object' && !Array.isArray(item)
    && (typeof (item as Record<string, unknown>).url === 'string'
      || typeof (item as Record<string, unknown>).b64_json === 'string')
  ));
  return normalized.length === data.length ? normalized : null;
}

export const zhipuImageProvider: ImageProviderAdapter = {
  id: 'zhipu',
  capabilities: { generate: true, edit: false },
  supportsModel(modelName) {
    return ZHIPU_IMAGE_MODEL_PATTERN.test(modelName.trim());
  },
  async prepareRequest(input) {
    if (input.operation !== 'generate') {
      throw new Error('Zhipu image provider supports generation only');
    }
    const body = input.jsonBody ?? {};
    return {
      url: buildUpstreamUrl(input.baseUrl, '/api/paas/v4/images/generations'),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.tokenValue}`,
        },
        body: JSON.stringify({
          model: input.modelName,
          prompt: body.prompt,
          ...pickOptionalFields(body),
        }),
        signal: input.signal,
      },
      responseMode: 'provider-json',
    };
  },
  normalizeResponse(input) {
    const parsed = parseJson(input.bodyText);
    const data = normalizeData(parsed);
    if (!data) {
      return { ok: false, message: input.bodyText || 'Zhipu returned malformed image JSON' };
    }
    const created = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && typeof (parsed as { created?: unknown }).created === 'number'
      ? (parsed as { created: number }).created
      : 0;
    return { ok: true, value: { created, data } };
  },
};
