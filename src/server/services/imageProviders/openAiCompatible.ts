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
    try {
      return { ok: true, value: JSON.parse(input.bodyText) as unknown };
    } catch {
      return {
        ok: false,
        message: input.bodyText || 'Upstream returned malformed JSON',
      };
    }
  },
};
