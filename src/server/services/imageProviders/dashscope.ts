import type { ImageProviderAdapter, PrepareImageRequestInput } from './types.js';

const DASHSCOPE_GENERATE_MODEL_PATTERNS = [
  /^qwen-image-3\.0(?:-pro)?$/i,
  /^qwen-image-2\.0(?:-pro)?(?:-\d{4}-\d{2}-\d{2})?$/i,
  /^qwen-image-(?:max|plus)(?:-\d{4}-\d{2}-\d{2})?$/i,
];
const DASHSCOPE_EDIT_MODEL_PATTERNS = [
  /^qwen-image-3\.0(?:-pro)?$/i,
  /^qwen-image-2\.0(?:-pro)?(?:-\d{4}-\d{2}-\d{2})?$/i,
  /^qwen-image-edit-(?:max|plus)?(?:-\d{4}-\d{2}-\d{2})?$/i,
  /^qwen-image-edit$/i,
];
const DASHSCOPE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

function supportsModelIn(modelName: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(modelName.trim()));
}

function buildDashscopeUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/api/v1')) {
      parsed.pathname = `${pathname}${DASHSCOPE_PATH.slice('/api/v1'.length)}`;
    } else if (pathname.endsWith('/api')) {
      parsed.pathname = `${pathname}${DASHSCOPE_PATH.slice('/api'.length)}`;
    } else {
      parsed.pathname = `${pathname}${DASHSCOPE_PATH}`;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const normalized = baseUrl.replace(/\/+$/, '');
    if (/\/api\/v1$/i.test(normalized)) return `${normalized}${DASHSCOPE_PATH.slice('/api/v1'.length)}`;
    return `${normalized}${DASHSCOPE_PATH}`;
  }
}

function bodyValue(input: PrepareImageRequestInput, key: string): unknown {
  const jsonValue = input.jsonBody?.[key];
  if (jsonValue !== undefined) return jsonValue;
  const formValue = input.multipartForm?.get(key);
  return typeof formValue === 'string' ? formValue : undefined;
}

function readImageFiles(form: FormData | undefined): Blob[] {
  if (!form) return [];
  const images: Blob[] = [];
  for (const [key, value] of form.entries()) {
    if (!(value instanceof Blob) || !/^image(?:\[\d+\])?$/i.test(key)) continue;
    images.push(value);
  }
  return images;
}

async function imageToDataUrl(image: Blob): Promise<string> {
  const bytes = Buffer.from(await image.arrayBuffer()).toString('base64');
  return `data:${image.type || 'application/octet-stream'};base64,${bytes}`;
}

async function buildContent(input: PrepareImageRequestInput): Promise<Array<Record<string, string>>> {
  const content: Array<Record<string, string>> = [];
  for (const image of readImageFiles(input.multipartForm)) {
    content.push({ image: await imageToDataUrl(image) });
  }
  const prompt = bodyValue(input, 'prompt');
  if (typeof prompt === 'string' && prompt.trim()) content.push({ text: prompt });
  return content;
}

function buildParameters(input: PrepareImageRequestInput): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  const body = input.jsonBody ?? {};
  for (const key of ['negative_prompt', 'prompt_extend', 'prompt_extend_mode', 'watermark', 'size', 'n']) {
    if (body[key] !== undefined) parameters[key] = body[key];
  }
  return parameters;
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
  const output = (parsed as { output?: unknown }).output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const choices = (output as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const data: Array<Record<string, unknown>> = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null;
    const message = (choice as { message?: unknown }).message;
    const content = message && typeof message === 'object' && !Array.isArray(message)
      ? (message as { content?: unknown }).content
      : null;
    if (!Array.isArray(content)) return null;
    for (const item of content) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const image = (item as { image?: unknown }).image;
      if (typeof image === 'string' && image.trim()) data.push({ url: image });
    }
  }
  return data.length > 0 ? data : null;
}

export const dashscopeImageProvider: ImageProviderAdapter = {
  id: 'dashscope',
  capabilities: { generate: true, edit: true },
  supportsModel(modelName) {
    return supportsModelIn(modelName, [
      ...DASHSCOPE_GENERATE_MODEL_PATTERNS,
      ...DASHSCOPE_EDIT_MODEL_PATTERNS,
    ]);
  },
  supportsOperation(operation, modelName) {
    return supportsModelIn(
      modelName,
      operation === 'generate' ? DASHSCOPE_GENERATE_MODEL_PATTERNS : DASHSCOPE_EDIT_MODEL_PATTERNS,
    );
  },
  async prepareRequest(input) {
    const modelSupportsOperation = input.operation === 'generate'
      ? supportsModelIn(input.modelName, DASHSCOPE_GENERATE_MODEL_PATTERNS)
      : supportsModelIn(input.modelName, DASHSCOPE_EDIT_MODEL_PATTERNS);
    if (!modelSupportsOperation) {
      throw new Error(`DashScope model ${input.modelName} does not support ${input.operation}`);
    }
    const content = await buildContent(input);
    if (content.length <= 0) throw new Error('DashScope image prompt or input image is required');
    const body: Record<string, unknown> = {
      model: input.modelName,
      input: {
        messages: [{ role: 'user', content }],
      },
    };
    const parameters = buildParameters(input);
    if (Object.keys(parameters).length > 0) body.parameters = parameters;
    return {
      url: buildDashscopeUrl(input.baseUrl),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.tokenValue}`,
        },
        body: JSON.stringify(body),
        signal: input.signal,
      },
      responseMode: 'provider-json',
    };
  },
  normalizeResponse(input) {
    const parsed = parseJson(input.bodyText);
    const data = normalizeData(parsed);
    if (!data) return { ok: false, message: input.bodyText || 'DashScope returned malformed image JSON' };
    return { ok: true, value: { created: 0, data } };
  },
};
