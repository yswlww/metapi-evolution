import { apiGet, apiPost, apiPatch, type ApiRequestOptions } from '../../lib/client';

export type ProxyOptions = { proxyUrl?: string | null; useSystemProxy?: boolean };
export type OAuthSession = { state: string; provider?: string; status: 'pending' | 'success' | 'error'; error?: string; accountId?: number };
export type AuthorizationSession = {
  state: string; provider?: string; authorizationUrl?: string;
  userCode?: string; deviceCode?: string; verificationUri?: string; verificationUriComplete?: string;
  instructions?: { redirectUri?: string; callbackPort?: number; callbackPath?: string; manualCallbackDelayMs?: number; sshTunnelCommand?: string; sshTunnelKeyCommand?: string };
};
async function request<T = any>(url: string, method = 'GET', body?: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const data = method === 'GET' ? await apiGet<T>(url, options)
    : method === 'PATCH' ? await apiPatch<T>(url, body, options)
      : await apiPost<T>(url, body, options);
  const result = data as any;
  if (result?.success === false && !Array.isArray(result?.items)) throw new Error(result?.message || result?.error || 'error');
  return data;
}
export const oauthApi = {
  async data() {
    const providers = await request('/api/oauth/providers');
    const connections: any[] = [];
    let offset = 0;
    while (true) {
      const page = await request(`/api/oauth/connections?limit=100&offset=${offset}`);
      const items = page.items ?? [];
      connections.push(...items); offset += items.length;
      if (!items.length || offset >= (page.total ?? offset)) break;
    }
    return { providers: providers.providers ?? [], connections };
  },
  start: (provider: string, data: ProxyOptions & { projectId?: string }) => request<AuthorizationSession>(`/api/oauth/providers/${encodeURIComponent(provider)}/start`, 'POST', data),
  rebind: (id: number, data: ProxyOptions) => request<AuthorizationSession>(`/api/oauth/connections/${id}/rebind`, 'POST', data),
  session: (state: string, signal?: AbortSignal) => request<OAuthSession>(`/api/oauth/sessions/${encodeURIComponent(state)}`, 'GET', undefined, { signal }),
  callback: (state: string, callbackUrl: string, signal?: AbortSignal) => request(`/api/oauth/sessions/${encodeURIComponent(state)}/manual-callback`, 'POST', { callbackUrl }, { signal }),
  import: (data: Record<string, unknown>, proxy: ProxyOptions) => request('/api/oauth/import', 'POST', { data, ...proxy }),
  importBatch: (items: Record<string, unknown>[], proxy: ProxyOptions) => request('/api/oauth/import', 'POST', { items, ...proxy }),
  async models(id: number, refresh = false, signal?: AbortSignal) {
    if (refresh) {
      const result = await request(`/api/models/check/${id}`, 'POST', {}, { signal });
      if (result.refresh && result.refresh.status !== 'success') throw new Error(result.refresh.errorMessage || result.refresh.status);
    }
    return request(`/api/accounts/${id}/models`, 'GET', undefined, { signal });
  },
  createUnit: (data: { accountIds: number[]; name: string; strategy: string }) => request('/api/oauth/route-units', 'POST', data),
  updateUnit: (id: number, data: { name: string; strategy: string }) => request(`/api/oauth/route-units/${id}`, 'PATCH', data),
};
export function parseNativeOAuthJson(text: string): Record<string, unknown> {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid-native-json');
  return data;
}
export function collectRouteUnits(connections: any[]) {
  const groups = new Map<string, any>();
  for (const connection of connections) {
    const unit = connection.routeUnit ?? connection.routeParticipation;
    if (!unit || unit.kind !== 'route_unit') continue;
    const id = String(unit.id ?? unit.routeUnitId);
    if (!groups.has(id)) groups.set(id, { id, name: unit.name, modelFamily: connection.provider, region: connection.site?.name ?? '', strategy: unit.strategy, status: 'unknown', statusLabel: '', memberConnectionIds: [], requestsPerMinute: 0, dailyUsed: 0, dailyLimit: 0 });
    groups.get(id).memberConnectionIds.push(String(connection.accountId));
  }
  return [...groups.values()];
}
export function pollOAuthSession(state: string, read: (state: string, signal?: AbortSignal) => Promise<OAuthSession>, done: (session: OAuthSession) => void, error: (error: unknown) => void, interval = 2000) {
  let cancelled = false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function poll() {
    try {
      const session = await read(state, controller.signal);
      if (cancelled) return;
      if (session.status === 'pending') timer = setTimeout(poll, interval);
      else done(session);
    } catch (failure) { if (!cancelled) error(failure); }
  }
  void poll();
  return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
}
