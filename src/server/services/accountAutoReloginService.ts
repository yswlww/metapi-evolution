import { and, eq } from 'drizzle-orm';
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
import { normalizePlatformUserId } from './platformUserId.js';

type AutoReloginAccount = {
  id: number;
  username?: string | null;
  extraConfig?: string | null;
  status?: string | null;
  updatedAt?: string | null;
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

const AUTO_RELOGIN_PERSIST_MAX_ATTEMPTS = 3;

function hasSameAutoReloginCredentials(
  left: { username: string; passwordCipher: string; updatedAt?: string } | null,
  right: { username: string; passwordCipher: string; updatedAt?: string } | null,
): boolean {
  return !!left
    && !!right
    && left.username === right.username
    && left.passwordCipher === right.passwordCipher
    && left.updatedAt === right.updatedAt;
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

  for (let attempt = 0; attempt < AUTO_RELOGIN_PERSIST_MAX_ATTEMPTS; attempt += 1) {
    const currentAccount = await db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id))
      .get();
    if (!currentAccount) return null;

    if (!hasSameAutoReloginCredentials(relogin, getAutoReloginConfig(currentAccount.extraConfig))) {
      return null;
    }

    const authoritativePlatformUserId = normalizePlatformUserId(loginResult.platformUserId);
    const platformUserId = authoritativePlatformUserId
      ?? resolvePlatformUserId(currentAccount.extraConfig, currentAccount.username);
    const extraConfig = authoritativePlatformUserId
      ? mergeAccountExtraConfig(currentAccount.extraConfig, { platformUserId: authoritativePlatformUserId })
      : currentAccount.extraConfig;
    const updates: Record<string, unknown> = {
      accessToken: loginResult.accessToken,
      updatedAt: new Date().toISOString(),
      status: currentAccount.status === 'expired' ? 'active' : currentAccount.status,
    };
    if (extraConfig !== currentAccount.extraConfig) {
      updates.extraConfig = extraConfig;
    }

    const result = await db.update(schema.accounts)
      .set(updates)
      .where(and(
        eq(schema.accounts.id, currentAccount.id),
        eq(schema.accounts.extraConfig, currentAccount.extraConfig),
        eq(schema.accounts.updatedAt, currentAccount.updatedAt),
      ))
      .run();
    if (result.changes > 0) {
      return {
        accessToken: loginResult.accessToken,
        ...(platformUserId ? { platformUserId } : {}),
        extraConfig,
      };
    }
  }

  return null;
}
