export type WebdavDraft = {
  enabled: boolean;
  fileUrl: string;
  username: string;
  password: string;
  clearPassword: boolean;
  exportType: 'all' | 'accounts' | 'preferences';
  autoSyncEnabled: boolean;
  autoSyncCron: string;
};

/** A blank draft is intentionally omission, never an instruction to erase a secret. */
export function webdavPayload(draft: WebdavDraft): Record<string, unknown> {
  const { password, clearPassword, ...config } = draft;
  return {
    ...config,
    fileUrl: config.fileUrl.trim(),
    username: config.username.trim(),
    ...(clearPassword ? { clearPassword: true } : password ? { password } : {}),
  };
}

export function webdavDraftFromConfig(response: unknown): WebdavDraft {
  const envelope = object(response);
  const config = object(envelope.config ?? envelope);
  return {
    enabled: config.enabled === true,
    fileUrl: typeof config.fileUrl === 'string' ? config.fileUrl : '',
    username: typeof config.username === 'string' ? config.username : '',
    password: '',
    clearPassword: false,
    exportType: config.exportType === 'accounts' || config.exportType === 'preferences' ? config.exportType : 'all',
    autoSyncEnabled: config.autoSyncEnabled === true,
    autoSyncCron: typeof config.autoSyncCron === 'string' ? config.autoSyncCron : '0 */6 * * *',
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Count persisted rows from the backend backup envelope, not prototype `sections`. */
export function backupPreview(value: unknown): { sections: string[]; totalRecords: number } {
  const envelope = object(value);
  const data = Object.keys(object(envelope.data)).length ? object(envelope.data) : envelope;
  const sections: string[] = [];
  let totalRecords = 0;
  const count = (name: string, rows: unknown) => {
    if (!Array.isArray(rows)) return;
    sections.push(name);
    totalRecords += rows.length;
  };
  const accounts = object(data.accounts);
  const preferences = object(data.preferences);
  const hasAccounts = Array.isArray(data.accounts) || Array.isArray(accounts.accounts) || Array.isArray(accounts.sites);
  const hasPreferences = Array.isArray(preferences.settings);
  const profiles = object(envelope.apiCredentialProfiles).profiles;
  if (hasAccounts || hasPreferences || Array.isArray(profiles)) {
    if (Array.isArray(data.accounts)) count('accounts', data.accounts);
    else for (const name of ['sites', 'siteApiEndpoints', 'accounts', 'accountTokens', 'tokenRoutes', 'routeChannels', 'routeGroupSources', 'siteDisabledModels', 'manualModels', 'downstreamApiKeys']) count(name, accounts[name]);
    count('proxies', data.proxies);
    count('settings', preferences.settings);
    count('apiCredentialProfiles', profiles);
  } else throw new Error('Unsupported backup envelope');
  return { sections, totalRecords };
}
