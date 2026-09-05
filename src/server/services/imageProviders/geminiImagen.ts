import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

// Keep the historical provider id for persisted-site compatibility, but route to
// Google's current Gemini Image / Nano Banana Interactions API. Imagen itself
// was retired by Google on 2026-08-17.
const GEMINI_IMAGE_MODEL_PATTERN = /^gemini-(?:2\.5-flash-image|3-pro-image|3\.1-flash(?:-lite)?-image)(?:-[a-z0-9.-]+)?$/i;
const INTERACTIONS_PATH = '/v1beta/interactions';

function buildInteractionsUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (/\/v1beta$/i.test(pathname)) parsed.pathname = `${pathname}/interactions`;
    else parsed.pathname = `${pathname}${INTERACTIONS_PATH}`.replace(/\/\/+/g, '/');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const normalized = baseUrl.replace(/\/+$/, '');
    return /\/v1beta$/i.test(normalized)
      ? `${normalized}/interactions`
      : `${normalized}${INTERACTIONS_PATH}`;
  }
}

async function toInteractionInput(input: PrepareImageRequestInput): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  const prompt = input.jsonBody?.prompt ?? input.multipartForm?.get('prompt');
  if (typeof prompt === 'string' && prompt.trim()) items.push({ type: 'text', text: prompt });
  if (input.operation === 'edit' && input.multipartForm) {
    for (const [key, value] of input.multipartForm.entries()) {
      if (!(value instanceof Blob) || !/^image(?:\[\d+\])?$/i.test(key)) continue;
      items.push({
        type: 'image',
        mime_type: value.type || 'application/octet-stream',
        data: Buffer.from(await value.arrayBuffer()).toString('base64'),
      });
    }
  }
  return items;
}

function buildResponseFormat(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const responseFormat: Record<string, unknown> = { type: 'image' };
  if (typeof body.output_format === 'string' && body.output_format.trim()) {
    responseFormat.mime_type = `image/${body.output_format.trim().toLowerCase().replace('jpg', 'jpeg')}`;
  }
  if (typeof body.aspect_ratio === 'string' && body.aspect_ratio.trim()) {
    responseFormat.aspect_ratio = body.aspect_ratio.trim();
  }
  if (typeof body.image_size === 'string' && body.image_size.trim()) {
    responseFormat.image_size = body.image_size.trim();
  }
  return Object.keys(responseFormat).length > 1 ? responseFormat : undefined;
}

function parseJson(bodyText: string): unknown {
  try { return JSON.parse(bodyText) as unknown; } catch { return null; }
}

function normalizeData(parsed: unknown): Array<Record<string, unknown>> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const outputImage = record.output_image;
  if (outputImage && typeof outputImage === 'object' && !Array.isArray(outputImage)) {
    const data = (outputImage as Record<string, unknown>).data;
    if (typeof data === 'string' && data) return [{ b64_json: data }];
  }
  const outputs = Array.isArray(record.output) ? record.output : [];
  const data: Array<Record<string, unknown>> = [];
  for (const output of outputs) {
    if (!output || typeof output !== 'object' || Array.isArray(output)) continue;
    const image = (output as Record<string, unknown>).image;
    if (image && typeof image === 'object' && !Array.isArray(image)) {
      const bytes = (image as Record<string, unknown>).data;
      if (typeof bytes === 'string' && bytes) data.push({ b64_json: bytes });
    }
  }
  return data.length > 0 ? data : null;
}

export const geminiImagenImageProvider: ImageProviderAdapter = {
  id: 'gemini-imagen',
  capabilities: { generate: true, edit: true },
  supportsModel(modelName) {
    return GEMINI_IMAGE_MODEL_PATTERN.test(modelName.trim());
  },
  supportsOperation(_operation, modelName) {
    return GEMINI_IMAGE_MODEL_PATTERN.test(modelName.trim());
  },
  async prepareRequest(input) {
    if (!GEMINI_IMAGE_MODEL_PATTERN.test(input.modelName.trim())) {
      throw new Error(`Gemini Image model ${input.modelName} is not supported`);
    }
    const interactionInput = await toInteractionInput(input);
    if (interactionInput.length === 0) throw new Error('Gemini Image prompt or input image is required');
    const responseFormat = buildResponseFormat(input.jsonBody ?? {});
    return {
      url: buildInteractionsUrl(input.baseUrl),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': input.tokenValue,
        },
        body: JSON.stringify({
          model: input.modelName,
          input: interactionInput,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        signal: input.signal,
      },
      responseMode: 'provider-json',
    };
  },
  normalizeResponse(input) {
    const data = normalizeData(parseJson(input.bodyText));
    if (!data) return { ok: false, message: input.bodyText || 'Gemini Image returned malformed image JSON' };
    return { ok: true, value: { created: 0, data } };
  },
};
