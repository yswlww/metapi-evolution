import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiResponse } from "./client";
import { SITES as PROTOTYPE_SITES } from "../data/sites";
import { ACCOUNTS as PROTOTYPE_ACCOUNTS } from "../data/accounts";
import type { Account, Site } from "../data/prototype";
import { DASHBOARD_KPI } from "../data/dashboard";
import { TOKENS } from "../data/tokens";
import { ROUTES } from "../data/routes";
import { CHECKINS } from "../data/checkins";
import {
  OAUTH_PROVIDERS,
  OAUTH_CONNECTIONS,
  OAUTH_ROUTE_UNITS,
  ANNOUNCEMENTS,
  PROGRAM_EVENTS,
} from "../data/prototype";

/**
 * Unified data source layer.
 *
 * Switch `DATA_MODE` to "prototype" to use in-memory snapshot data (fully
 * functional offline). When "api" (the default), pages read and write the real
 * Metapi backend through the Vite proxy (`/api/*` → backend).
 *
 * Pages should import from here instead of `../data/*` directly.
 */
export const DATA_MODE: "prototype" | "api" = "api";

// ── Sites ────────────────────────────────────────────────────────────────

interface BackendSite {
  id: number;
  slug?: string;
  name: string;
  adapter?: string;
  platform?: string;
  url: string;
  baseUrl?: string;
  status?: "active" | "disabled" | null;
  enabled?: boolean;
  globalWeight?: number | null;
  isPinned?: boolean;
  pinned?: boolean;
  sortOrder?: number | null;
  region?: string | null;
  note?: string | null;
  balance?: number | null;
  accountCount?: number | null;
  accounts?: number | null;
  totalBalance?: number | null;
  customHeaders?: unknown;
  proxyUrl?: string | null;
  useSystemProxy?: boolean;
  apiKey?: string | null;
  subscriptionSummary?: {
    activeCount?: number;
    totalUsedUsd?: number;
    totalMonthlyLimitUsd?: number;
    totalRemainingUsd?: number;
    nextExpiresAt?: string;
    planNames?: string[];
  } | null;
}

function mapBackendSite(raw: BackendSite): Site {
  const enabled = raw.enabled ?? raw.status !== "disabled";
  const adapter = raw.adapter ?? raw.platform ?? "new-api";
  const activeCount = raw.subscriptionSummary?.activeCount;
  return {
    id: raw.id,
    slug: raw.slug ?? String(raw.id),
    name: raw.name,
    adapter,
    url: raw.url ?? raw.baseUrl ?? "",
    // Backend reports balance via subscriptionSummary, not a bare balance.
    balance: raw.totalBalance ?? raw.balance ?? 0,
    accounts: activeCount ?? raw.accounts ?? raw.accountCount ?? 0,
    enabled,
    status: enabled ? "healthy" : "disabled",
    statusLabel: enabled ? "Healthy" : "Disabled",
    region: raw.region ?? "",
    note: raw.note ?? "",
    sortOrder: raw.sortOrder ?? 0,
    customHeaders: raw.customHeaders ?? null,
    proxyUrl: raw.proxyUrl ?? null,
    useSystemProxy: raw.useSystemProxy ?? false,
    globalWeight: raw.globalWeight ?? 1,
    isPinned: raw.isPinned ?? false,
    apiKey: raw.apiKey ?? null,
  };
}

export async function fetchSites(): Promise<Site[]> {
  if (DATA_MODE === "prototype") return [...PROTOTYPE_SITES];
  const data = await apiGet<BackendSite[]>("/api/sites");
  return (data ?? []).map(mapBackendSite);
}

/** Create a site. Body uses backend field names, not the UI Site shape. */
export async function createSite(payload: {
  name: string;
  url: string;
  platform?: string;
  status?: "active" | "disabled";
  apiKey?: string;
}): Promise<Site> {
  if (DATA_MODE === "prototype") return payload as unknown as Site;
  const created = await apiPost<BackendSite>("/api/sites", payload);
  return mapBackendSite(created);
}

/** Update a site. Body uses backend field names. */
export async function updateSite(
  id: number,
  payload: {
    name?: string;
    url?: string;
    platform?: string;
    status?: "active" | "disabled";
    apiKey?: string;
    isPinned?: boolean;
    sortOrder?: number;
    globalWeight?: number;
  },
): Promise<Site> {
  if (DATA_MODE === "prototype") return { id, ...payload } as unknown as Site;
  const updated = await apiPut<BackendSite>(`/api/sites/${id}`, payload);
  return mapBackendSite(updated);
}

export async function deleteSite(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/sites/${id}`);
}

export async function batchUpdateSites(data: {
  ids: number[];
  action: "enable" | "disable" | "delete" | "pin" | "unpin";
  isPinned?: boolean;
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/sites/batch", data);
}

/** Detect site metadata from a URL. */
export async function detectSite(url: string): Promise<{
  name?: string;
  platform?: string;
  url: string;
}> {
  if (DATA_MODE === "prototype") return { url };
  return apiPost("/api/sites/detect", { url });
}

export async function fetchSiteDisabledModels(siteId: number): Promise<string[]> {
  if (DATA_MODE === "prototype") return [];
  const data = await apiGet<{ models?: string[] }>(`/api/sites/${siteId}/disabled-models`);
  return data?.models ?? [];
}

export async function updateSiteDisabledModels(siteId: number, models: string[]): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut(`/api/sites/${siteId}/disabled-models`, { models });
}

export async function probeSiteNow(
  siteId: number,
  options?: { scope?: "single" | "all"; modelName?: string; latencyThresholdMs?: number },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/sites/${siteId}/probe-now`, options ?? {});
}

// ── Accounts ─────────────────────────────────────────────────────────────

interface BackendAccount {
  id: number;
  siteId?: number;
  siteSlug?: string;
  siteName?: string;
  adapter?: string;
  username: string;
  balance?: number | null;
  status?: string | null;
  tokenCount?: number | null;
  lastCheckinAt?: string | null;
  lastSeenAt?: string | null;
  note?: string | null;
  // The accounts snapshot nests the full site row and a computed health state.
  site?: { id?: number; name?: string; platform?: string | null; status?: string | null } | null;
  runtimeHealth?: { state?: string | null; reason?: string | null } | null;
  extraConfig?: string | null;
  checkinEnabled?: boolean;
}

function mapBackendAccount(raw: BackendAccount): Account {
  const siteName = raw.site?.name ?? raw.siteName ?? "";
  const siteSlug = raw.site?.id != null ? String(raw.site.id) : (raw.siteSlug ?? "");
  // Health state is authoritative when present; fall back to account status.
  const healthState = raw.runtimeHealth?.state ?? raw.status ?? "healthy";
  const status = healthState === "disabled" ? "disabled"
    : healthState === "unhealthy" ? "unhealthy"
    : healthState === "degraded" ? "degraded"
    : healthState === "unknown" ? "unhealthy"
    : "healthy";
  return {
    id: raw.id,
    siteSlug,
    siteName,
    adapter: raw.site?.platform ?? raw.adapter ?? "new-api",
    username: raw.username,
    balance: raw.balance ?? 0,
    status,
    statusLabel: status === "disabled" ? "Disabled" : status === "unhealthy" ? "Unhealthy" : status === "degraded" ? "Degraded" : "Healthy",
    tokens: raw.tokenCount ?? 0,
    lastCheckin: raw.lastCheckinAt ?? "",
    lastSeen: raw.lastSeenAt ?? "",
    note: raw.runtimeHealth?.reason ?? raw.note ?? "",
    checkinEnabled: raw.checkinEnabled ?? true,
  };
}

export async function fetchAccounts(options?: { refresh?: boolean }): Promise<Account[]> {
  if (DATA_MODE === "prototype") return [...PROTOTYPE_ACCOUNTS];
  // Backend wraps accounts in { generatedAt, accounts: [...] }. Pass
  // ?refresh=1 to bypass the server-side snapshot cache after a write.
  const data = await apiGet<{ accounts?: BackendAccount[] } | BackendAccount[]>(
    `/api/accounts${options?.refresh ? "?refresh=1" : ""}`,
  );
  const list = Array.isArray(data) ? data : (data?.accounts ?? []);
  return (list ?? []).map(mapBackendAccount);
}

export async function loginAccount(payload: { siteId: number; username: string; password: string }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/accounts/login", payload);
}

// Create an upstream account directly with a credential (access token or API
// key). Payload uses the backend AccountCreatePayload shape.
export async function createAccount(payload: {
  siteId: number;
  username?: string;
  accessToken?: string;
  apiToken?: string;
  checkinEnabled?: boolean;
  credentialMode?: "accessToken" | "apiKey" | "password";
}): Promise<Account> {
  if (DATA_MODE === "prototype") return { id: 0, ...payload } as unknown as Account;
  const created = await apiPost<BackendAccount>("/api/accounts", payload);
  return mapBackendAccount(created);
}

export async function updateAccount(id: number, payload: {
  username?: string;
  accessToken?: string;
  apiToken?: string | null;
  status?: string;
  checkinEnabled?: boolean;
  unitCost?: number | null;
  isPinned?: boolean;
  sortOrder?: number;
  proxyUrl?: string | null;
}): Promise<Account> {
  if (DATA_MODE === "prototype") return { id, ...payload } as unknown as Account;
  const updated = await apiPut<BackendAccount>(`/api/accounts/${id}`, payload);
  return mapBackendAccount(updated);
}

// Verify an access token against a site before creating the account. The
// backend returns HTTP 200 with { success: false, message } for invalid
// tokens, so the caller must inspect the body, not just the HTTP status.
export async function verifyAccountToken(payload: {
  siteId: number;
  accessToken?: string;
  platformUserId?: number;
  credentialMode?: "accessToken" | "apiKey" | "password";
  proxyUrl?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  if (DATA_MODE === "prototype") return { success: true };
  const res = await apiPost<{ success?: boolean; message?: string }>("/api/accounts/verify-token", payload);
  return { success: res?.success !== false, message: res?.message };
}

// Rebind an account's session with a new access token.
export async function rebindAccountSession(
  id: number,
  payload: { accessToken?: string; platformUserId?: number; refreshToken?: string; tokenExpiresAt?: number | string },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/accounts/${id}/rebind-session`, payload);
}

// Refresh account health (re-probe).
export async function refreshAccountHealth(payload: { accountId?: number; wait?: boolean }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/accounts/health/refresh", payload, { timeoutMs: payload.wait ? 150_000 : 30_000 });
}

// Add manual models to an account's availability.
export async function addAccountAvailableModels(accountId: number, models: string[]): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/accounts/${accountId}/models/manual`, { models });
}

export async function deleteAccount(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/accounts/${id}`);
}

export async function refreshAccountBalance(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/accounts/${id}/balance`);
}

export async function addAccountToken(data: {
  accountId: number;
  name?: string;
  token: string;
  enabled?: boolean;
  isDefault?: boolean;
  group?: string;
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/account-tokens", data);
}

/** List account tokens, optionally filtered by accountId. */
export async function fetchAccountTokens(accountId?: number): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [];
  const data = await apiGet<unknown[]>(`/api/account-tokens${accountId ? `?accountId=${accountId}` : ""}`);
  return data ?? [];
}

export async function setDefaultAccountToken(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/account-tokens/${id}/default`);
}

export async function deleteAccountToken(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/account-tokens/${id}`);
}

export async function updateAccountToken(id: number, data: { enabled?: boolean; name?: string; isDefault?: boolean }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut(`/api/account-tokens/${id}`, data);
}

export async function getAccountTokenValue(id: number): Promise<{ token?: string }> {
  if (DATA_MODE === "prototype") return {};
  return apiGet<{ token?: string }>(`/api/account-tokens/${id}/value`);
}

export async function syncAllAccountTokens(wait = false): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/account-tokens/sync-all", wait ? { wait: true } : {}, { timeoutMs: wait ? 150_000 : 30_000 });
}

export async function syncAccountTokens(accountId: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/account-tokens/sync/${accountId}`, {}, { timeoutMs: 45_000 });
}

export async function triggerCheckinAll(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/checkin/trigger");
}

export async function triggerCheckin(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/checkin/trigger/${id}`);
}

// ── Dashboard / Stats ────────────────────────────────────────────────────

export interface DashboardFeed {
  summary: {
    totalBalance: number;
    todaySpend: number;
    todayReward: number;
    avgLatency: number | null;
    requestsPerMinute: number;
    activeAccounts: number;
    totalAccounts: number;
    activeRoutes: number;
    totalRoutes: number;
  };
  siteDistribution: Array<{ siteId?: number; siteName?: string; platform?: string; totalBalance?: number; totalSpend?: number; accountCount?: number }>;
  siteAvailability: Array<{ siteId?: number; siteName?: string; siteUrl?: string; platform?: string; totalRequests?: number; successCount?: number; failedCount?: number; availabilityPercent?: number | null; averageLatencyMs?: number | null }>;
  siteTrend: Array<{ date?: string; value?: number; day?: string; ok?: number; fail?: number }>;
  sites: BackendSite[];
  events: unknown[];
}

export async function fetchDashboardFeed(): Promise<DashboardFeed> {
  if (DATA_MODE === "prototype") {
    return {
      summary: {
        totalBalance: DASHBOARD_KPI.totalBalance,
        todaySpend: DASHBOARD_KPI.todaySpend,
        todayReward: 0,
        avgLatency: DASHBOARD_KPI.avgLatency,
        requestsPerMinute: 0,
        activeAccounts: DASHBOARD_KPI.healthyAccounts,
        totalAccounts: DASHBOARD_KPI.totalAccounts,
        activeRoutes: 0,
        totalRoutes: 0,
      },
      siteDistribution: [],
      siteAvailability: DASHBOARD_KPI.siteObservability.map((s) => ({
        siteId: undefined,
        siteName: s.name,
        totalRequests: s.requests24h,
        availabilityPercent: s.availability,
        averageLatencyMs: s.avgLatency,
      })),
      siteTrend: DASHBOARD_KPI.siteTrend ?? [],
      sites: [],
      events: DASHBOARD_KPI.events ?? [],
    };
  }

  const [dashboard, distribution, trend, insights, routes, events] = await Promise.all([
    apiGet<any>("/api/stats/dashboard?view=summary"),
    apiGet<any>("/api/stats/site-distribution"),
    apiGet<any>("/api/stats/site-trend?days=7"),
    apiGet<any>("/api/stats/dashboard?view=insights").catch(() => null),
    apiGet<unknown[]>("/api/routes").catch(() => []),
    apiGet<unknown[]>("/api/events?limit=10").catch(() => []),
  ]);

  const summary = dashboard ?? {};
  const routeList = Array.isArray(routes) ? routes : [];
  return {
    summary: {
      totalBalance: summary.totalBalance ?? 0,
      todaySpend: summary.todaySpend ?? 0,
      todayReward: summary.todayReward ?? 0,
      avgLatency: summary.performance?.p50LatencyMs ?? null,
      requestsPerMinute: summary.performance?.requestsPerMinute ?? 0,
      activeAccounts: summary.activeAccounts ?? 0,
      totalAccounts: summary.totalAccounts ?? 0,
      activeRoutes: routeList.filter((r: any) => r?.enabled !== false).length,
      totalRoutes: routeList.length,
    },
    siteDistribution: Array.isArray(distribution?.distribution) ? distribution.distribution : [],
    siteAvailability: Array.isArray(insights?.siteAvailability) ? insights.siteAvailability : [],
    siteTrend: Array.isArray(trend?.trend) ? trend.trend : [],
    sites: [],
    events: Array.isArray(events) ? events : [],
  };
}

export async function fetchProxyLogs(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
  client?: string;
  siteId?: number | string;
  from?: string;
  to?: string;
}) {
  if (DATA_MODE === "prototype") return { logs: [], total: 0, page: 1, pageSize: 50, summary: null };
  const query = new URLSearchParams();
  query.set("view", "query");
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.client) query.set("client", params.client);
  if (params?.siteId !== undefined) query.set("siteId", String(params.siteId));
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const data = await apiGet<{ items?: unknown[]; total?: number; page?: number; pageSize?: number; summary?: unknown }>(
    `/api/stats/proxy-logs?${query.toString()}`,
  );
  return { logs: data?.items ?? [], total: data?.total ?? 0, page: data?.page ?? 1, pageSize: data?.pageSize ?? 50, summary: data?.summary ?? null };
}

export async function fetchMonitorOverview(refresh = false) {
  if (DATA_MODE === "prototype") return { accounts: null, sites: null, routes: null, traffic24h: null };
  const data = await apiGet<any>(`/api/monitor/overview${refresh ? "?refresh=1" : ""}`);
  return {
    accounts: data?.accounts ?? null,
    sites: data?.sites ?? { total: 0, active: 0, disabled: 0 },
    routes: data?.routes ?? { total: 0, problemItems: [] },
    traffic24h: data?.traffic24h ?? null,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────

export async function fetchRoutes(): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [...ROUTES];
  const data = await apiGet<unknown[]>("/api/routes");
  return Array.isArray(data) ? data : [];
}

/** Create a route. Backend expects modelPattern/displayName/routingStrategy. */
export async function addRoute(payload: {
  modelPattern: string;
  displayName?: string;
  routingStrategy?: string;
  displayIcon?: string;
  routeMode?: string;
  enabled?: boolean;
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/routes", payload);
}

export async function updateRoute(
  id: number,
  payload: {
    modelPattern?: string;
    displayName?: string;
    routingStrategy?: string;
    displayIcon?: string;
    routeMode?: string;
    enabled?: boolean;
  },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut(`/api/routes/${id}`, payload);
}

export async function deleteRoute(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/routes/${id}`);
}

export async function clearRouteCooldown(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/routes/${id}/cooldown/clear`);
}

export async function rebuildRoutes(refreshModels = true, wait = false): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/routes/rebuild", {
    refreshModels,
    ...(wait ? { wait: true } : {}),
  }, { timeoutMs: wait ? 150_000 : 30_000 });
}

export async function batchUpdateRoutes(data: { ids: number[]; action: "enable" | "disable" }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/routes/batch", data);
}

/** Live routing decision for a model pattern (GET /api/routes/decision). */
export async function getRouteDecision(model: string): Promise<{
  requestedModel: string;
  actualModel: string;
  matched: boolean;
  summary: string[];
  candidates: unknown[];
} | null> {
  if (DATA_MODE === "prototype") return null;
  try {
    const data = await apiGet<any>(`/api/routes/decision?model=${encodeURIComponent(model)}`);
    return data?.decision ?? null;
  } catch {
    return null;
  }
}

// ── Route channels ──────────────────────────────────────────────────────

/** List channels bound to a route. */
export async function fetchRouteChannels(routeId: number): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [];
  const data = await apiGet<unknown[]>(`/api/routes/${routeId}/channels`);
  return data ?? [];
}

/** Add a single channel (account + optional token) to a route. */
export async function addChannel(
  routeId: number,
  payload: { accountId: number; tokenId?: number | null; sourceModel?: string; priority?: number; weight?: number },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/routes/${routeId}/channels`, payload);
}

/** Batch add channels to a route. */
export async function batchAddChannels(
  routeId: number,
  channels: Array<{ accountId: number; tokenId?: number; sourceModel?: string }>,
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/routes/${routeId}/channels/batch`, { channels });
}

/** Update a channel (priority, token binding, enabled, weight). */
export async function updateChannel(
  channelId: number,
  payload: { tokenId?: number | null; sourceModel?: string | null; priority?: number; weight?: number; enabled?: boolean },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut(`/api/channels/${channelId}`, payload);
}

/** Delete a channel from a route. */
export async function deleteChannel(channelId: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/channels/${channelId}`);
}

/** Batch update channel priorities (ordering). */
export async function batchUpdateChannelPriorities(updates: Array<{ id: number; priority: number }>): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut("/api/channels/batch", { updates });
}

// ── Downstream keys ──────────────────────────────────────────────────────

export async function fetchDownstreamKeys() {
  if (DATA_MODE === "prototype") return { items: [] };
  const data = await apiGet<{ items?: unknown[] }>("/api/downstream-keys");
  return { items: data?.items ?? [] };
}

export async function createDownstreamApiKey(payload: Record<string, unknown>): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/downstream-keys", payload);
}

export async function updateDownstreamApiKey(id: number, payload: Record<string, unknown>): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut(`/api/downstream-keys/${id}`, payload);
}

export async function deleteDownstreamApiKey(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/downstream-keys/${id}`);
}

export async function resetDownstreamApiKeyUsage(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/downstream-keys/${id}/reset-usage`);
}

export async function batchDownstreamApiKeys(data: {
  ids: number[];
  action: "enable" | "disable" | "delete" | "resetUsage" | "updateMetadata";
  groupOperation?: "keep" | "set" | "clear";
  groupName?: string;
  tagOperation?: "keep" | "append";
  tags?: string[];
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/downstream-keys/batch", data);
}

export async function fetchDownstreamKeysSummary(params?: {
  range?: "24h" | "7d" | "all";
  status?: "all" | "enabled" | "disabled";
  search?: string;
}) {
  if (DATA_MODE === "prototype") return { items: [] };
  const query = new URLSearchParams();
  if (params?.range) query.set("range", params.range);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const data = await apiGet<any>(`/api/downstream-keys/summary${query.toString() ? `?${query}` : ""}`);
  return data ?? {};
}

/** Per-key usage trend buckets (GET /api/downstream-keys/:id/trend). */
export async function fetchDownstreamKeyTrend(
  id: number,
  params?: { range?: "24h" | "7d" | "all" },
): Promise<{ buckets: Array<{ startUtc: string | null; totalRequests: number; successRate: number | null; totalCost: number }> }> {
  if (DATA_MODE === "prototype") return { buckets: [] };
  const query = new URLSearchParams();
  query.set("range", params?.range ?? "7d");
  const data = await apiGet<any>(`/api/downstream-keys/${id}/trend?${query.toString()}`);
  return { buckets: Array.isArray(data?.buckets) ? data.buckets : [] };
}

// ── Checkins ─────────────────────────────────────────────────────────────

export async function fetchCheckins(): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [...CHECKINS];
  const data = await apiGet<unknown[]>("/api/checkin/logs");
  return data ?? [];
}

export async function updateCheckinSchedule(payload: {
  mode?: "cron" | "interval";
  cron?: string;
  intervalHours?: number;
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut("/api/checkin/schedule", payload);
}

// ── OAuth ────────────────────────────────────────────────────────────────

export async function fetchOAuthData() {
  if (DATA_MODE === "prototype") {
    return { providers: OAUTH_PROVIDERS, connections: OAUTH_CONNECTIONS, routeUnits: OAUTH_ROUTE_UNITS };
  }
  const [providers, connections] = await Promise.all([
    apiGet<any>("/api/oauth/providers"),
    apiGet<any>("/api/oauth/connections"),
  ]);
  return {
    providers: providers?.providers ?? providers ?? [],
    connections: connections?.items ?? connections?.connections ?? connections ?? [],
    routeUnits: [],
  };
}

export async function startOAuthProvider(
  provider: string,
  data?: { accountId?: number; projectId?: string; proxyUrl?: string | null; useSystemProxy?: boolean },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/oauth/providers/${encodeURIComponent(provider)}/start`, data ?? {});
}

export async function submitOAuthManualCallback(state: string, callbackUrl: string): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/oauth/sessions/${encodeURIComponent(state)}/manual-callback`, { callbackUrl });
}

export async function refreshOAuthConnectionQuota(accountId: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/oauth/connections/${accountId}/quota/refresh`, {});
}

export async function rebindOAuthConnection(
  accountId: number,
  data?: { proxyUrl?: string | null; useSystemProxy?: boolean; projectId?: string },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/oauth/connections/${accountId}/rebind`, data ?? {});
}

export async function updateOAuthConnectionProxy(
  accountId: number,
  data: { proxyUrl?: string | null; useSystemProxy?: boolean },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPatch(`/api/oauth/connections/${accountId}/proxy`, data);
}

export async function deleteOAuthConnectionsBatch(accountIds: number[]): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/oauth/connections/delete-batch", { accountIds });
}

export async function deleteOAuthConnection(accountId: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/oauth/connections/${accountId}`);
}

export async function createOAuthRouteUnit(data: { accountIds: number[]; name: string; strategy: string }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/oauth/route-units", data);
}

export async function updateOAuthRouteUnit(
  routeUnitId: number,
  data: { name?: string; strategy?: string },
): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPatch(`/api/oauth/route-units/${routeUnitId}`, data);
}

export async function deleteOAuthRouteUnit(routeUnitId: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete(`/api/oauth/route-units/${routeUnitId}`);
}

export async function importOAuthConnections(data: Record<string, unknown>): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/oauth/import", { data });
}

// ── Events / Announcements ───────────────────────────────────────────────

export async function fetchEvents(limit = 50): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [...PROGRAM_EVENTS];
  const data = await apiGet<unknown[]>(`/api/events?limit=${limit}`);
  return data ?? [];
}

export async function markEventRead(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/events/${id}/read`);
}

export async function markAllEventsRead(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/events/read-all");
}

export async function clearEvents(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete("/api/events");
}

export async function fetchAnnouncements(): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [...ANNOUNCEMENTS];
  const data = await apiGet<unknown[]>("/api/site-announcements");
  return data ?? [];
}

export async function markSiteAnnouncementRead(id: number): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost(`/api/site-announcements/${id}/read`);
}

export async function markAllSiteAnnouncementsRead(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/site-announcements/read-all");
}

export async function clearSiteAnnouncements(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiDelete("/api/site-announcements");
}

export async function syncSiteAnnouncements(payload?: { siteId?: number }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/site-announcements/sync", payload ?? {});
}

// ── Settings / Maintenance ───────────────────────────────────────────────

export async function fetchRuntimeSettings() {
  if (DATA_MODE === "prototype") return {};
  const data = await apiGet<any>("/api/settings/runtime");
  return data ?? {};
}

export async function updateRuntimeSettings(payload: unknown): Promise<unknown> {
  if (DATA_MODE === "prototype") return payload;
  return apiPut("/api/settings/runtime", payload);
}

export async function testSystemProxy(data: {
  proxyUrl?: string;
}): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiPost("/api/settings/system-proxy/test", data, { timeoutMs: 20_000 });
}

export async function testNotification(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/notify/test");
}

export async function clearRuntimeCache(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/maintenance/clear-cache");
}

export async function clearUsageData(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/maintenance/clear-usage");
}

export async function factoryReset(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/maintenance/factory-reset");
}

export async function exportBackup(type: "all" | "accounts" | "preferences" = "all"): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet(`/api/settings/backup/export?type=${encodeURIComponent(type)}`);
}

export async function importBackup(data: unknown): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/backup/import", { data });
}

export async function getBackupWebdavConfig(): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet("/api/settings/backup/webdav");
}

export async function saveBackupWebdavConfig(payload: Record<string, unknown>): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut("/api/settings/backup/webdav", payload);
}

export async function exportBackupToWebdav(type?: "all" | "accounts" | "preferences"): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/backup/webdav/export", type ? { type } : {});
}

export async function importBackupFromWebdav(): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/backup/webdav/import", {});
}

export async function migrateExternalDatabase(payload: {
  dialect: "sqlite" | "mysql" | "postgres";
  connectionString: string;
  overwrite?: boolean;
  ssl?: boolean;
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/database/migrate", payload, { timeoutMs: 120_000 });
}

export async function testExternalDatabaseConnection(payload: {
  dialect: "sqlite" | "mysql" | "postgres";
  connectionString: string;
  ssl?: boolean;
}): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPost("/api/settings/database/test-connection", payload, { timeoutMs: 30_000 });
}

// ── Models marketplace ───────────────────────────────────────────────────

export async function fetchModelsMarketplace(options?: {
  refresh?: boolean;
  includePricing?: boolean;
}): Promise<{ models: unknown[]; meta?: unknown }> {
  if (DATA_MODE === "prototype") return { models: [] };
  const query = new URLSearchParams();
  if (options?.refresh) query.set("refresh", "1");
  if (options?.includePricing) query.set("includePricing", "1");
  const qs = query.toString();
  const data = await apiGet<any>(`/api/models/marketplace${qs ? `?${qs}` : ""}`, {
    timeoutMs: options?.refresh ? 45_000 : 15_000,
  });
  return { models: data?.models ?? [], meta: data?.meta ?? undefined };
}

/** Per-site model usage analysis (GET /api/stats/model-by-site). */
export async function fetchModelBySite(options?: { siteId?: number; days?: number }): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [];
  const query = new URLSearchParams();
  if (options?.siteId) query.set("siteId", String(options.siteId));
  query.set("days", String(options?.days ?? 7));
  const data = await apiGet<{ models?: unknown[] }>(`/api/stats/model-by-site?${query.toString()}`);
  return data?.models ?? [];
}

export async function fetchProxyLogDetail(id: number): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet(`/api/stats/proxy-logs/${id}`);
}

export async function fetchProxyDebugTraces(params?: { limit?: number }): Promise<unknown[]> {
  if (DATA_MODE === "prototype") return [];
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  const data = await apiGet<{ items?: unknown[] }>(`/api/stats/proxy-debug/traces${query.toString() ? `?${query}` : ""}`);
  return data?.items ?? [];
}

/** Single debug trace detail (GET /api/stats/proxy-debug/traces/:id). */
export async function fetchProxyDebugTraceDetail(id: number): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet(`/api/stats/proxy-debug/traces/${id}`);
}

/** Token candidate model names (GET /api/models/token-candidates). */
export async function fetchModelTokenCandidates(): Promise<string[]> {
  if (DATA_MODE === "prototype") return [];
  const data = await apiGet<{ models?: Record<string, unknown> }>("/api/models/token-candidates");
  return Object.keys(data?.models ?? {});
}

// ── Monitor config ───────────────────────────────────────────────────────

export async function fetchMonitorConfig(): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet("/api/monitor/config");
}

export async function updateMonitorConfig(payload: { ldohCookie?: string | null }): Promise<void> {
  if (DATA_MODE === "prototype") return;
  await apiPut("/api/monitor/config", payload);
}

// ── Search ───────────────────────────────────────────────────────────────

export async function search(query: string): Promise<unknown> {
  if (DATA_MODE === "prototype") return { sites: [], accounts: [], tokens: [] };
  return apiPost("/api/search", { query, limit: 20 });
}

// ── Update center ────────────────────────────────────────────────────────

export async function getUpdateCenterStatus(): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet("/api/update-center/status");
}

export async function checkUpdateCenter(): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiPost("/api/update-center/check", {});
}

export async function deployUpdateCenter(data: {
  source: "github-release" | "docker-hub-tag";
  targetTag: string;
  targetDigest?: string | null;
}): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiPost("/api/update-center/deploy", data);
}

export async function rollbackUpdateCenter(data: { targetRevision: string }): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiPost("/api/update-center/rollback", data);
}

// ── Proxy / chat test jobs ───────────────────────────────────────────────

export async function startProxyTestJob(payload: Record<string, unknown>): Promise<{ jobId?: string }> {
  if (DATA_MODE === "prototype") return {};
  return apiPost("/api/test/proxy/jobs", payload);
}

export async function getProxyTestJob(jobId: string): Promise<unknown> {
  if (DATA_MODE === "prototype") return {};
  return apiGet(`/api/test/proxy/jobs/${encodeURIComponent(jobId)}`);
}

export async function startTestChatJob(payload: Record<string, unknown>): Promise<{ jobId?: string }> {
  if (DATA_MODE === "prototype") return {};
  return apiPost("/api/test/chat/jobs", payload);
}

export async function testProxyStream(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return apiResponse("/api/test/proxy/stream", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function testChatStream(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return apiResponse("/api/test/chat/stream", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
