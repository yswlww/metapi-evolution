import { useEffect, useMemo, useState } from "react";
import { oauthApi, parseNativeOAuthJson, collectRouteUnits, type AuthorizationSession } from './oauth/oauthApi';
import { AuthorizationPanel, OAuthModelsDrawer } from './oauth/OAuthPanels';
import { useOAuthText } from './oauth/useOAuthText';
import { KeyRound, RefreshCw, Server, ShieldCheck, Users } from "lucide-react";
import {
  OAUTH_CONNECTIONS,
  OAUTH_PROVIDERS,
  OAUTH_ROUTE_UNITS,
  type OAuthConnectionStatus,
  type OAuthProviderStatus,
} from "../data/prototype";
import {
  buildOAuthConnectionViewModels,
  type OAuthConnectionFilters,
} from "./managementViewModels";
import PageHeader from "../components/PageHeader";
import {
  EmptyState,
  ProgressBar,
  SearchField,
  SectionTitle,
  StatCard,
  type PrototypeTone,
} from "../components/PrototypeUI";
import { EditDrawer, Field, Select, TextInput } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import {
  DATA_MODE,
  refreshOAuthConnectionQuota,
  updateOAuthConnectionProxy,
  deleteOAuthConnection,
  deleteOAuthRouteUnit,
} from "../lib/source";

const STATUS_OPTIONS: ("all" | OAuthConnectionStatus)[] = [
  "all",
  "active",
  "attention",
  "expired",
  "disabled",
];

const STATUS_TONES: Record<OAuthConnectionStatus, PrototypeTone> = {
  active: "lime",
  attention: "amber",
  expired: "rose",
  disabled: "muted",
};

const PROVIDER_STATUS_TONES: Record<OAuthProviderStatus, PrototypeTone> = {
  connected: "lime",
  available: "cyan",
  maintenance: "amber",
};

const ROUTE_STATUS_TONES: Record<string, PrototypeTone> = {
  healthy: "lime",
  degraded: "amber",
  disabled: "muted",
};

function byteCount(value: number, unit: string): number {
  if (unit === "tokens") return value >= 1_000_000 ? Math.round(value / 1_000_000) : value >= 1_000 ? Math.round(value / 1_000) : Math.round(value);
  return Math.round(value);
}

type OAuthFeedback = string | { key: string; params?: Record<string, string | number> };

type DrawerIntent =
  | { mode: "create"; providerId?: string }
  | { mode: "rebind"; connectionId: string }
  | { mode: "proxy"; connectionId: string }
  | { mode: "import" }
  | { mode: "route-unit" };

export interface RouteUnitDraft {
  id: string;
  name: string;
  modelFamily: string;
  region: string;
  strategy: "round_robin" | "stick_until_unavailable";
  status: "healthy" | "degraded" | "disabled" | "unknown";
  statusLabel: string;
  memberConnectionIds: string[];
  requestsPerMinute: number;
  dailyUsed: number;
  dailyLimit: number;
}

export default function OAuthManagement() {
  const t = useUiText();
  const text = useOAuthText();
  const [modelsAccount, setModelsAccount] = useState<{ id: number; name: string } | null>(null);
  const [filters, setFilters] = useState<OAuthConnectionFilters>({
    query: "",
    providerId: "all",
    status: "all",
  });
  const [drawer, setDrawer] = useState<DrawerIntent | null>(null);
  const [feedback, setFeedback] = useState<OAuthFeedback | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [routeUnits, setRouteUnits] = useState<RouteUnitDraft[]>([]);
  const [editingUnit, setEditingUnit] = useState<RouteUnitDraft | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Quota window toggle: backend snapshots expose fiveHour / sevenDay windows.
  const [quotaWindow, setQuotaWindow] = useState<"fiveHour" | "sevenDay">("sevenDay");

  // Resolve a connection's quota bar from the selected window. Backend
  // connections carry { windows: { fiveHour, sevenDay } }; prototype
  // connections carry a flat { used, limit, unit }.
  const resolveQuota = (connection: any) => {
    const win = connection?.quota?.windows?.[quotaWindow];
    if (win && typeof win.used === "number") {
      const limit = win.limit ?? 0;
      return {
        unit: quotaWindow === "fiveHour" ? "5h quota" : "7d quota",
        percent: limit > 0 ? Math.min(100, Math.round((win.used / limit) * 100)) : 0,
        text: limit > 0
          ? `${Math.round(win.used).toLocaleString()} / ${Math.round(limit).toLocaleString()}`
          : `${Math.round(win.used).toLocaleString()} used`,
      };
    }
    // Backend window exists but is unsupported (no `used`) — surface the
    // provider's message instead of silently falling back to flat quota.
    if (win && win.supported === false) {
      return { unit: quotaWindow === "fiveHour" ? "5h" : "7d", percent: 0, text: win.message ?? "unavailable" };
    }
    return { unit: connection?.quota?.unit ?? "quota", percent: connection?.quota?.percent ?? 0, text: connection?.quota?.text ?? "—" };
  };

  // Real backend providers/connections. In API mode these replace the
  // prototype fallback so the page reflects the live gateway.
  const [liveProviders, setLiveProviders] = useState<typeof OAUTH_PROVIDERS | null>(null);
  const [liveConnections, setLiveConnections] = useState<typeof OAUTH_CONNECTIONS | null>(null);
  const [oauthLoaded, setOauthLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = async () => {
    if (DATA_MODE === "prototype") return;
    try {
      const data = await oauthApi.data();
      setLoadError(null);
      // Map backend provider rows to the prototype display shape.
      const providers = (data.providers ?? []).map((p: any, i: number) => ({
        id: p.provider ?? String(i),
        name: p.label ?? p.provider ?? "",
        description: p.platform ?? "",
        authorizationType: "oauth",
        status: p.enabled === false ? ("maintenance" as const) : ("available" as const),
        enabled: p.enabled !== false,
        statusLabel: "",
        connected: false,
        requiresProjectId: Boolean(p.requiresProjectId),
      }));
      const connections = (data.connections ?? []).map((c: any) => ({
        id: String(c.id ?? c.accountId ?? ""),
        accountEmail: c.email ?? c.username ?? c.accountKey ?? "",
        accountName: c.username ?? c.email ?? c.accountKey ?? "",
        providerId: c.provider ?? "",
        status: (c.status === "healthy" ? "active" : c.status === "abnormal" ? "attention" : c.status ?? "active") as OAuthConnectionStatus,
        statusLabel: "",
        createdAt: c.createdAt ?? "",
        // Preserve the full backend quota snapshot (windows.fiveHour /
        // windows.sevenDay) so resolveQuota() can render the selected window.
        quota: (c.quota as any) ?? { used: 0, limit: 0, unit: "tokens" as const, renewsAt: "" },
        lastRefreshedAt: c.quota?.lastSyncAt ?? c.lastRefreshedAt ?? "",
        siteUrl: c.site?.url ?? "",
        siteId: c.siteId,
        projectId: c.projectId ?? "",
        useSystemProxy: Boolean(c.useSystemProxy),
        proxyUrl: c.proxyUrl ?? null,
        routeUnitIds: c.routeUnit ? [String(c.routeUnit.id)] : [],
        scopes: [],
      }));
      setRouteUnits(collectRouteUnits(data.connections ?? []));
      setLiveProviders(providers as typeof OAUTH_PROVIDERS);
      setLiveConnections(connections as typeof OAUTH_CONNECTIONS);
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : 'error');
    } finally {
      setOauthLoaded(true);
    }
  };

  useEffect(() => { reload(); }, []);

  // Resolved sources: in API mode use live API data (even when empty — never
  // fall back to fake rows); in prototype mode use the snapshot data.
  const OAUTH_PROVIDERS_SRC = DATA_MODE === "prototype" ? OAUTH_PROVIDERS : (liveProviders ?? []).map(provider => ({ ...provider, statusLabel: t((provider as any).enabled === false ? 'ui.oauth.status_disabled' : 'ui.oauth.status_available') }));
  const OAUTH_CONNECTIONS_SRC = DATA_MODE === "prototype" ? OAUTH_CONNECTIONS : (liveConnections ?? []).map(connection => ({ ...connection, statusLabel: connection.status === 'active' || connection.status === 'attention' ? text(connection.status) : t(`ui.status.${connection.status}`) }));

  // Route units: in API mode start empty (backend route units come from the
  // oauth route-unit endpoints, which we do not list yet); in prototype mode
  // seed with the snapshot units, then user-created ones.
  const allRouteUnits: RouteUnitDraft[] = [
    ...(DATA_MODE === "prototype"
      ? OAUTH_ROUTE_UNITS.map((ru) => ({
        id: ru.id,
        name: ru.name,
        modelFamily: ru.modelFamily,
        region: ru.region,
        strategy: "round_robin" as const,
        status: ru.status,
        statusLabel: ru.statusLabel,
        memberConnectionIds: [ru.connectionId],
        requestsPerMinute: ru.requestsPerMinute,
        dailyUsed: ru.dailyQuota.used,
        dailyLimit: ru.dailyQuota.limit,
      }))
      : []),
    ...routeUnits,
  ];

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mergeSelectedIntoRouteUnit = async () => {
    if (selectedIds.size < 2) {
      flash({ key: "ui.oauth.merge_need_two" });
      return;
    }
    // Only numeric ids map to real backend account ids; prototype string ids
    // ("conn-…") cannot be merged server-side.
    const numericIds = Array.from(selectedIds)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (numericIds.length < 2) {
      flash({ key: "ui.oauth.merge_need_two" });
      return;
    }
    try {
      await oauthApi.createUnit({ accountIds: numericIds, name: `${text('pool')} (${numericIds.length})`, strategy: "round_robin" });
      flash({ key: "ui.oauth.batch_merged", params: { n: numericIds.length } });
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : { key: "ui.oauth.merge_failed" });
    }
  };

  const splitRouteUnit = async (id: string) => {
    try {
      const numericId = Number(id);
      if (Number.isFinite(numericId) && numericId > 0) {
        await deleteOAuthRouteUnit(numericId);
      }
      setRouteUnits((prev) => prev.filter((ru) => ru.id !== id));
      flash({ key: "ui.oauth.ru_split_ok" });
      await reload();
    } catch (err) {
      flash(err instanceof Error ? err.message : { key: "ui.oauth.split_failed" });
    }
  };

  const connections = useMemo(
    () =>
      buildOAuthConnectionViewModels(
        OAUTH_CONNECTIONS_SRC,
        OAUTH_PROVIDERS_SRC,
        DATA_MODE === 'prototype' ? OAUTH_ROUTE_UNITS : [],
        filters,
      ).map(connection => DATA_MODE === 'prototype' ? connection : ({ ...connection, routeUnits: allRouteUnits.filter(unit => unit.memberConnectionIds.includes(connection.id)) })),
    [filters, OAUTH_CONNECTIONS_SRC, OAUTH_PROVIDERS_SRC, allRouteUnits],
  );

  const summary = useMemo(() => {
    const active = OAUTH_CONNECTIONS_SRC.filter((c) => c.status === "active").length;
    const attention = OAUTH_CONNECTIONS_SRC.filter((c) => c.status === "attention").length;
    const providers = OAUTH_PROVIDERS_SRC.filter((p) => p.status === "connected").length;
    const routeUnits = allRouteUnits.length;
    return { active, attention, providers, routeUnits };
  }, [OAUTH_CONNECTIONS_SRC, OAUTH_PROVIDERS_SRC, allRouteUnits]);

  const flash = (message: OAuthFeedback) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.oauth.eyebrow")}
        title={t("ui.oauth.title")}
        description={t("ui.oauth.desc")}
        actions={
          <>
            <button
              type="button"
              onClick={() => setDrawer({ mode: "import" })}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]"
            >
              {t("ui.oauth.import")}
            </button>
            <button
              type="button"
              onClick={() => setDrawer({ mode: "create" })}
              className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
            >
              {t("ui.oauth.connect")}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.oauth.provider_count")}
          value={summary.providers}
          detail={t("ui.oauth.provider_count_detail", { total: OAUTH_PROVIDERS_SRC.length })}
          icon={<ShieldCheck size={16} />}
        />
        <StatCard
          label={t("ui.oauth.active_connections")}
          value={summary.active}
          detail={t("ui.oauth.active_detail", { n: summary.attention })}
          trend={{ label: t("ui.oauth.refreshing"), tone: "lime" }}
          icon={<Users size={16} />}
        />
        <StatCard
          label={t("ui.oauth.route_unit_count")}
          value={summary.routeUnits}
          detail={t("ui.oauth.healthy_count", { n: allRouteUnits.filter((r) => r.status === "healthy").length })}
          icon={<Server size={16} />}
        />
        <StatCard
          label={t("ui.oauth.quota_headroom")}
          value={`${byteCount(OAUTH_CONNECTIONS_SRC.reduce((acc, c) => acc + (c.quota.limit - c.quota.used), 0), "tokens")}M`}
          detail={t("ui.oauth.quota_detail")}
          trend={{ label: t("ui.oauth.quota_stable"), tone: "cyan" }}
          icon={<KeyRound size={16} />}
        />
      </div>

      {loadError && <p role="alert">{loadError === 'error' ? text('error') : loadError}</p>}
      {feedback && (
        <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">
          {typeof feedback === 'string' ? feedback : t(feedback.key, feedback.params)}
        </div>
      )}

      {/* Providers */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.oauth.providers")}
          description={t("ui.oauth.providers_desc")}
          eyebrow={t("ui.oauth.providers")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {OAUTH_PROVIDERS_SRC.map((provider) => {
            const tone = PROVIDER_STATUS_TONES[provider.status];
            return (
              <div key={provider.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--color-border-bright)]" />
                  </div>
                  <span className={`chip chip-${tone}`}>{provider.statusLabel}</span>
                </div>
                <h3 className="mt-3 font-display text-2xl tracking-tight">{provider.name}</h3>
                <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">
                  {provider.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider uppercase text-[color:var(--color-muted)]">
                    {provider.authorizationType}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDrawer({ mode: "create", providerId: provider.id })}
                    disabled={provider.status === "maintenance"}
                    className="text-xs font-mono tracking-wider text-[color:var(--color-lime)] hover:underline disabled:text-[color:var(--color-muted)]"
                  >
                    {OAUTH_CONNECTIONS_SRC.some((c) => c.providerId === provider.id)
                      ? t("ui.oauth.manage_btn")
                      : t("ui.oauth.connect_btn")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Connections */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.oauth.connections")}
          description={t("ui.oauth.connections_desc")}
          eyebrow={t("ui.oauth.connections")}
          actions={
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {(["fiveHour", "sevenDay"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setQuotaWindow(w)}
                    className={`rounded-lg border px-2 py-1 font-mono text-[10px] tracking-wider ${
                      quotaWindow === w
                        ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                        : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
                    }`}
                  >
                    {w === "fiveHour" ? "5H" : "7D"}
                  </button>
                ))}
              </div>
              <span className="chip chip-lime">
                {connections.length} / {OAUTH_CONNECTIONS_SRC.length}
              </span>
            </div>
          }
        />
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3">
            <span className="chip chip-lime">{t("ui.oauth.selected_count", { n: selectedIds.size })}</span>
            <button
              type="button"
              onClick={() => {
                flash({ key: "ui.oauth.batch_refreshed", params: { n: selectedIds.size } });
                setSelectedIds(new Set());
              }}
              className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            >
              {t("ui.oauth.batch_refresh")}
            </button>
            <button
              type="button"
              onClick={() => mergeSelectedIntoRouteUnit()}
              className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            >
              {t("ui.oauth.batch_merge")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10"
            >
              {t("ui.oauth.batch_clear")}
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3 sm:flex-row sm:items-center">
          <SearchField
            label={t("ui.oauth.search_ph")}
            placeholder={t("ui.oauth.search_ph")}
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            className="flex-1"
          />
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label={t("ui.oauth.filter_provider")}
              value={filters.providerId}
              onChange={(e) => setFilters({ ...filters, providerId: e.target.value })}
              className="h-9 w-auto text-xs"
            >
              <option value="all">{t("ui.oauth.all_providers")}</option>
              {OAUTH_PROVIDERS_SRC.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t("ui.oauth.filter_status")}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as "all" | OAuthConnectionStatus })}
              className="h-9 w-auto text-xs"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? t("ui.oauth.all_statuses") : status}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {connections.length === 0 ? (
          <EmptyState
            title={t("ui.oauth.empty_title")}
            description={t("ui.oauth.empty_desc")}
            icon={<Users size={18} />}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="card hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="w-8 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={t("ui.oauth.select_all_connections")}
                          checked={connections.length > 0 && connections.every((c) => selectedIds.has(c.id))}
                          onChange={() => {
                            const allSelected = connections.every((c) => selectedIds.has(c.id));
                            setSelectedIds(allSelected ? new Set() : new Set(connections.map((c) => c.id)));
                          }}
                          className="accent-[color:var(--color-lime)]"
                        />
                      </th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.oauth.account")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.oauth.provider")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.oauth.status")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.oauth.quota")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.oauth.route_units_col")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.oauth.last_refresh")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((connection) => (
                      <tr key={connection.id} className={`border-b border-[color:var(--color-border)]/60 last:border-0 ${selectedIds.has(connection.id) ? "bg-[color:var(--color-lime)]/5" : ""}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${connection.accountName}`}
                            checked={selectedIds.has(connection.id)}
                            onChange={() => toggleSelected(connection.id)}
                            className="accent-[color:var(--color-lime)]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[color:var(--color-fg)]">{connection.accountName}</div>
                          <div className="text-xs text-[color:var(--color-muted)]">{connection.accountEmail}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="chip chip-cyan">{connection.providerName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`chip chip-${STATUS_TONES[connection.status]}`}>
                            {connection.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-36">
                            <ProgressBar
                              label={resolveQuota(connection).unit}
                              value={resolveQuota(connection).percent}
                              valueLabel={resolveQuota(connection).text}
                              tone={resolveQuota(connection).percent >= 90 ? "rose" : resolveQuota(connection).percent >= 70 ? "amber" : "lime"}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {connection.routeUnits.length === 0 ? (
                              <span className="text-xs text-[color:var(--color-muted)]">—</span>
                            ) : (
                              connection.routeUnits.map((routeUnit) => (
                                <span
                                  key={routeUnit.id}
                                  className={`rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)]`}
                                >
                                  {routeUnit.name}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-muted)]">
                          {connection.lastRefreshedAt ? new Date(connection.lastRefreshedAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                const accountId = Number(connection.id);
                                try {
                                  if (Number.isFinite(accountId) && accountId > 0) {
                                    await refreshOAuthConnectionQuota(accountId);
                                  }
                                  setRefreshKey((k) => k + 1);
                                  flash({ key: "ui.oauth.quota_refresh_ok", params: { name: connection.accountName } });
                                  await reload();
                                } catch (err) {
                                  flash(err instanceof Error ? err.message : { key: "ui.oauth.quota_refresh_failed" });
                                }
                              }}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                            >
                              {t("ui.oauth.quota_refresh")}
                            </button>
                            <button
                              type="button"
                              disabled={DATA_MODE === 'prototype'} onClick={() => setModelsAccount({ id: Number(connection.id), name: connection.accountName })}
                              className="rounded-md border px-2 py-1 text-xs"
                            >{text('models')}</button>
                            <button type="button"
                              onClick={() => setDrawer({ mode: "rebind", connectionId: connection.id })}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                            >
                              {t("ui.oauth.rebind")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDrawer({ mode: "proxy", connectionId: connection.id })}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                            >
                              {t("ui.oauth.proxy")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 lg:hidden">
              {connections.map((connection) => (
                <div key={connection.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[color:var(--color-fg)]">{connection.accountName}</div>
                      <div className="text-xs text-[color:var(--color-muted)]">{connection.accountEmail}</div>
                    </div>
                    <span className={`chip chip-${STATUS_TONES[connection.status]}`}>
                      {connection.statusLabel}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="chip chip-cyan">{connection.providerName}</span>
                    <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                      {connection.routeUnits.length} route units
                    </span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar
                      label={resolveQuota(connection).unit}
                      value={resolveQuota(connection).percent}
                      valueLabel={resolveQuota(connection).text}
                      tone={resolveQuota(connection).percent >= 90 ? "rose" : resolveQuota(connection).percent >= 70 ? "amber" : "lime"}
                    />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const accountId = Number(connection.id);
                        try {
                          if (Number.isFinite(accountId) && accountId > 0) {
                            await refreshOAuthConnectionQuota(accountId);
                          }
                          setRefreshKey((k) => k + 1);
                          flash({ key: "ui.oauth.quota_refresh_ok", params: { name: connection.accountName } });
                          await reload();
                        } catch (err) {
                          flash(err instanceof Error ? err.message : { key: "ui.oauth.quota_refresh_failed" });
                        }
                      }}
                      className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {t("ui.oauth.quota_refresh")}
                    </button>
                    <button
                      type="button"
                      disabled={DATA_MODE === 'prototype'} onClick={() => setModelsAccount({ id: Number(connection.id), name: connection.accountName })}
                      className="rounded-md border px-2 py-1 text-xs"
                    >{text('models')}</button>
                    <button type="button" onClick={() => setDrawer({ mode: "rebind", connectionId: connection.id })}
                      className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {t('ui.oauth.rebind')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawer({ mode: "proxy", connectionId: connection.id })}
                      className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {t('ui.oauth.proxy')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Route units */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.oauth.route_units")}
          description={t("ui.oauth.route_units_desc")}
          eyebrow={t("ui.oauth.route_units")}
          actions={
            <div className="flex items-center gap-2">
              <span className="chip chip-cyan">
                {t("ui.common.total", { n: allRouteUnits.length })}
              </span>
              <button
                type="button"
                onClick={() => { setEditingUnit(null); setDrawer({ mode: "route-unit" }); }}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-3 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
              >
                <span className="text-xs leading-none">+</span> {t("ui.oauth.new_route_unit")}
              </button>
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {allRouteUnits.map((routeUnit) => {
            const percent = Math.min(100, Math.round((routeUnit.dailyUsed / (routeUnit.dailyLimit || 1)) * 100));
            const tone = ROUTE_STATUS_TONES[routeUnit.status] ?? "muted";
            const memberConnection = OAUTH_CONNECTIONS_SRC.find((c) => routeUnit.memberConnectionIds.includes(c.id));
            return (
              <div key={routeUnit.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl tracking-tight">{routeUnit.name}</h3>
                    <div className="mt-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] uppercase">
                      {routeUnit.modelFamily} · {routeUnit.region} · {routeUnit.strategy === "stick_until_unavailable" ? t('ui.oauth.ru_sticky') : t('ui.oauth.ru_round_robin')}
                    </div>
                  </div>
                  <span className={`chip chip-${tone}`}>{routeUnit.statusLabel || t('ui.oauth.status_unknown')}</span>
                </div>
                {DATA_MODE === 'prototype' && <div className="mt-4">
                  <ProgressBar
                    label={t("ui.oauth.daily_requests")}
                    value={percent}
                    valueLabel={`${Math.round(routeUnit.dailyUsed)} / ${Math.round(routeUnit.dailyLimit)}`}
                    tone={percent >= 90 ? "rose" : percent >= 70 ? "amber" : "lime"}
                  />
                </div>}
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                    {DATA_MODE === 'prototype' ? `${routeUnit.requestsPerMinute} req/min` : t('ui.oauth.selected_count', { n: routeUnit.memberConnectionIds.length })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                      {memberConnection?.accountName ?? t("ui.oauth.status_unattached")}
                    </span>
                    {DATA_MODE === 'api' && <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => { setEditingUnit(routeUnit); setDrawer({ mode: 'route-unit' }); }}>{text('edit')}</button>}
                    {DATA_MODE === "api" && (
                      <button
                        type="button"
                        onClick={() => splitRouteUnit(routeUnit.id)}
                        className="rounded-md border border-[color:var(--color-border)] px-2 py-0.5 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                      >
                        {t("ui.oauth.ru_split")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {modelsAccount && <OAuthModelsDrawer accountId={modelsAccount.id} name={modelsAccount.name} onClose={() => setModelsAccount(null)} onRefresh={reload} />}
      {drawer?.mode === "route-unit" && (
        <RouteUnitDrawer
          onClose={() => setDrawer(null)}
          onFlash={flash}
          connections={OAUTH_CONNECTIONS_SRC}
          unit={editingUnit}
          onCreate={() => { void reload(); }}
        />
      )}
      {drawer && drawer.mode !== "route-unit" && (
        <ConnectionDrawer
          key={drawer.mode === "create" || drawer.mode === "import" ? drawer.mode : drawer.connectionId}
          intent={drawer}
          providers={OAUTH_PROVIDERS_SRC}
          connections={OAUTH_CONNECTIONS_SRC}
          onReload={reload}
          onClose={() => setDrawer(null)}
          onFlash={flash}
        />
      )}
    </div>
  );
}

function ConnectionDrawer({
  intent,
  onClose,
  onFlash,
  providers,
  connections,
  onReload,
}: {
  intent: DrawerIntent;
  providers: typeof OAUTH_PROVIDERS;
  connections: typeof OAUTH_CONNECTIONS;
  onReload: () => Promise<void>;
  onClose: () => void;
  onFlash: (message: string) => void;
}) {
  const t = useUiText();
  const text = useOAuthText();
  const [providerId, setProviderId] = useState(intent.mode === 'create' ? intent.providerId ?? '' : '');
  const [session, setSession] = useState<AuthorizationSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const connection =
    intent.mode === "rebind" || intent.mode === "proxy"
      ? connections.find((c) => c.id === intent.connectionId)
      : undefined;

  const [projectId, setProjectId] = useState<string>(connection?.projectId ?? "");
  const [proxyMode, setProxyMode] = useState<"system" | "custom" | "none">(
    connection?.useSystemProxy ? "system" : connection?.proxyUrl ? "custom" : "none",
  );
  const [proxyUrl, setProxyUrl] = useState<string>(connection?.proxyUrl ?? "");
  const [importText, setImportText] = useState<string>("");
  const [importFiles, setImportFiles] = useState<{ name: string; data: Record<string, unknown> | null }[]>([]);
  const importPreview = useMemo(() => {
    if (importFiles.length) return importFiles.map(file => ({ providerLabel: String(file.data?.type ?? ''), email: file.name, valid: file.data !== null }));
    if (!importText.trim()) return [];
    try {
      const data = parseNativeOAuthJson(importText);
      return [{ providerLabel: String(data.type ?? data.provider ?? ''), email: String(data.email ?? data.account_id ?? ''), valid: true }];
    } catch { return [{ providerLabel: '', email: '', valid: false }]; }
  }, [importText, importFiles]);

  const titles: Record<DrawerIntent["mode"], string> = {
    create: t("ui.oauth.create_drawer"),
    rebind: t("ui.oauth.rebind_drawer"),
    proxy: t("ui.oauth.proxy_drawer"),
    import: t("ui.oauth.import_drawer"),
    "route-unit": t("ui.oauth.ru_create_drawer"),
  };
  const eyebrows: Record<DrawerIntent["mode"], string> = {
    create: t("ui.oauth.create_eyebrow"),
    rebind: t("ui.oauth.rebind_eyebrow"),
    proxy: t("ui.oauth.proxy_eyebrow"),
    import: t("ui.oauth.import_eyebrow"),
    "route-unit": t("ui.oauth.ru_create_eyebrow"),
  };

  if (session) return <AuthorizationPanel session={session} onClose={onClose} onComplete={onReload} />;
  return (
    <EditDrawer
      open
      onClose={onClose}
      title={titles[intent.mode]}
      eyebrow={eyebrows[intent.mode]}
      subtitle={
        intent.mode === "rebind" || intent.mode === "proxy"
          ? connection?.accountEmail
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            {t("ui.common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || (proxyMode === 'custom' && !proxyUrl.trim()) || (intent.mode === 'create' && !providerId) || (intent.mode === 'import' && (importPreview.length === 0 || importPreview.some(item => !item.valid)))}
            onClick={async () => {
              setBusy(true); setError(null);
              const connectionId = connection ? Number(connection.id) : NaN;
              const proxyPayload = {
                proxyUrl: proxyMode === "custom" ? proxyUrl.trim() : null,
                useSystemProxy: proxyMode === "system",
              };
              try {
                if (DATA_MODE === 'prototype') { setError('prototype'); return; }
                if (intent.mode === "create") {
                  const result = await oauthApi.start(providerId, { projectId: projectId.trim() || undefined, ...proxyPayload });
                  if (!result.state) throw new Error('error');
                  setSession(result);
                } else if (intent.mode === "import") {
                  const result = importFiles.length
                    ? await oauthApi.importBatch(importFiles.map(file => file.data!), proxyPayload)
                    : await oauthApi.import(parseNativeOAuthJson(importText), proxyPayload);
                  setImportResult(result);
                  await onReload();
                } else if (intent.mode === "rebind" && Number.isFinite(connectionId)) {
                  const result = await oauthApi.rebind(connectionId, proxyPayload);
                  if (!result.state) throw new Error('error');
                  setSession(result);
                } else if (intent.mode === "proxy" && Number.isFinite(connectionId)) {
                  await updateOAuthConnectionProxy(connectionId, proxyPayload);
                  await onReload();
                  onClose();
                } else { setError('error'); }
              } catch (err) {
                setError(err instanceof Error ? err.message : 'error');
              } finally { setBusy(false); }
            }}
            className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            {intent.mode === "rebind" ? t("ui.oauth.rebind_session") : intent.mode === "import" ? t("ui.oauth.import_apply") : t("ui.oauth.continue")}
          </button>
        </>
      }
    >
      {error && <p role="alert">{error === 'prototype' ? text('prototype') : error === 'error' ? text('error') : error}</p>}
      {importResult && <div role="status"><p>{text('imported')}: {importResult.imported} · {text('skipped')}: {importResult.skipped} · {text('failures')}: {importResult.failed}</p>{importResult.items?.map((item: any, i: number) => <p key={i}>{item.name} · {item.status === 'failed' ? text('failures') : item.status === 'skipped' ? text('skipped') : text('imported')}{item.message ? ` · ${item.message}` : ''}</p>)}</div>}
      {intent.mode === "create" && (
        <>
          <Field label={t("ui.oauth.provider_field")}>
            <Select value={providerId} onChange={e => setProviderId(e.target.value)}>
              <option value="" disabled>
                {t("ui.oauth.choose_provider")}
              </option>
              {providers.map((provider) => (
                <option disabled={(provider as any).enabled === false} key={provider.id} value={provider.id}>
                  {provider.name} — {provider.authorizationType}
                </option>
              ))}
            </Select>
          </Field>
          {intent.mode === 'create' && <Field label={t("ui.oauth.project_id")}>
            <TextInput
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder={t("ui.oauth.project_id_ph")}
            />
          </Field>}
          <ProxyFields
            t={t}
            proxyMode={proxyMode}
            setProxyMode={setProxyMode}
            proxyUrl={proxyUrl}
            setProxyUrl={setProxyUrl}
          />
          <Field label={t("ui.oauth.flow_label")}>
            <p className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-3 text-xs leading-5 text-[color:var(--color-muted)]">
              {text('flow')}
            </p>
          </Field>
        </>
      )}
      {intent.mode === "import" && (
        <>
          <Field label={text('files')}>
            <input type="file" multiple accept=".json,application/json" disabled={busy} onChange={async e => {
              const files = Array.from(e.target.files ?? []);
              setBusy(true); setImportText(''); setImportResult(null); setError(null);
              try {
                const parsed = await Promise.all(files.map(async file => {
                  try { return { name: file.name, data: parseNativeOAuthJson(await file.text()) }; }
                  catch { return { name: file.name, data: null }; }
                }));
                setImportFiles(parsed);
              } finally { setBusy(false); }
            }} />
          </Field>
          <Field label={text('native')}>
            <textarea
              rows={8}
              value={importText}
              disabled={busy}
              onChange={(e) => { setImportText(e.target.value); setImportFiles([]); setImportResult(null); setError(null); }}
              placeholder={'{"type":"codex","access_token":"…","refresh_token":"…"}'}
              className="w-full resize-none rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg)] placeholder:text-[color:var(--color-muted)] outline-none focus:border-[color:var(--color-lime)]/50"
            />
          </Field>
          {importPreview.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-[color:var(--color-border)]">
              <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/60 px-3 py-2 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
                {t("ui.oauth.import_preview_title", { n: importPreview.length })}
              </div>
              <div className="max-h-48 divide-y divide-[color:var(--color-border)]/50 overflow-y-auto">
                {importPreview.map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[color:var(--color-fg)]">{item.email}</div>
                      <div className="font-mono text-[10px] text-[color:var(--color-muted)]">{item.providerLabel}</div>
                    </div>
                    {item.valid ? (
                      <span className="chip chip-lime">{t("ui.oauth.import_ok_label")}</span>
                    ) : (
                      <span className="chip chip-rose">{text('invalid')}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {intent.mode === 'import' && <ProxyFields t={t} proxyMode={proxyMode} setProxyMode={setProxyMode} proxyUrl={proxyUrl} setProxyUrl={setProxyUrl} />}
      {(intent.mode === "rebind" || intent.mode === "proxy") && connection && (
        <>
          <Field label={t("ui.oauth.account_field")}>
            <TextInput readOnly value={connection.accountEmail} />
          </Field>
          <ProxyFields
            t={t}
            proxyMode={proxyMode}
            setProxyMode={setProxyMode}
            proxyUrl={proxyUrl}
            setProxyUrl={setProxyUrl}
          />
          <Field label={intent.mode === "rebind" ? t("ui.oauth.reauth_field") : t("ui.oauth.proxy_field")}>
            <p className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-3 text-xs leading-5 text-[color:var(--color-muted)]">
              {intent.mode === "rebind"
                ? t("ui.oauth.reauth_explain")
                : t("ui.oauth.proxy_explain")}
            </p>
          </Field>
        </>
      )}
      {connection && (
        <Field label={t("ui.oauth.route_units_field")}>
          <div className="flex flex-wrap gap-1.5">
            {connection.routeUnitIds.length === 0 ? (
              <span className="text-xs text-[color:var(--color-muted)]">{t("ui.oauth.none_attached")}</span>
            ) : (
              connection.routeUnitIds.map((id) => (
                <span
                  key={id}
                  className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]"
                >
                  {OAUTH_ROUTE_UNITS.find((r) => r.id === id)?.name ?? id}
                </span>
              ))
            )}
          </div>
        </Field>
      )}
    </EditDrawer>
  );
}

function ProxyFields({
  t,
  proxyMode,
  setProxyMode,
  proxyUrl,
  setProxyUrl,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  proxyMode: "system" | "custom" | "none";
  setProxyMode: (mode: "system" | "custom" | "none") => void;
  proxyUrl: string;
  setProxyUrl: (url: string) => void;
}) {
  const modes: { value: "system" | "custom" | "none"; label: string }[] = [
    { value: "none", label: t("ui.oauth.proxy_off") },
    { value: "system", label: t("ui.oauth.proxy_system") },
    { value: "custom", label: t("ui.oauth.proxy_custom") },
  ];

  return (
    <Field label={t("ui.oauth.proxy_mode")}>
      <div className="flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={proxyMode === m.value}
            onClick={() => setProxyMode(m.value)}
            className={`rounded border px-2.5 py-1.5 font-mono text-[10px] tracking-wider ${
              proxyMode === m.value
                ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {proxyMode === "custom" && (
        <div className="mt-2">
          <TextInput
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder={t("ui.oauth.proxy_url_ph")}
          />
        </div>
      )}
      {proxyMode === "system" && (
        <p className="mt-2 text-xs text-[color:var(--color-muted)]">
          {t("ui.oauth.proxy_system")}
        </p>
      )}
    </Field>
  );
}

function RouteUnitDrawer({
  onClose,
  onFlash,
  onCreate,
  connections,
  unit,
}: {
  unit: RouteUnitDraft | null;
  connections: typeof OAUTH_CONNECTIONS;
  onClose: () => void;
  onFlash: (msg: OAuthFeedback) => void;
  onCreate: () => void;
}) {
  const t = useUiText();
  const text = useOAuthText();
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(unit?.name ?? "");
  const [strategy, setStrategy] = useState<"round_robin" | "stick_until_unavailable">(unit?.strategy ?? "round_robin");

  return (
    <EditDrawer
      open
      onClose={onClose}
      title={unit ? text('edit') : t("ui.oauth.ru_create_drawer")}
      eyebrow={t("ui.oauth.ru_create_eyebrow")}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            {t("ui.common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || DATA_MODE === 'prototype' || !name.trim() || (!unit && memberIds.length < 2)}
            onClick={async () => {
              setBusy(true);
              try {
                if (unit) await oauthApi.updateUnit(Number(unit.id), { name: name.trim(), strategy });
                else await oauthApi.createUnit({ accountIds: memberIds.map(Number), name: name.trim(), strategy });
                onCreate();
                onFlash({ key: "ui.oauth.ru_created" });
                onClose();
              } catch (err) {
                onFlash(err instanceof Error ? err.message : { key: "ui.oauth.create_failed" });
              } finally { setBusy(false); }
            }}
            className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
          >
            {t("ui.common.save")}
          </button>
        </>
      }
    >
      {!unit && <Field label={t('ui.oauth.connections')}>
        {connections.filter(connection => Number.isInteger(Number(connection.id)) && !connection.routeUnitIds.length).map(connection => {
          const first = connections.find(candidate => candidate.id === memberIds[0]);
          const incompatible = first && (first.providerId !== connection.providerId || first.siteUrl !== connection.siteUrl);
          return <label key={connection.id} className="flex gap-2 py-2 text-sm"><input type="checkbox" checked={memberIds.includes(connection.id)} disabled={Boolean(incompatible)} onChange={e => setMemberIds(ids => e.target.checked ? [...ids, connection.id] : ids.filter(id => id !== connection.id))} />{connection.accountEmail} · {connection.providerId}</label>;
        })}
        <p className="text-xs">{t('ui.oauth.merge_need_two')}</p>
      </Field>}
      <Field label={t("ui.oauth.ru_name")}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ui.oauth.ru_name_ph")} />
      </Field>
      <Field label={t("ui.oauth.ru_strategy")}>
        <div className="flex flex-wrap gap-1.5">
          {(["round_robin", "stick_until_unavailable"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={strategy === s}
              onClick={() => setStrategy(s)}
              className={`rounded border px-2.5 py-1.5 font-mono text-[10px] tracking-wider ${
                strategy === s
                  ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                  : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
              }`}
            >
              {s === "round_robin" ? t("ui.oauth.ru_round_robin") : t("ui.oauth.ru_sticky")}
            </button>
          ))}
        </div>
      </Field>
    </EditDrawer>
  );
}