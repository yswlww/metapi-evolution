import { normalizePlatformAlias } from './platformIdentity.js';

const DEFAULT_PLATFORM_CAPABILITIES = Object.freeze({
  openAiResponsesFirst: false,
  retryAlternativeEndpointOnGone: false,
});

const PLATFORM_CAPABILITIES = Object.freeze({
  openai: Object.freeze({
    openAiResponsesFirst: true,
    retryAlternativeEndpointOnGone: true,
  }),
  axonhub: Object.freeze({
    openAiResponsesFirst: true,
    retryAlternativeEndpointOnGone: true,
  }),
});

export function getPlatformCapabilities(platform) {
  const normalized = normalizePlatformAlias(platform);
  return PLATFORM_CAPABILITIES[normalized] ?? DEFAULT_PLATFORM_CAPABILITIES;
}
