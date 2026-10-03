import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";import { KeyRound, Plus, RefreshCw, Tags, TrendingUp, Zap } from "lucide-react";
import { DOWNSTREAM_KEYS as PROTOTYPE_KEYS, DOWNSTREAM_TREND_POINTS, MODELS } from "../data/prototype";
import {
  buildDownstreamKeyViewModels,
  downstreamKeyGroup,
  type DownstreamKeyFilters,
} from "./managementViewModels";
import PageHeader from "../components/PageHeader";
import Sparkline from "../components/Sparkline";
import {
  EmptyState,
  ProgressBar,
  SearchField,
  SectionTitle,
  StatCard,
} from "../components/PrototypeUI";
import { EditDrawer, Field, Select, TextInput, TextArea, Toggle } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import {
  DATA_MODE,
  createDownstreamApiKey,
  updateDownstreamApiKey,
  deleteDownstreamApiKey,
  resetDownstreamApiKeyUsage,
  batchDownstreamApiKeys,
  fetchDownstreamKeys,
  fetchModelsMarketplace,
  fetchRoutes,
  fetchSites,
  fetchDownstreamKeysSummary,
  fetchDownstreamKeyTrend,
} from "../lib/source";

/** Prototype model options drawn from the marketplace catalog. */
const MODEL_OPTIONS = MODELS.map((m) => ({ name: m.name, family: m.family }));

// Backend downstream key row (policy view).
interface BackendDownstreamKey {
  id: number;
  name: string;
  key: string;
  keyMasked?: string;
  description: string | null;
  groupName: string | null;
  tags: string[];
  enabled: boolean;
  expiresAt: string | null;
  maxCost: number | null;
  usedCost: number;
  maxRequests: number | null;
  usedRequests: number;
  supportedModels: string[];
  allowedRouteIds: number[];
  siteWeightMultipliers: Record<string, number>;
  excludedSiteIds: number[];
  lastUsedAt: string | null;
  createdAt: string;
}

/** Map a backend policy row to the UI DownstreamKey display shape. */
function mapBackendKey(raw: BackendDownstreamKey): (typeof PROTOTYPE_KEYS)[number] {
  const status = !raw.enabled ? "paused" as const
    : raw.expiresAt && new Date(raw.expiresAt) < new Date() ? "expired" as const
    : "active" as const;
  const fullToken = raw.key ?? `${raw.keyMasked ?? "sk-…"}`;
  return {
    id: String(raw.id),
    name: raw.name,
    tokenPrefix: raw.keyMasked ?? fullToken.slice(0, 6),
    fullToken,
    groupName: raw.groupName ?? "",
    tags: raw.tags ?? [],
    description: raw.description ?? "",
    expiresAt: raw.expiresAt,
    maxCost: raw.maxCost,
    maxRequests: raw.maxRequests,
    usedCost: raw.usedCost ?? 0,
    supportedModels: raw.supportedModels ?? [],
    selectedGroupRoutes: (raw.allowedRouteIds ?? []).map(String),
    siteWeightMultipliers: raw.siteWeightMultipliers ?? {},
    excludedSiteIds: raw.excludedSiteIds ?? [],
    status,
    statusLabel: status === "active" ? "Active" : status === "paused" ? "Paused" : "Expired",
    // Scopes are not a real downstream-key field; leave empty so the card
    // shows only real policy data (tags / model whitelist).
    scopes: [],
    createdAt: raw.createdAt,
    lastUsedAt: raw.lastUsedAt,
    requestQuota: {
      used: raw.usedRequests ?? 0,
      limit: raw.maxRequests ?? 0,
      unit: "requests",
      renewsAt: "",
    },
    requestsToday: raw.usedRequests ?? 0,
  };
}

export default function DownstreamKeys() {
  const t = useUiText();
  const [filters, setFilters] = useState<DownstreamKeyFilters>({
    query: "",
    group: "all",
    status: "all",
  });
  const [usageOverrides, setUsageOverrides] = useState<Record<string, number>>({});
  const [drawer, setDrawer] = useState<"create" | { id: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | "batch" | null>(null);
  const [apiKeys, setApiKeys] = useState<typeof PROTOTYPE_KEYS | null>(null);
  const { showToast } = useToast();

  // Load keys from the real backend; fall back to prototype data in
  // prototype mode. Never silently show fake rows when the API errors.
  const reload = useCallback(async () => {
    if (DATA_MODE === "prototype") {
      setApiKeys([...PROTOTYPE_KEYS]);
      return;
    }
    try {
      const { items } = await fetchDownstreamKeys();
      setApiKeys((items as BackendDownstreamKey[]).map(mapBackendKey));
    } catch (err) {
      setApiKeys([]);
      showToast(err instanceof Error ? err.message : "Failed to load keys.");
    }
  }, [showToast]);

  useEffect(() => { reload(); }, [reload]);

  const keysSource = apiKeys ?? [];

  const copyKey = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      showToast(t("ui.keys.copied"));
    } catch {
      showToast(t("ui.keys.copy_failed"));
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchEnable = async (enabled: boolean) => {
    try {
      await batchDownstreamApiKeys({
        ids: Array.from(selectedIds).map(Number),
        action: enabled ? "enable" : "disable",
      });
      showToast(enabled ? t("ui.keys.batch_enabled", { n: selectedIds.size }) : t("ui.keys.batch_disabled", { n: selectedIds.size }));
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Batch update failed.");
    }
  };

  const batchReset = async () => {
    try {
      await batchDownstreamApiKeys({
        ids: Array.from(selectedIds).map(Number),
        action: "resetUsage",
      });
      const next: Record<string, number> = { ...usageOverrides };
      selectedIds.forEach((id) => { next[id] = 0; });
      setUsageOverrides(next);
      showToast(t("ui.keys.reset_ok"));
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Batch reset failed.");
    }
  };

  const batchDelete = async () => {
    try {
      await batchDownstreamApiKeys({
        ids: Array.from(selectedIds).map(Number),
        action: "delete",
      });
      showToast(t("ui.keys.deleted", { n: selectedIds.size }));
      setDeleteTarget(null);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Batch delete failed.");
    }
  };

  const keys = useMemo(
    () => buildDownstreamKeyViewModels(keysSource, filters, usageOverrides),
    [keysSource, filters, usageOverrides],
  );

  const summary = useMemo(() => {
    const active = keysSource.filter((k) => k.status === "active").length;
    const totalRequests = keysSource.reduce((acc, k) => acc + k.requestsToday, 0);
    return { active, totalRequests };
  }, [keysSource]);

  // Group list derived from the loaded keys (empty when there are no keys).
  const allGroups = useMemo(
    () => [...new Set(keysSource.map((k) => downstreamKeyGroup(k)))],
    [keysSource],
  );

  // Real usage summary + per-key trend. When no keys exist these stay empty
  // (no fake 7-day numbers).
  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendBuckets, setTrendBuckets] = useState<Array<{ startUtc: string | null; totalRequests: number; successRate: number | null }>>([]);
  const [trendRange, setTrendRange] = useState<"24h" | "7d" | "all">("7d");
  const [trendKeyId, setTrendKeyId] = useState<number | null>(null);

  useEffect(() => {
    if (DATA_MODE === "prototype") return;
    fetchDownstreamKeysSummary({ range: trendRange })
      .then((data) => setSummaryData(data))
      .catch(() => setSummaryData(null));
  }, [trendRange]);

  useEffect(() => {
    if (DATA_MODE === "prototype" || trendKeyId == null) { setTrendBuckets([]); return; }
    fetchDownstreamKeyTrend(trendKeyId, { range: trendRange })
      .then((data) => setTrendBuckets(data.buckets))
      .catch(() => setTrendBuckets([]));
  }, [trendKeyId, trendRange]);

  const trendRequests = trendBuckets.map((b) => b.totalRequests);

  const flash = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  };

  const handleResetUsage = async (id: string) => {
    try {
      await resetDownstreamApiKeyUsage(Number(id));
      setUsageOverrides((prev) => ({ ...prev, [id]: 0 }));
      showToast(t("ui.keys.reset_ok"));
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reset failed.");
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateDownstreamApiKey(Number(id), { enabled });
      flash(t("ui.keys.toggle_ok", { id }));
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.keys.eyebrow")}
        title={t("ui.keys.title")}
        description={t("ui.keys.desc")}
        actions={
          <button
            type="button"
            onClick={() => setDrawer("create")}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            <Plus size={12} /> {t("ui.keys.new_key")}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.keys.active_keys")}
          value={summary.active}
          detail={t("ui.keys.active_detail", { total: keysSource.length })}
          icon={<KeyRound size={16} />}
        />
        <StatCard
          label={t("ui.keys.requests_today")}
          value={summary.totalRequests.toLocaleString()}
          trend={summary.totalRequests > 0
            ? { label: "active", tone: "lime" }
            : { label: "no usage", tone: "muted" }}
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label={t("ui.keys.groups")}
          value={allGroups.length}
          detail={allGroups.join(", ")}
          icon={<Tags size={16} />}
        />
        <StatCard
          label={t("ui.keys.seven_day")}
          value={trendRequests[trendRequests.length - 1]?.toLocaleString() ?? "—"}
          detail={t("ui.keys.latest_day")}
          trend={trendRequests.length >= 2
            ? (trendRequests[trendRequests.length - 1] >= trendRequests[0]
              ? { label: "↑ vs start", tone: "lime" }
              : { label: "↓ vs start", tone: "amber" })
            : { label: "no data", tone: "muted" }}
          icon={<Zap size={16} />}
        />
      </div>

      {feedback && (
        <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">
          {feedback}
        </div>
      )}

      {/* Usage trend */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.keys.trend")}
          description={trendKeyId != null ? "Usage for the selected key." : "7-day request volume across all keys."}
          eyebrow={t("ui.keys.trend")}
          actions={
            <div className="flex items-center gap-2">
              <select
                aria-label={t("ui.keys.trend_key")}
                value={trendKeyId ?? ""}
                onChange={(e) => setTrendKeyId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none"
              >
                <option value="">{t("ui.keys.all_keys")}</option>
                {keysSource.map((k) => (
                  <option key={k.id} value={Number(k.id)}>{k.name}</option>
                ))}
              </select>
              <div className="flex gap-1">
                {(["24h", "7d", "all"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTrendRange(r)}
                    className={`h-8 rounded-lg border px-2 font-mono text-[10px] tracking-wider ${
                      trendRange === r
                        ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                        : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          }
        />
        <div className="card p-4">
          {keysSource.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">{t("ui.keys.no_keys_yet")}</p>
          ) : trendKeyId == null ? (
            <p className="text-sm text-[color:var(--color-muted)]">{t("ui.keys.select_key")}</p>
          ) : trendRequests.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">{t("ui.keys.no_usage")}</p>
          ) : (
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {trendBuckets.map((bucket, i) => (
                <div key={i} className="flex min-w-[56px] flex-col items-center gap-2">
                  <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                    {bucket.totalRequests.toLocaleString()}
                  </span>
                  <div
                    className="w-8 rounded-t bg-[color:var(--color-lime)]/60"
                    style={{
                      height: `${Math.max(
                        4,
                        (bucket.totalRequests / Math.max(...trendRequests, 1)) * 64,
                      )}px`,
                    }}
                  />
                  <span className="font-mono text-[9px] text-[color:var(--color-muted)]">
                    {bucket.startUtc ? bucket.startUtc.slice(5, 10) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Keys */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.keys.keys")}
          description={t("ui.keys.keys_desc")}
          eyebrow={t("ui.keys.keys")}
          actions={
            <span className="chip chip-lime">
              {keys.length} / {keysSource.length}
            </span>
          }
        />
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3">
            <span className="chip chip-lime">{t("ui.keys.selected_count", { n: selectedIds.size })}</span>
            <button type="button" onClick={() => batchEnable(true)}
              className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
              {t("ui.keys.batch_enable")}
            </button>
            <button type="button" onClick={() => batchEnable(false)}
              className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
              {t("ui.keys.batch_disable")}
            </button>
            <button type="button" onClick={batchReset}
              className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
              {t("ui.keys.batch_reset")}
            </button>
            <button type="button" onClick={() => setDeleteTarget("batch")}
              className="rounded-md border border-[color:var(--color-rose)]/40 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
              {t("ui.keys.batch_delete")}
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())}
              className="ml-auto rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
              {t("ui.keys.batch_clear")}
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3 sm:flex-row sm:items-center">
          <SearchField
            label={t("ui.keys.search_ph")}
            placeholder={t("ui.keys.search_ph")}
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            className="flex-1"
          />
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label={t("ui.keys.filter_group")}
              value={filters.group}
              onChange={(e) => setFilters({ ...filters, group: e.target.value })}
              className="h-9 w-auto text-xs"
            >
              <option value="all">{t("ui.keys.all_groups")}</option>
              {allGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t("ui.keys.filter_status")}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as "all" | "active" | "paused" | "expired" })}
              className="h-9 w-auto text-xs"
            >
              <option value="all">{t("ui.keys.all_statuses")}</option>
              <option value="active">{t("ui.keys.active")}</option>
              <option value="paused">{t("ui.status.paused")}</option>
              <option value="expired">{t("ui.status.expired")}</option>
            </Select>
          </div>
        </div>

        {keys.length === 0 ? (
          <EmptyState
            title={t("ui.keys.empty_title")}
            description={t("ui.keys.empty_desc")}
            icon={<KeyRound size={18} />}
          />
        ) : (
          <div className="space-y-3">
            {/* Desktop table */}
            <div className="card hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="w-8 px-4 py-3">
                        <input type="checkbox" aria-label={t("ui.keys.select_all")}
                          checked={keys.length > 0 && keys.every((k) => selectedIds.has(k.id))}
                          onChange={() => setSelectedIds(keys.every((k) => selectedIds.has(k.id)) ? new Set() : new Set(keys.map((k) => k.id)))}
                          className="accent-[color:var(--color-lime)]" />
                      </th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.keys.key")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.keys.group")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.keys.status")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.keys.requests")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.keys.cost")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.keys.last_used")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => {
                      const requestTone = key.requestQuota.percent >= 90 ? "rose" : key.requestQuota.percent >= 70 ? "amber" : "lime";
                      const costTone = key.costQuota.percent >= 90 ? "rose" : key.costQuota.percent >= 70 ? "amber" : "lime";
                      return (
                        <tr key={key.id} className={`border-b border-[color:var(--color-border)]/60 last:border-0 ${selectedIds.has(key.id) ? "bg-[color:var(--color-lime)]/5" : ""}`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selectedIds.has(key.id)} onChange={() => toggleSelected(key.id)} className="accent-[color:var(--color-lime)]" aria-label={`Select ${key.name}`} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[color:var(--color-fg)]">{key.name}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <code className="font-mono text-[10px] text-[color:var(--color-fg)]/80 break-all">
                                {revealedId === key.id ? key.fullToken : key.maskedToken}
                              </code>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => setRevealedId(revealedId === key.id ? null : key.id)}
                                  className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                                  aria-label={revealedId === key.id ? "Hide full key" : "Reveal full key"}
                                >
                                  {revealedId === key.id ? t("ui.keys.hide") : t("ui.keys.reveal")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyKey(key.fullToken)}
                                  className="rounded border border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-[color:var(--color-lime)] hover:opacity-90"
                                  aria-label={`Copy full key for ${key.name}`}
                                >
                                  {t("ui.keys.copy")}
                                </button>
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {key.tags.map((tag) => (
                                <span key={tag} className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-muted)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="chip chip-cyan">{key.group}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`chip chip-${key.status === "active" ? "lime" : key.status === "paused" ? "amber" : "rose"}`}>
                              {key.statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="min-w-32">
                              <ProgressBar label={t("ui.keys.requests")} value={key.requestQuota.percent} valueLabel={key.requestQuota.text} tone={requestTone} />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="min-w-32">
                              <ProgressBar label={t("ui.keys.cost")} value={key.costQuota.percent} valueLabel={key.costQuota.text} tone={costTone} />
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-muted)]">
                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggle(key.id, key.status !== "active")}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                              >
                                {key.status === "active" ? t("ui.keys.pause") : t("ui.keys.enable")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResetUsage(key.id)}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                              >
                                {t("ui.common.reset")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDrawer({ id: key.id })}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                              >
                                {t("ui.common.edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id: key.id, name: key.name })}
                                className="rounded-md border border-[color:var(--color-rose)]/40 px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10"
                              >
                                {t("ui.common.delete")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 lg:hidden">
              {keys.map((key) => {
                const requestTone = key.requestQuota.percent >= 90 ? "rose" : key.requestQuota.percent >= 70 ? "amber" : "lime";
                const costTone = key.costQuota.percent >= 90 ? "rose" : key.costQuota.percent >= 70 ? "amber" : "lime";
                return (
                  <div key={key.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-[color:var(--color-fg)]">{key.name}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <code className="font-mono text-[10px] text-[color:var(--color-fg)]/80 break-all">
                            {revealedId === key.id ? key.fullToken : key.maskedToken}
                          </code>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRevealedId(revealedId === key.id ? null : key.id)}
                            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 font-mono text-[9px] tracking-wide text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                            aria-label={revealedId === key.id ? "Hide full key" : "Reveal full key"}
                          >
                            {revealedId === key.id ? t("ui.keys.hide") : t("ui.keys.reveal")}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyKey(key.fullToken)}
                            className="rounded border border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 px-2 py-0.5 font-mono text-[9px] tracking-wide text-[color:var(--color-lime)] hover:opacity-90"
                            aria-label={`Copy full key for ${key.name}`}
                          >
                            {t("ui.keys.copy")}
                          </button>
                        </div>
                      </div>
                      <span className={`chip chip-${key.status === "active" ? "lime" : key.status === "paused" ? "amber" : "rose"}`}>
                        {key.statusLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="chip chip-cyan">{key.group}</span>
                      {key.tags.map((tag) => (
                        <span key={tag} className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-muted)]">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2">
                      <ProgressBar label={t("ui.keys.requests")} value={key.requestQuota.percent} valueLabel={key.requestQuota.text} tone={requestTone} />
                      <ProgressBar label={t("ui.keys.cost")} value={key.costQuota.percent} valueLabel={key.costQuota.text} tone={costTone} />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleResetUsage(key.id)}
                        className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                      >
                        {t("ui.common.reset")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawer({ id: key.id })}
                        className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                      >
                        {t("ui.common.edit")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {drawer && (
        <KeyDrawer
          mode={drawer}
          keysSource={apiKeys ?? []}
          onClose={() => setDrawer(null)}
          onFlash={flash}
          onSaved={reload}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button type="button" aria-label={t("ui.keys.close")} onClick={() => setDeleteTarget(null)} className="absolute inset-0 bg-[color:var(--color-ink)]/70 backdrop-blur-sm" />
          <div className="card relative w-full max-w-sm p-5">
            <h3 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
              {t("ui.keys.delete_confirm")}
            </h3>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                {t("ui.common.cancel")}
              </button>
              <button type="button" onClick={async () => {
                if (deleteTarget === "batch") { batchDelete(); }
                else {
                  try {
                    await deleteDownstreamApiKey(Number(deleteTarget.id));
                    showToast(t("ui.keys.deleted_single", { name: deleteTarget.name }));
                    setDeleteTarget(null);
                    await reload();
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : "Delete failed.");
                  }
                }
              }}
                className="h-9 rounded-lg bg-[color:var(--color-rose)] px-4 font-mono text-[11px] font-bold tracking-wider text-white hover:opacity-90">
                {t("ui.common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyDrawer({
  mode,
  keysSource,
  onClose,
  onFlash,
  onSaved,
}: {
  mode: "create" | { id: string };
  keysSource: typeof PROTOTYPE_KEYS;
  onClose: () => void;
  onFlash: (msg: string) => void;
  onSaved: () => Promise<void>;
}) {
  const t = useUiText();
  const isEdit = mode !== "create";
  const key = isEdit ? keysSource.find((k) => k.id === mode.id) : undefined;
  const { showToast } = useToast();

  // form state
  const [name, setName] = useState(key?.name ?? "");
  const [tokenKey, setTokenKey] = useState(key?.fullToken ?? `sk-mpe_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`);
  const [groupName, setGroupName] = useState(key?.groupName ?? "");
  const [description, setDescription] = useState(key?.description ?? "");
  const [maxCost, setMaxCost] = useState(String(key?.maxCost ?? ""));
  const [maxRequests, setMaxRequests] = useState(String(key?.maxRequests ?? ""));
  const [expiresAt, setExpiresAt] = useState(key?.expiresAt?.slice(0, 16) ?? "");
  const [enabled, setEnabled] = useState(key ? key.status !== "expired" : true);
  const [scopes, setScopes] = useState<Record<string, boolean>>({
    "models:read": true,
    "requests:write": true,
    "usage:read": key?.scopes.includes("usage:read") ?? false,
  });
  const [tagsDraft, setTagsDraft] = useState(key?.tags.join(", ") ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [siteWeightsText, setSiteWeightsText] = useState(
    key?.siteWeightMultipliers ? JSON.stringify(key.siteWeightMultipliers, null, 2) : "",
  );
  const [selectedModels, setSelectedModels] = useState<Set<string>>(() => new Set(key?.supportedModels ?? []));
  const [modelSearch, setModelSearch] = useState("");
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(() => new Set(key?.selectedGroupRoutes ?? []));
  const [routeSearch, setRouteSearch] = useState("");
  const [excludedSiteIds, setExcludedSiteIds] = useState<Set<number>>(() => new Set(key?.excludedSiteIds ?? []));
  // Real route + site options for the policy allow/exclude pickers. In API
  // mode these come from the backend; prototype mode uses the snapshot lists.
  const [routeOptions, setRouteOptions] = useState<Array<{ id: number; label: string }>>([]);
  const [siteOptions, setSiteOptions] = useState<Array<{ id: number; label: string }>>([]);

  useEffect(() => {
    if (DATA_MODE === "prototype") {
      setRouteOptions([
        { id: 1, label: "gpt-*" },
        { id: 2, label: "claude-*" },
      ]);
      setSiteOptions([
        { id: 1, label: "Primary (New API · HK)" },
        { id: 2, label: "Staging (One API)" },
      ]);
      return;
    }
    Promise.all([
      fetchRoutes().catch(() => []),
      fetchSites().catch(() => []),
    ]).then(([routes, sites]) => {
      const r = (routes as any[]).map((route) => ({
        id: route.id,
        label: `${route.displayName || route.modelPattern} (${route.modelPattern})`,
      }));
      const s = (sites as any[]).map((site) => ({ id: site.id, label: site.name }));
      setRouteOptions(r);
      setSiteOptions(s);
    });
  }, []);
  // Real marketplace model catalog. Starts empty in API mode; the fetch result
  // is used as-is (an empty catalog stays empty — no fake names). Prototype
  // mode keeps the snapshot list.
  const [catalogModels, setCatalogModels] = useState<string[]>(
    DATA_MODE === "prototype" ? Array.from(new Set(MODEL_OPTIONS.map((m) => m.name))) : [],
  );
  const [catalogLoaded, setCatalogLoaded] = useState(DATA_MODE === "prototype");

  useEffect(() => {
    if (DATA_MODE === "prototype") return;
    fetchModelsMarketplace({ includePricing: false })
      .then(({ models }) => {
        const names = (models as Array<{ name?: string }>).map((m) => m.name).filter((n): n is string => !!n);
        setCatalogModels(names);
      })
      .catch(() => { /* keep empty on error */ })
      .finally(() => setCatalogLoaded(true));
  }, []);

  const randomizeToken = () => setTokenKey(`sk-mpe_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`);

  const toggleScope = (s: string) => setScopes((p) => ({ ...p, [s]: !p[s] }));
  const toggleModel = (m: string) => setSelectedModels((p) => { const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const toggleRoute = (r: string) => setSelectedRoutes((p) => { const n = new Set(p); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const toggleExcludedSite = (id: number) => setExcludedSiteIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredModels = catalogModels
    .map((name) => ({ name, family: name.split(/[-_/]/)[0] ?? name }))
    .filter(
      (m) => !modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.family.toLowerCase().includes(modelSearch.toLowerCase()),
    );
  const filteredRoutes = routeOptions.filter((r) => !routeSearch || r.label.toLowerCase().includes(routeSearch.toLowerCase()));

  const handleSave = async () => {
    const payload = {
      name: (name || key?.name) ?? "",
      key: tokenKey,
      description: description || undefined,
      groupName: groupName || undefined,
      tags: tags,
      enabled,
      ...(expiresAt ? { expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined } : {}),
      ...(maxCost ? { maxCost: Number(maxCost) } : {}),
      ...(maxRequests ? { maxRequests: Number(maxRequests) } : {}),
      supportedModels: Array.from(selectedModels),
      ...(selectedRoutes.size ? { allowedRouteIds: Array.from(selectedRoutes).map(Number) } : {}),
      ...(excludedSiteIds.size ? { excludedSiteIds: Array.from(excludedSiteIds) } : {}),
      // Site weight multipliers parsed from the JSON textarea when valid.
      ...(siteWeightsText.trim()
        ? (() => {
          try {
            const parsed = JSON.parse(siteWeightsText);
            return typeof parsed === "object" && parsed !== null ? { siteWeightMultipliers: parsed } : {};
          } catch { return {}; }
        })()
        : {}),
    };
    try {
      if (isEdit && key) {
        await updateDownstreamApiKey(Number(key.id), payload);
        showToast(t("ui.keys.save_ok", { name: payload.name }));
      } else {
        await createDownstreamApiKey(payload);
        showToast(t("ui.keys.create_ok"));
      }
      onClose();
      await onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.");
    }
  };

  const tags = tagsDraft.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);

  return (
    <EditDrawer
      open
      onClose={onClose}
      title={isEdit ? t("ui.keys.edit_drawer", { name: key?.name ?? "" }) : t("ui.keys.create_drawer")}
      eyebrow={isEdit ? t("ui.keys.edit_eyebrow") : t("ui.keys.create_eyebrow")}
      subtitle={key ? `${key.tokenPrefix}••••••••` : undefined}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            {t("ui.common.cancel")}
          </button>
          <button type="button" onClick={handleSave}
            className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            {isEdit ? t("ui.common.save") : t("ui.keys.create_btn")}
          </button>
        </>
      }
    >
      {/* ── BASIC ── */}
      <Field label={t("ui.keys.name_field")}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ui.keys.name_ph")} />
      </Field>

      <Field label={t("ui.keys.key_field")}>
        <div className="flex gap-2 items-stretch">
          <TextInput value={tokenKey} onChange={(e) => setTokenKey(e.target.value)} placeholder="sk-…" className="flex-1 font-mono" />
          <button type="button" onClick={randomizeToken}
            className="h-10 shrink-0 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            {t("ui.keys.random")}
          </button>
        </div>
      </Field>

      <Field label={t("ui.keys.group_field")}>
        <TextInput value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("ui.keys.group_ph")} />
      </Field>

      <Field label={t("ui.keys.request_limit")} hint={t("ui.keys.request_limit_hint")}>
        <TextInput value={maxRequests} onChange={(e) => setMaxRequests(e.target.value)} placeholder="80000" />
      </Field>

      <Field label={t("ui.keys.cost_limit")} hint={t("ui.keys.cost_limit_hint")}>
        <TextInput value={maxCost} onChange={(e) => setMaxCost(e.target.value)} placeholder="20.00" />
      </Field>

      <Field label={t("ui.keys.expiry_field")}>
        <TextInput type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </Field>

      <Toggle checked={enabled} onChange={setEnabled} label={t("ui.keys.enable_immediately")} />
      <p className="mt-1 text-xs text-[color:var(--color-muted)]">{t("ui.keys.enable_hint")}</p>

      <Field label={t("ui.keys.description_field")}>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("ui.keys.description_ph")} rows={3} />
      </Field>

      <Field label={t("ui.keys.tags_field")} hint={t("ui.keys.tags_hint")}>
        <TextInput value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} placeholder={t("ui.keys.tags_ph")} />
      </Field>

      {/* ── SCOPES ── */}
      <Field label={t("ui.keys.scopes_field")}>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(scopes).map(([scope, checked]) => (
            <button key={scope} type="button" aria-pressed={checked} onClick={() => toggleScope(scope)}
              className={`rounded border px-2 py-1 font-mono text-[10px] tracking-wider ${
                checked
                  ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                  : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
              }`}
            >
              {scope}
            </button>
          ))}
        </div>
      </Field>

      {/* ── ADVANCED ── */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/60 px-4 py-2.5 text-left font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] transition-colors"
      >
        <span>{t("ui.keys.advanced")}</span>
        <span>{advancedOpen ? t("ui.keys.advanced_open") : t("ui.keys.advanced_closed")}</span>
      </button>

      {advancedOpen && (
        <div className="space-y-5 pt-1">
          {/* Site weight JSON */}
          <Field label={t("ui.keys.site_weights")} hint={t("ui.keys.site_weights_hint")}>
            <TextArea value={siteWeightsText} onChange={(e) => setSiteWeightsText(e.target.value)} placeholder={t("ui.keys.site_weights_ph")} rows={3} className="font-mono" />
          </Field>

          {/* Model whitelist */}
          <Field label={t("ui.keys.models_whitelist")} hint={t("ui.keys.models_hint")}>
            <span className="chip chip-lime">{t("ui.keys.selected_models", { n: selectedModels.size })}</span>
            <button type="button" onClick={() => setSelectedModels(new Set(catalogModels))}
              className="ml-2 h-6 rounded border border-[color:var(--color-border)] px-2 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            >
              {t("ui.keys.select_all")}
            </button>
            <TextInput value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder={t("ui.keys.search_models")} className="mt-2" />
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
              {!catalogLoaded ? (
                <p className="text-xs text-[color:var(--color-muted)]">{t("ui.keys.loading_catalog")}</p>
              ) : catalogModels.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">
                  The model catalog is empty. Refresh the Models page to discover available models.
                </p>
              ) : filteredModels.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">{t("ui.keys.no_models")}</p>
              ) : (
                filteredModels.map((m) => (
                  <label key={m.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-[color:var(--color-fg)] hover:bg-white/[0.03]">
                    <input type="checkbox" checked={selectedModels.has(m.name)} onChange={() => toggleModel(m.name)} className="accent-[color:var(--color-lime)]" />
                    <span>{m.name}</span>
                    <span className="ml-auto text-[color:var(--color-muted)]">{m.family}</span>
                  </label>
                ))
              )}
            </div>
          </Field>

          {/* Group / model-pattern whitelist */}
          <Field label={t("ui.keys.routes_whitelist")}>
            <TextInput value={routeSearch} onChange={(e) => setRouteSearch(e.target.value)} placeholder={t("ui.keys.search_routes")} />
            <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
              {filteredRoutes.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">{t("ui.keys.no_routes")}</p>
              ) : (
                filteredRoutes.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-[color:var(--color-fg)] hover:bg-white/[0.03]">
                    <input type="checkbox" checked={selectedRoutes.has(String(r.id))} onChange={() => toggleRoute(String(r.id))} className="accent-[color:var(--color-lime)]" />
                    <code className="font-mono text-[10px]">{r.label}</code>
                  </label>
                ))
              )}
            </div>
          </Field>

          {/* Excluded sites */}
          <Field label={t("ui.keys.exclude_sites")} hint={t("ui.keys.exclude_sites_hint")}>
            <span className="chip chip-amber">{t("ui.keys.excluded_sites_count", { n: excludedSiteIds.size })}</span>
            <div className="mt-2 space-y-1">
              {siteOptions.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">{t("ui.keys.no_exclude_sites")}</p>
              ) : (
                siteOptions.map((site) => (
                  <label key={site.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-[color:var(--color-fg)] hover:bg-white/[0.03]">
                    <input type="checkbox" checked={excludedSiteIds.has(site.id)} onChange={() => toggleExcludedSite(site.id)} className="accent-[color:var(--color-amber)]" />
                    <span>{site.label}</span>
                  </label>
                ))
              )}
            </div>
          </Field>

          {/* Excluded credentials — read-only notice for prototype */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 p-4">
            <p className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.keys.exclude_credentials")}</p>
            <p className="mt-1 text-xs text-[color:var(--color-muted)]">{t("ui.keys.exclude_credentials_hint")}</p>
            <p className="mt-2 text-xs text-[color:var(--color-muted)]">{t("ui.keys.no_exclude_credentials")}</p>
          </div>
        </div>
      )}
    </EditDrawer>
  );
}