import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  getNewApiAuthFromExtraConfig,
  mergeAccountExtraConfig,
  resolveProxyUrlFromExtraConfig,
} from './accountExtraConfig.js';
import { withSiteRecordProxyRequestInit } from './siteProxy.js';

export const NEW_API_REFRESH_LEAD_MS = 120 * 1000;

type RefreshedNewApiSession = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readCookieValue(setCookieHeaders: string[], name: string): string {
  const target = name.toLowerCase();
  for (const raw of setCookieHeaders) {
    const pair = raw.split(';')[0]?.trim() || '';
    const eqIndex = pair.indexOf('=');
    if (eqIndex <= 0) continue;
    if (pair.slice(0, eqIndex).trim().toLowerCase() !== target) continue;
    return pair.slice(eqIndex + 1).trim();
  }
  return '';
}

function parseExpiresAt(raw: unknown): number | null {
  const expiresAt = typeof raw === 'number'
    ? raw
    : (typeof raw === 'string' ? Number(raw) : Number.NaN);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return expiresAt > 10_000_000_000 ? Math.trunc(expiresAt) : Math.trunc(expiresAt * 1000);
}

export function isManagedNewApiTokenDue(
  tokenExpiresAt?: number,
  nowMs = Date.now(),
): boolean {
  if (!(typeof tokenExpiresAt === 'number' && Number.isFinite(tokenExpiresAt) && tokenExpiresAt > 0)) {
    return false;
  }
  return tokenExpiresAt - nowMs <= NEW_API_REFRESH_LEAD_MS;
}

export function parseNewApiRefreshPayload(
  payload: unknown,
  fallbackRefreshToken: string,
  setCookieHeaders: string[] = [],
): RefreshedNewApiSession | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return null;
  const accessToken = typeof payload.data.access_token === 'string' ? payload.data.access_token.trim() : '';
  const tokenExpiresAt = parseExpiresAt(payload.data.access_expires_at ?? payload.data.accessExpiresAt);
  const rotatedRefreshToken = readCookieValue(setCookieHeaders, 'new_api_refresh');
  const refreshToken = rotatedRefreshToken || fallbackRefreshToken;
  if (!accessToken || !refreshToken || !tokenExpiresAt) return null;
  return { accessToken, refreshToken, tokenExpiresAt };
}

export async function requestNewApiSessionRefresh(params: {
  siteUrl: string;
  refreshToken: string;
  site?: Parameters<typeof withSiteRecordProxyRequestInit>[0];
  proxyUrl?: string | null;
}): Promise<RefreshedNewApiSession> {
  const endpoint = `${params.siteUrl.replace(/\/+$/, '')}/api/user/auth/refresh`;
  const { fetch } = await import('undici');
  const response = await fetch(endpoint, withSiteRecordProxyRequestInit(params.site, {
    method: 'POST',
    headers: {
      Cookie: `new_api_refresh=${params.refreshToken}`,
      'Content-Type': 'application/json',
    },
  }, params.proxyUrl));
  const rawText = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookieHeaders = typeof getSetCookie === 'function' ? getSetCookie.call(response.headers) : [];
  const refreshed = parseNewApiRefreshPayload(payload, params.refreshToken, setCookieHeaders);
  if (!refreshed) {
    throw new Error(`new-api token refresh failed: HTTP ${response.status}`);
  }
  return refreshed;
}

export async function ensureFreshNewApiAccessToken(params: {
  account: typeof schema.accounts.$inferSelect;
  site: typeof schema.sites.$inferSelect;
  currentAccessToken: string;
  currentExtraConfig?: string | null;
  force?: boolean;
}): Promise<{ accessToken: string; extraConfig: string | null | undefined }> {
  const extraConfig = params.currentExtraConfig ?? params.account.extraConfig;
  const managedAuth = getNewApiAuthFromExtraConfig(extraConfig);
  if (!managedAuth?.refreshToken) {
    return { accessToken: params.currentAccessToken, extraConfig };
  }
  if (!params.force && !isManagedNewApiTokenDue(managedAuth.tokenExpiresAt)) {
    return { accessToken: params.currentAccessToken, extraConfig };
  }
  return refreshNewApiManagedSession({
    account: params.account,
    site: params.site,
    currentExtraConfig: extraConfig ?? null,
  });
}

export async function refreshNewApiManagedSession(params: {
  account: typeof schema.accounts.$inferSelect;
  site: typeof schema.sites.$inferSelect;
  currentExtraConfig: string | null;
}): Promise<{ accessToken: string; extraConfig: string }> {
  const managedAuth = getNewApiAuthFromExtraConfig(params.currentExtraConfig);
  if (!managedAuth?.refreshToken) throw new Error('new-api managed refresh token missing');

  const refreshed = await requestNewApiSessionRefresh({
    siteUrl: params.site.url,
    refreshToken: managedAuth.refreshToken,
    site: params.site,
    proxyUrl: resolveProxyUrlFromExtraConfig(params.currentExtraConfig),
  });
  const extraConfig = mergeAccountExtraConfig(params.currentExtraConfig, {
    newApiAuth: {
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
    },
  });
  await db.update(schema.accounts)
    .set({
      accessToken: refreshed.accessToken,
      extraConfig,
      status: params.account.status === 'expired' ? 'active' : params.account.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.accounts.id, params.account.id))
    .run();

  return {
    accessToken: refreshed.accessToken,
    extraConfig,
  };
}
