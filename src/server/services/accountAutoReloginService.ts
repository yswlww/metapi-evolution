import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  getAutoReloginConfig,
  mergeAccountExtraConfig,
  resolvePlatformUserId,
  resolveProxyUrlFromExtraConfig,
} from './accountExtraConfig.js';
import { decryptAccountPassword } from './accountCredentialService.js';
import { getAdapter } from './platforms/index.js';
import { withAccountProxyOverride } from './siteProxy.js';

type AutoReloginAccount = {
  id: number;
  username?: string | null;
  extraConfig?: string | null;
  status?: string | null;
};

type AutoReloginSite = {
  platform?: string | null;
  url: string;
};

export type AutoReloginResult = {
  accessToken: string;
  platformUserId?: number;
  extraConfig: string | null | undefined;
};

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export async function autoReloginAccount(
  account: AutoReloginAccount,
  site: AutoReloginSite,
): Promise<AutoReloginResult | null> {
  const adapter = getAdapter(site.platform || '');
  if (!adapter) return null;

  const relogin = getAutoReloginConfig(account.extraConfig);
  if (!relogin) return null;

  const password = decryptAccountPassword(relogin.passwordCipher);
  if (!password) return null;

  const loginResult = await withAccountProxyOverride(
    resolveProxyUrlFromExtraConfig(account.extraConfig),
    () => adapter.login(site.url, relogin.username, password),
  );
  if (!loginResult.success || !loginResult.accessToken) return null;

  const authoritativePlatformUserId = isPositiveSafeInteger(loginResult.platformUserId)
    ? loginResult.platformUserId
    : undefined;
  const platformUserId = authoritativePlatformUserId
    ?? resolvePlatformUserId(account.extraConfig, account.username);
  const extraConfig = authoritativePlatformUserId
    ? mergeAccountExtraConfig(account.extraConfig, { platformUserId: authoritativePlatformUserId })
    : account.extraConfig;
  const updates: Record<string, unknown> = {
    accessToken: loginResult.accessToken,
    updatedAt: new Date().toISOString(),
    status: account.status === 'expired' ? 'active' : account.status,
  };
  if (extraConfig !== account.extraConfig) {
    updates.extraConfig = extraConfig;
  }

  await db.update(schema.accounts)
    .set(updates)
    .where(eq(schema.accounts.id, account.id))
    .run();

  return {
    accessToken: loginResult.accessToken,
    ...(platformUserId ? { platformUserId } : {}),
    extraConfig,
  };
}
