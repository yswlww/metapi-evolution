import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

const IMAGEN_MODEL_PATTERN = /^imagen-(?:[234](?:\.[0-9]+)?|[0-9]+\.[0-9]+)-(?:generate|ultra-generate|fast-generate)-[0-9]+$/i;
const IMAGEN_PATH_PREFIX = '/v1beta/models/';

function buildGeminiImagenUrl(baseUrl: string, modelName: string): string {
  const modelPath = `${modelName.replace(/^models\//i, '').replace(/^\/+|\/+$/g, '')}:predict`;
  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const versionPath = /\/v1beta$/i.test(pathname) ? pathname : `${pathname}/v1beta`;
    parsed.pathname = `${versionPath}/models/${modelPath}`.replace(/\/\/+?/g, '/');
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const normalized = baseUrl.replace(/\/+$/, '');
    const prefix = /\/v1beta$/i.test(normalized) ? normalized : `${normalized}/v1beta`;
    return `${prefix}/models/${modelPath}`;
  }
}

function getBodyValue(body: Record<string, unknown>, key: string): unknown {
  return body[key];
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
  const predictions = (parsed as { predictions?: unknown }).predictions;
  if (!Array.isArray(predictions)) return null;
  const data: Array<Record<string, unknown>> = [];
  for (const prediction of predictions) {
    if (!prediction || typeof prediction !== 'object' || Array.isArray(prediction)) return null;
    const record = prediction as Record<string, unknown>;
    if (typeof record.bytesBase64Encoded === 'string') {
      data.push({ b64_json: record.bytesBase64Encoded });
      continue;
    }
    if (typeof record.mimeType === 'string' && typeof record.bytes_base64_encoded === 'string') {
      data.push({ b64_json: record.bytes_base64_encoded });
      continue;
    }
    if (typeof record.uri === 'string') {
      data.push({ url: record.uri });
      continue;
    }
    return null;
  }
  return data.length === predictions.length && data.length > 0 ? data : null;
}

export const geminiImagenImageProvider: ImageProviderAdapter = {
  id: 'gemini-imagen',
  capabilities: { generate: true, edit: false },
  supportsModel(modelName) {
    return IMAGEN_MODEL_PATTERN.test(modelName.trim());
  },
  async prepareRequest(input) {
    if (input.operation !== 'generate') throw new Error('Gemini Imagen supports generation only');
    if (!IMAGEN_MODEL_PATTERN.test(input.modelName.trim())) {
      throw new Error(`Gemini Imagen model ${input.modelName} is not supported`);
    }
    const body = input.jsonBody ?? {};
    const instance: Record<string, unknown> = {
      prompt: getBodyValue(body, 'prompt') || '',
    };
    const parameters: Record<string, unknown> = {};
    for (const [source, target] of [
      ['n', 'sampleCount'],
      ['size', 'outputImageSize'],
      ['aspect_ratio', 'aspectRatio'],
      ['negative_prompt', 'negativePrompt'],
      ['person_generation', 'personGeneration'],
    ]) {
      if (body[source] !== undefined) parameters[target] = body[source];
    }
    return {
      url: buildGeminiImagenUrl(input.baseUrl, input.modelName),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': input.tokenValue,
        },
        body: JSON.stringify({
          instances: [instance],
          ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
        }),
        signal: input.signal,
      },
      responseMode: 'provider-json',
    };
  },
  normalizeResponse(input) {
    const parsed = parseJson(input.bodyText);
    const data = normalizeData(parsed);
    if (!data) return { ok: false, message: input.bodyText || 'Gemini Imagen returned malformed image JSON' };
    return { ok: true, value: { created: 0, data } };
  },
};
