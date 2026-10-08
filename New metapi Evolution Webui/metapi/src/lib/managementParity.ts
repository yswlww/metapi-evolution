export type CredentialRef = { kind: 'account_token'; siteId: number; accountId: number; tokenId: number } | { kind: 'default_api_key'; siteId: number; accountId: number };
export function credentialRefKey(ref: CredentialRef) { return `${ref.kind}:${ref.siteId}:${ref.accountId}:${ref.kind === 'account_token' ? ref.tokenId : ''}`; }
export function buildPolicyRestrictions(routes: Iterable<string | number>, sites: Iterable<number>, credentials: Iterable<CredentialRef>) {
  return { allowedRouteIds: [...routes].map(Number), excludedSiteIds: [...sites], excludedCredentialRefs: [...credentials] };
}
export interface AccountEditDraft { username: string; status: string; checkinEnabled: boolean; unitCost: string; proxyUrl: string; isPinned: boolean; sortOrder: string; accessToken: string; apiToken: string; refreshToken: string; tokenExpiresAt: string; clearAccessToken?: boolean; clearApiToken?: boolean; clearRefreshToken?: boolean }
export function buildAccountEditPayload(draft: AccountEditDraft) {
  const unitCost = draft.unitCost.trim() ? Number(draft.unitCost) : null;
  const sortOrder = Number(draft.sortOrder);
  if ((unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) || !Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('Invalid cost/order');
  const tokenExpiresAt = draft.tokenExpiresAt.trim() ? Number(draft.tokenExpiresAt) : undefined;
  if (tokenExpiresAt !== undefined && (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt < 0)) throw new Error('Invalid token expiry');
  return { username: draft.username.trim(), status: draft.status, checkinEnabled: draft.checkinEnabled, unitCost, proxyUrl: draft.proxyUrl.trim() || null, isPinned: draft.isPinned, sortOrder,
    ...(draft.clearAccessToken ? { accessToken: '' } : draft.accessToken.trim() ? { accessToken: draft.accessToken.trim() } : {}),
    ...(draft.clearApiToken ? { apiToken: null } : draft.apiToken.trim() ? { apiToken: draft.apiToken.trim() } : {}),
    ...(draft.clearRefreshToken ? { refreshToken: null, tokenExpiresAt: null } : { ...(draft.refreshToken.trim() ? { refreshToken: draft.refreshToken.trim() } : {}), ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}) }) };
}
export function buildTokenEditPayload(draft: { name: string; token: string; group: string; enabled: boolean; isDefault: boolean }, pending = false) {
  if (pending && !draft.token.trim()) throw new Error('Complete token required');
  return { name: draft.name.trim(), group: draft.group.trim(), enabled: draft.enabled, isDefault: draft.isDefault, ...(draft.token.trim() ? { token: draft.token.trim() } : {}) };
}
export function sortManagementRows<T extends { id: number; isPinned?: boolean; sortOrder?: number }>(rows: T[]): T[] {
  return [...rows].sort((a,b) => Number(!!b.isPinned) - Number(!!a.isPinned) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
}
export function buildOrderUpdates<T extends { id: number; isPinned?: boolean; sortOrder?: number }>(rows: T[], id: number, direction: 'up' | 'down') {
  const current = rows.find(r => r.id === id);
  if (!current) return [];
  const partition = sortManagementRows(rows.filter(r => !!r.isPinned === !!current.isPinned));
  const index = partition.findIndex(r => r.id === id), next = index + (direction === 'up' ? -1 : 1);
  if (next < 0 || next >= partition.length) return [];
  [partition[index], partition[next]] = [partition[next], partition[index]];
  return partition.map((r, sortOrder) => ({ id: r.id, sortOrder }));
}
export function filterTokens<T extends { name?: string; tokenGroup?: string | null; accountId?: number; enabled?: boolean; valueStatus?: string; account?: { username?: string }; site?: { name?: string } }>(rows: T[], filters: { query: string; status: string; accountId: string; group: string }) {
  const query = filters.query.trim().toLowerCase();
  return rows.filter(r => (!query || [r.name, r.tokenGroup, r.account?.username, r.site?.name].some(s => s?.toLowerCase().includes(query))) && (!filters.accountId || String(r.accountId) === filters.accountId) && (!filters.group || (r.tokenGroup || 'default') === filters.group) && (filters.status === 'all' || (filters.status === 'pending' ? r.valueStatus === 'masked_pending' : filters.status === 'enabled' ? !!r.enabled : !r.enabled)));
}
export function buildCredentialOptions(accounts: any[], tokens: any[]): Array<{ ref: CredentialRef; label: string }> {
  const explicit = tokens.map(t => { const owner = accounts.find(a => a.id === (t.accountId ?? t.account?.id)); return { ref: { kind: 'account_token' as const, siteId: Number(t.site?.id ?? owner?.siteId ?? owner?.site?.id), accountId: Number(t.accountId ?? t.account?.id), tokenId: Number(t.id) }, label: `${t.site?.name ?? owner?.site?.name ?? ''} / ${t.account?.username ?? owner?.username ?? ''} / ${t.name ?? t.id}` }; }).filter(o => o.ref.siteId > 0 && o.ref.accountId > 0);
  const defaults = accounts.filter(a => typeof a.apiToken === 'string' && a.apiToken.trim()).map(a => ({ ref: { kind: 'default_api_key' as const, siteId: Number(a.siteId ?? a.site?.id), accountId: Number(a.id) }, label: `${a.site?.name ?? ''} / ${a.username ?? a.id}` })).filter(o => o.ref.siteId > 0);
  return [...explicit, ...defaults];
}
export function buildSchedulePayload(mode: 'cron' | 'interval', cron: string, hours: string): { mode: 'cron'; cron: string } | { mode: 'interval'; intervalHours: number } {
  if (mode === 'cron') { if (!cron.trim()) throw new Error('Cron required'); return { mode, cron: cron.trim() }; }
  const intervalHours = Number(hours);
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 24) throw new Error('Invalid interval');
  return { mode, intervalHours };
}
export function checkinDiagnostics(reason: unknown, message: string) {
  const value = reason && typeof reason === 'object' ? reason as Record<string, unknown> : {};
  const text = (key: string) => typeof value[key] === 'string' ? value[key] as string : '';
  return { code: text('code'), category: text('category'), title: typeof reason === 'string' ? reason : text('title'), detailHint: text('detailHint'), actionHint: text('actionHint'), message };
}
export interface BatchResponse { success?: boolean; message?: string; successIds?: number[]; failedItems?: Array<{ id: number; message: string }> }
export function batchOutcome(result: BatchResponse) {
  if (result.success === false) throw new Error(result.message || 'Batch failed');
  return { succeeded: result.successIds?.length ?? 0, failedIds: (result.failedItems ?? []).map(i => i.id), messages: (result.failedItems ?? []).map(i => `${i.id}: ${i.message}`) };
}
export function parseSiteWeightDraft(raw: string): Record<string, number> {
  if (!raw.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid site weights');
  for (const [id, value] of Object.entries(parsed)) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0 || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('Invalid site weights');
  }
  return parsed as Record<string, number>;
}
export async function rotateAdminCredential(next: string, save: (token: string) => Promise<unknown>, login: (token: string) => void) {
  const clean = next.trim();
  if (!clean) throw new Error('Admin token required');
  await save(clean);
  login(clean);
}
export function matchesTags(tags: readonly string[], selected: readonly string[], mode: 'any' | 'all') {
  const normalized = new Set(tags.map(t => t.toLowerCase()));
  return !selected.length || (mode === 'all' ? selected.every(t => normalized.has(t.toLowerCase())) : selected.some(t => normalized.has(t.toLowerCase())));
}
