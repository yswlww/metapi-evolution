import { buildUpstreamUrl } from '../../proxy-core/orchestration/upstreamRequest.js';
import { cloneFormDataWithOverrides } from '../multipartFormData.js';
import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

function buildBody(input: PrepareImageRequestInput): {
  body: BodyInit;
  headers: Record<string, string>;
} {
  if (input.operation === 'edit' && input.multipartForm) {
    return {
      body: cloneFormDataWithOverrides(input.multipartForm, { model: input.modelName }),
      headers: {
        Authorization: `Bearer ${input.tokenValue}`,
      },
    };
  }

  return {
    body: JSON.stringify({
      ...(input.jsonBody ?? {}),
      model: input.modelName,
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.tokenValue}`,
    },
  };
}

export const openAiCompatibleImageProvider: ImageProviderAdapter = {
  id: 'openai-compatible',
  capabilities: {
    generate: true,
    edit: true,
  },
  supportsModel() {
    return true;
  },
  async prepareRequest(input) {
    const path = input.operation === 'generate'
      ? '/v1/images/generations'
      : '/v1/images/edits';
    const { body, headers } = buildBody(input);

    return {
      url: buildUpstreamUrl(input.baseUrl, path),
      init: {
        method: 'POST',
        headers,
        body,
        signal: input.signal,
      },
      responseMode: 'openai-json',
    };
  },
  normalizeResponse(input) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.bodyText) as unknown;
    } catch {
      return {
        ok: false,
        message: input.bodyText || 'Upstream returned malformed JSON',
      };
    }

    // An upstream error body is a failure, not a successful image result.
    const payload = parsed as { error?: { message?: unknown } } | null;
    const upstreamError = typeof payload?.error?.message === 'string'
      ? payload.error.message.trim()
      : '';
    if (input.status >= 400 || upstreamError) {
      return {
        ok: false,
        message: upstreamError || `Upstream returned HTTP ${input.status}`,
      };
    }

    // A 2xx response carrying no usable image would otherwise be proxied as
    // success, so clients would receive an empty result with no retry.
    const data = (parsed as { data?: unknown })?.data;
    const hasUsableImage = Array.isArray(data) && data.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as { b64_json?: unknown; url?: unknown };
      return (typeof entry.b64_json === 'string' && entry.b64_json.trim().length > 0)
        || (typeof entry.url === 'string' && entry.url.trim().length > 0);
    });
    if (!hasUsableImage) {
      return { ok: false, message: 'Upstream returned no image data' };
    }

    return { ok: true, value: parsed };
  },
};
