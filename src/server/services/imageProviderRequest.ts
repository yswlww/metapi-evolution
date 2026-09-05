import type { Response as UndiciResponse } from 'undici';

import { getProxyUrlFromExtraConfig } from './accountExtraConfig.js';
import { resolveImageProviderAdapter } from './imageProviders/registry.js';
import type {
  ImageOperation,
  ImageProviderAdapter,
  NormalizeImageResponseInput,
  PreparedImageRequest,
} from './imageProviders/types.js';
import { withSiteRecordProxyRequestInit } from './siteProxy.js';
import { SiteApiEndpointRequestError } from './siteApiEndpointService.js';
import { getObservedResponseMeta } from '../proxy-core/firstByteTimeout.js';
import type { SiteApiEndpointTarget } from './siteApiEndpointService.js';

export type NeutralImageRequest = {
  operation: ImageOperation;
  requestedModel: string;
  jsonBody?: Record<string, unknown>;
  multipartForm?: FormData;
};

export type ImageAttemptSelection = {
  site: NonNullable<Parameters<typeof withSiteRecordProxyRequestInit>[0]> & { imageProvider?: string | null };
  account: { extraConfig?: string | null };
  tokenValue: string;
  actualModel?: string | null;
};

export type ExecutedImageProviderAttempt = {
  response: UndiciResponse;
  provider: ImageProviderAdapter;
  prepared: PreparedImageRequest;
};

export async function executeImageProviderAttempt(input: {
  selected: ImageAttemptSelection;
  target: SiteApiEndpointTarget;
  request: NeutralImageRequest;
  signal: AbortSignal;
  fetchRequest?: (url: string, init: unknown) => Promise<UndiciResponse>;
}): Promise<ExecutedImageProviderAttempt> {
  const modelName = input.selected.actualModel?.trim() || input.request.requestedModel;
  const provider = resolveImageProviderAdapter(input.selected.site.imageProvider);
  if (!provider) {
    throw new SiteApiEndpointRequestError(
      `Image provider ${String(input.selected.site.imageProvider || 'unknown')} is not registered`,
      { status: 502 },
    );
  }

  const prepared = await provider.prepareRequest({
    operation: input.request.operation,
    baseUrl: input.target.baseUrl,
    modelName,
    tokenValue: input.selected.tokenValue,
    jsonBody: input.request.jsonBody,
    multipartForm: input.request.multipartForm,
    signal: input.signal,
  });
  const requestInit = withSiteRecordProxyRequestInit(
    input.selected.site,
    {
      ...(prepared.init as any),
      signal: input.signal,
    },
    getProxyUrlFromExtraConfig(input.selected.account.extraConfig),
  );
  const fetchRequest = input.fetchRequest;
  if (!fetchRequest) {
    throw new Error('fetchRequest is required for image provider attempts');
  }
  const response = await fetchRequest(prepared.url, requestInit);
  return { response, provider, prepared };
}

export function normalizeImageProviderResponse(input: {
  provider: ImageProviderAdapter;
  operation: ImageOperation;
  modelName: string;
  response: UndiciResponse;
  bodyText: string;
}): { ok: true; value: unknown } | { ok: false; message: string } {
  const meta: NormalizeImageResponseInput = {
    operation: input.operation,
    modelName: input.modelName,
    status: input.response.status,
    headers: new Headers(input.response.headers),
    bodyText: input.bodyText,
  };
  return input.provider.normalizeResponse(meta);
}

export function getImageAttemptFirstByteLatencyMs(response: UndiciResponse): number | null {
  return getObservedResponseMeta(response)?.firstByteLatencyMs ?? null;
}
