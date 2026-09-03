import { normalizePlatformAlias } from '../../shared/platformIdentity.js';

export const ORCAROUTER_TOKEN_TRANSPORT_ERROR = 'OrcaRouter API key requests require a credential-free HTTPS base URL';

export function getOrcaRouterTokenTransportError(
  platform: string | null | undefined,
  baseUrl: string | null | undefined,
): string | null {
  if (normalizePlatformAlias(platform) !== 'orcarouter') return null;

  const rawBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password) {
      return null;
    }
  } catch {}

  return ORCAROUTER_TOKEN_TRANSPORT_ERROR;
}

export function assertOrcaRouterTokenTransport(
  platform: string | null | undefined,
  baseUrl: string | null | undefined,
): void {
  const error = getOrcaRouterTokenTransportError(platform, baseUrl);
  if (error) throw new Error(error);
}
