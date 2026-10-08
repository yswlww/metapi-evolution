type SearchKind = 'sites' | 'accounts' | 'accountTokens' | 'checkinLogs' | 'proxyLogs' | 'models';

export function searchDestination(kind: SearchKind, result: { id?: number; name?: string }): string {
  const destinations: Record<SearchKind, [string, string]> = {
    sites: ['/app/sites', 'focusSiteId'],
    accounts: ['/app/accounts', 'focusAccountId'],
    accountTokens: ['/app/accounts?segment=tokens', 'focusTokenId'],
    checkinLogs: ['/app/checkins', 'focusLogId'],
    proxyLogs: ['/app/proxy-logs', 'focusLogId'],
    models: ['/app/models', 'focusModel'],
  };
  const [path, key] = destinations[kind];
  const value = kind === 'models' ? result.name : result.id;
  if (value == null) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(String(value))}`;
}
