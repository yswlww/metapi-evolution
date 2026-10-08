import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";import { KeyRound, Plus, RefreshCw, Tags, TrendingUp, Zap } from "lucide-react";
import { useManagementText } from '../lib/managementParityText';
import { matchesTags, batchOutcome, type BatchResponse, type CredentialRef } from '../lib/managementParity';
import { apiPost } from '../lib/client';
import KeyDrawer from './downstream-keys/KeyDrawer';
import KeyMetadata from './downstream-keys/KeyMetadata';
import KeyOverview from './downstream-keys/KeyOverview';
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

type ManagedKey = (typeof PROTOTYPE_KEYS)[number] & { excludedCredentialRefs?: CredentialRef[]; enabled?: boolean };

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
  excludedCredentialRefs?: CredentialRef[];
  lastUsedAt: string | null;
  createdAt: string;
}

/** Map a backend policy row to the UI DownstreamKey display shape. */
function mapBackendKey(
  raw: BackendDownstreamKey,
  t: (key: string, params?: Record<string, string | number>) => string,
): ManagedKey {
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
    excludedCredentialRefs: raw.excludedCredentialRefs ?? [],
    enabled: raw.enabled,
    status,
    statusLabel: status === "active"
      ? t("ui.keys.active")
      : status === "paused" ? t("ui.status.paused") : t("ui.status.expired"),
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
  const l = useManagementText();
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [overviewId, setOverviewId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'any' | 'all'>('any');
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
  const [apiKeys, setApiKeys] = useState<ManagedKey[] | null>(null);
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
      setApiKeys((items as BackendDownstreamKey[]).map((raw) => mapBackendKey(raw, t)));
    } catch (err) {
      setApiKeys([]);
      showToast(err instanceof Error ? err.message : t("ui.keys.err_load"));
    }
  }, [showToast, t]);

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

  const runKeyBatch = async (action: 'enable' | 'disable' | 'delete' | 'resetUsage') => {
    try {
      const outcome = batchOutcome(await apiPost<BatchResponse>('/api/downstream-keys/batch', { ids: [...selectedIds].map(Number), action }));
      setSelectedIds(new Set(outcome.failedIds.map(String)));
      showToast(`${l('success')}: ${outcome.succeeded}; ${l('failed')}: ${outcome.failedIds.length}${outcome.messages.length ? ` — ${outcome.messages.join('; ')}` : ''}`);
      await reload();
      return outcome;
    } catch (err) { showToast(err instanceof Error ? err.message : t('ui.keys.batch_update_failed')); return null; }
  };
  const batchEnable = (enabled: boolean) => runKeyBatch(enabled ? 'enable' : 'disable');
  const batchReset = () => runKeyBatch('resetUsage');
  const batchDelete = async () => { const result = await runKeyBatch('delete'); if (result) setDeleteTarget(null); };

  const keys = useMemo(
    () => buildDownstreamKeyViewModels(keysSource.filter(k => matchesTags(k.tags, tagFilter, tagMode)), filters, usageOverrides),
    [keysSource, filters, usageOverrides, tagFilter, tagMode],
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
      showToast(err instanceof Error ? err.message : t("ui.keys.reset_failed"));
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateDownstreamApiKey(Number(id), { enabled });
      flash(t("ui.keys.toggle_ok", { id }));
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.keys.update_failed"));
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
          description={trendKeyId != null ? t("ui.keys.usage_selected") : "7-day request volume across all keys."}
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
            <button type="button" onClick={() => setMetadataOpen(true)}>{l('metadata')}</button>
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

        <div className="flex flex-wrap gap-3"><button onClick={() => setSelectedIds(keys.every(k => selectedIds.has(k.id)) ? new Set() : new Set(keys.map(k => k.id)))}>{l('selectAll')}</button><label>{l('tags')}<input value={tagFilter.join(', ')} onChange={e => setTagFilter(e.target.value.split(/[,，]/).map(t => t.trim()).filter(Boolean))} className="ml-2 rounded border bg-[color:var(--color-panel)] p-2" /></label><select value={tagMode} onChange={e => setTagMode(e.target.value as 'any' | 'all')}><option value="any">{l('any')}</option><option value="all">{l('every')}</option></select></div>
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
                            <div className="font-medium text-[color:var(--color-fg)]">{key.name} <button className="text-xs underline" onClick={() => setOverviewId(key.id)}>{l('overview')}</button></div>
                            <div className="mt-1 flex items-center gap-2">
                              <code className="font-mono text-[10px] text-[color:var(--color-fg)]/80 break-all">
                                {revealedId === key.id ? key.fullToken : key.maskedToken}
                              </code>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => setRevealedId(revealedId === key.id ? null : key.id)}
                                  className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                                  aria-label={revealedId === key.id ? t("ui.keys.hide_full") : t("ui.keys.reveal_full")}
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
                        <label className="flex gap-2"><input type="checkbox" aria-label={`${l('select')} ${key.name}`} checked={selectedIds.has(key.id)} onChange={() => toggleSelected(key.id)} />{key.name}</label>
                        <div className="font-medium text-[color:var(--color-fg)]">{key.name} <button className="text-xs underline" onClick={() => setOverviewId(key.id)}>{l('overview')}</button></div>
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
                            aria-label={revealedId === key.id ? t("ui.keys.hide_full") : t("ui.keys.reveal_full")}
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

      {metadataOpen && <KeyMetadata ids={[...selectedIds].map(Number)} onClose={() => setMetadataOpen(false)} onSaved={async failedIds => { setSelectedIds(new Set(failedIds.map(String))); await reload(); }} />}
      {overviewId && <KeyOverview id={Number(overviewId)} onClose={() => setOverviewId(null)} />}
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
                    showToast(err instanceof Error ? err.message : t("ui.toast.delete_failed"));
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
