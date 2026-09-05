export type ImageOperation = 'generate' | 'edit';

export type ImageProviderId =
  | 'openai-compatible'
  | 'zhipu'
  | 'volcengine'
  | 'minimax'
  | 'dashscope'
  | 'gemini-imagen';

export type ImageProviderCapabilities = {
  generate: boolean;
  edit: boolean;
};

export type PrepareImageRequestInput = {
  operation: ImageOperation;
  baseUrl: string;
  modelName: string;
  tokenValue: string;
  jsonBody?: Record<string, unknown>;
  multipartForm?: FormData;
  signal?: AbortSignal;
};

export type PreparedImageRequest = {
  url: string;
  init: RequestInit;
  responseMode: 'openai-json' | 'provider-json';
};

export type NormalizeImageResponseInput = {
  operation: ImageOperation;
  modelName: string;
  status: number;
  headers: Headers;
  bodyText: string;
};

export type NormalizedImageResponse =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

export type ImageProviderAdapter = {
  id: ImageProviderId;
  capabilities: ImageProviderCapabilities;
  supportsModel(modelName: string): boolean;
  supportsOperation?(operation: ImageOperation, modelName: string): boolean;
  prepareRequest(input: PrepareImageRequestInput): Promise<PreparedImageRequest>;
  normalizeResponse(input: NormalizeImageResponseInput): NormalizedImageResponse;
};
