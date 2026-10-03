import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Route, Trash2, Timer } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, SectionTitle, StatCard } from "../components/PrototypeUI";
import { EditDrawer, Field, TextInput, Toggle } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import {
  fetchRoutes, updateRoute, deleteRoute, clearRouteCooldown, rebuildRoutes, addRoute,
  fetchRouteChannels, addChannel, updateChannel, deleteChannel, batchUpdateChannelPriorities,
  fetchAccounts, fetchAccountTokens, getRouteDecision, batchUpdateRoutes, fetchModelTokenCandidates,
} from "../lib/source";

// Backend channel row (token_route_channels joined with token).
interface BackendChannel {
  id: number;
  routeId: number;
  accountId: number;
  tokenId?: number | null;
  sourceModel?: string | null;
  priority: number;
  weight: number;
  enabled: boolean;
  successCount: number;
  failCount: number;
  totalLatencyMs: number;
  totalCost: number;
  cooldownUntil?: string | null;
  account?: { id: number; username?: string };
  site?: { id: number; name?: string };
  token?: { id: number; name?: string };
  username?: string;
  siteName?: string;
  tokenName?: string;
}

const STATUS_TONES: Record<string, string> = { enabled: "lime", disabled: "muted" };

// Real backend route shape (token_routes + channels). Priority is not a
// route-level field — pattern routes default to the P2 bucket for display.
interface BackendRoute {
  id: number;
  modelPattern: string;
  displayName: string | null;
  displayIcon?: string | null;
  routeMode?: string;
  routingStrategy: string;
  enabled: boolean;
  channels?: Array<{
    id: number;
    accountId: number;
    tokenId?: number | null;
    sourceModel?: string | null;
    priority: number;
    weight: number;
    enabled: boolean;
    successCount: number;
    failCount: number;
    totalCost: number;
    totalLatencyMs: number;
    cooldownUntil?: string | null;
    lastUsedAt?: string | null;
  }>;
}

type RouteDisplay = {
  id: string;
  modelPattern: string;
  displayName: string;
  strategy: string;
  enabled: boolean;
  channelCount: number;
  avgLatency: number;
  avgCost: number;
};

function mapBackendRoute(r: BackendRoute): RouteDisplay {
  const channels = r.channels ?? [];
  const totalLatency = channels.reduce((a, c) => a + (c.totalLatencyMs ?? 0), 0);
  const totalCalls = channels.reduce((a, c) => a + (c.successCount ?? 0) + (c.failCount ?? 0), 0);
  const avgLatency = totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;
  const avgCost = channels.length > 0
    ? channels.reduce((a, c) => a + (c.totalCost ?? 0), 0) / channels.length
    : 0;
  return {
    id: String(r.id),
    modelPattern: r.modelPattern,
    displayName: r.displayName || r.modelPattern,
    strategy: r.routingStrategy,
    enabled: r.enabled,
    channelCount: channels.length,
    avgLatency,
    avgCost,
  };
}

export default function Routes() {
  const t = useUiText();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"new" | string | null>(null);
  const [cooldownOpen, setCooldownOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<RouteDisplay | null>(null);
  const [routes, setRoutes] = useState<RouteDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  // Channel management for the selected route.
  const [channels, setChannels] = useState<BackendChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: number; username: string; siteName: string }>>([]);
  const [tokens, setTokens] = useState<Array<{ id: number; accountId?: number; name?: string; tokenMasked?: string }>>([]);
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [addChannelForm, setAddChannelForm] = useState({ accountId: "", tokenId: "", sourceModel: "" });
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);

  // Load the model token-candidate list for the source-model picker.
  useEffect(() => {
    fetchModelTokenCandidates()
      .then((names) => setModelCandidates(names))
      .catch(() => setModelCandidates([]));
  }, []);
  const [channelsBusy, setChannelsBusy] = useState<Record<string, boolean>>({});
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<Record<string, boolean>>({});

  const toggleBatchRoute = (id: string) => {
    setBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runRouteBatch = async (action: "enable" | "disable") => {
    const ids = Array.from(batchIds).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return;
    setBatchBusy((b) => ({ ...b, [action]: true }));
    try {
      await batchUpdateRoutes({ ids, action });
      showToast(`${action === "enable" ? "Enabled" : "Disabled"} ${ids.length} route(s).`);
      setBatchIds(new Set());
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Batch operation failed.");
    } finally {
      setBatchBusy((b) => ({ ...b, [action]: false }));
    }
  };
  const [decision, setDecision] = useState<{
    requestedModel: string; actualModel: string; matched: boolean; summary: string[]; candidates: unknown[];
  } | null>(null);

  // Fetch the live routing decision for the selected route's model pattern.
  useEffect(() => {
    if (!selectedId) { setDecision(null); return; }
    let cancelled = false;
    const route = routes.find((r) => r.id === selectedId);
    const model = route?.modelPattern ?? "";
    if (!model) { setDecision(null); return; }
    getRouteDecision(model)
      .then((d) => { if (!cancelled) setDecision(d); })
      .catch(() => { if (!cancelled) setDecision(null); });
    return () => { cancelled = true; };
  }, [selectedId, routes]);

  const reload = async () => {
    try {
      const data = (await fetchRoutes()) as BackendRoute[];
      setRoutes((data ?? []).map(mapBackendRoute));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load routes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return routes.filter((r) => !q || r.modelPattern.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q));
  }, [search, routes]);

  const selected = routes.find((r) => r.id === selectedId);

  const handleSave = async (next: RouteDisplay, isNew: boolean) => {
    try {
      if (isNew) {
        await addRoute({
          modelPattern: next.modelPattern,
          displayName: next.displayName,
          routingStrategy: next.strategy,
          enabled: next.enabled,
          routeMode: "pattern",
        });
      } else {
        await updateRoute(Number(next.id), {
          modelPattern: next.modelPattern,
          displayName: next.displayName,
          routingStrategy: next.strategy,
          enabled: next.enabled,
        });
      }
      showToast(`Route "${next.displayName}" ${isNew ? "created" : "updated"}.`);
      setEditing(null);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRoute(Number(id));
      showToast("Route deleted.");
      setSelectedId(null);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const handleCooldownClear = async (id: string) => {
    try {
      await clearRouteCooldown(Number(id));
      showToast("Route cooldown cleared.");
      setCooldownOpen(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cooldown clear failed.");
    }
  };

  const handleRebuild = async () => {
    try {
      showToast("Rebuilding routes…");
      await rebuildRoutes(true, false);
      showToast("Routes rebuilt.");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rebuild failed.");
    }
  };

  // Load channels when a route is selected, plus the account/token pickers.
  useEffect(() => {
    if (!selectedId) { setChannels([]); return; }
    let cancelled = false;
    setChannelsLoading(true);
    fetchRouteChannels(Number(selectedId))
      .then((data) => {
        if (cancelled) return;
        const list = (data as BackendChannel[]) ?? [];
        // The backend returns channels in id order; sort by priority so the
        // displayed order always matches the persisted routing priority.
        setChannels([...list].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)));
      })
      .catch(() => { if (!cancelled) setChannels([]); })
      .finally(() => { if (!cancelled) setChannelsLoading(false); });
    // Load accounts + tokens for the add-channel pickers once.
    Promise.all([fetchAccounts(), fetchAccountTokens()])
      .then(([accts, toks]) => {
        if (cancelled) return;
        setAccounts((accts as any[]).map((a) => ({ id: a.id, username: a.username, siteName: a.siteName ?? "" })));
        setTokens((toks as any[]) ?? []);
      })
      .catch(() => { /* keep empty pickers */ });
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleAddChannel = async () => {
    const routeId = Number(selectedId);
    const accountId = Number(addChannelForm.accountId);
    if (!Number.isFinite(routeId) || routeId <= 0 || !Number.isFinite(accountId) || accountId <= 0) {
      showToast("Select an account first.");
      return;
    }
    setChannelsBusy((b) => ({ ...b, add: true }));
    try {
      await addChannel(routeId, {
        accountId,
        tokenId: addChannelForm.tokenId ? Number(addChannelForm.tokenId) : undefined,
        sourceModel: addChannelForm.sourceModel.trim() || undefined,
      });
      showToast("Channel added.");
      setAddChannelOpen(false);
      setAddChannelForm({ accountId: "", tokenId: "", sourceModel: "" });
      const data = await fetchRouteChannels(routeId);
      setChannels([...(data as BackendChannel[]) ?? []].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Add channel failed.");
    } finally {
      setChannelsBusy((b) => ({ ...b, add: false }));
    }
  };

  const handleDeleteChannel = async (channelId: number) => {
    if (!window.confirm("Remove this channel from the route?")) return;
    try {
      await deleteChannel(channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      showToast("Channel removed.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Remove channel failed.");
    }
  };

  const handleMoveChannel = async (channelId: number, dir: -1 | 1) => {
    const idx = channels.findIndex((c) => c.id === channelId);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= channels.length) return;
    const next = [...channels];
    [next[idx], next[to]] = [next[to], next[idx]];
    // Persist new priority ordering (priority = position index).
    const updates = next.map((c, i) => ({ id: c.id, priority: i }));
    setChannels(next);
    try {
      await batchUpdateChannelPriorities(updates);
      showToast("Channel order saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reorder failed.");
      setChannels(channels);
    }
  };

  const handleToggleChannel = async (channelId: number, enabled: boolean) => {
    try {
      await updateChannel(channelId, { enabled });
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, enabled } : c)));
      showToast(enabled ? "Channel enabled." : "Channel disabled.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Toggle failed.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Federation"
        title={t("ui.routes.title")}
        description={t("ui.routes.desc")}
        actions={
          <button
            type="button"
            onClick={() => {
              setDrawer("new");
              setEditing({
                id: "new",
                modelPattern: "",
                displayName: "",
                strategy: "weighted",
                enabled: true,
                channelCount: 0,
                avgLatency: 0,
                avgCost: 0,
              });
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            <Plus size={14} /> {t("ui.common.add_route")}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("ui.routes.total_rules")} value={routes.length} icon={<Route size={16} />} />
        <StatCard label={t("ui.routes.active")} value={routes.filter((r) => r.enabled).length} trend={{ label: "enabled", tone: "lime" }} icon={<Route size={16} />} />
        <StatCard label={t("ui.routes.avg_latency")} value={routes.length ? `${Math.round(routes.reduce((a, r) => a + (r.avgLatency ?? 0), 0) / routes.length)}ms` : "—"} icon={<Route size={16} />} />
        <StatCard label={t("ui.routes.avg_cost")} value={routes.length ? `$${(routes.reduce((a, r) => a + (r.avgCost ?? 0), 0) / routes.length).toFixed(2)}` : "—"} icon={<Route size={16} />} />
      </div>

      <div className="flex items-center gap-2">
        <div className="card flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchField label={t("ui.routes.search_ph")} placeholder={t("ui.routes.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md flex-1" />
        </div>
        <button
          type="button"
          onClick={handleRebuild}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-3 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          title={t("ui.routes.rebuild_title")}
        >
          <RefreshCw size={13} /> REBUILD
        </button>
      </div>

      {(loading && routes.length === 0) ? (
        <div className="card flex items-center justify-center p-10 text-sm text-[color:var(--color-muted)]">{t("ui.routes.loading_routes")}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title={t("ui.routes.no_match")} description={t("ui.routes.no_match_desc")} icon={<Route size={18} />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          {batchIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 lg:col-span-2">
              <span className="chip chip-lime">{batchIds.size} selected</span>
              <button type="button" onClick={() => runRouteBatch("enable")} disabled={batchBusy.enable}
                className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40">
                {batchBusy.enable ? "…" : t("ui.common.enable")}
              </button>
              <button type="button" onClick={() => runRouteBatch("disable")} disabled={batchBusy.disable}
                className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40">
                {batchBusy.disable ? "…" : t("ui.common.disable")}
              </button>
              <button type="button" onClick={() => setBatchIds(new Set())}
                className="ml-auto rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                CLEAR
              </button>
            </div>
          )}
          {/* Route list — flat (priority is not a backend route field) */}
          <div className="space-y-2">
              {filtered.map((route, idx) => (
                    <div key={route.id} className={`w-full text-left card p-4 transition-all ${
                      selectedId === route.id ? "ring-1 ring-[color:var(--color-lime)]/40" : "hover:border-[color:var(--color-border-bright)]"
                    }`}>
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => setSelectedId(route.id === selectedId ? null : route.id)}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={batchIds.has(route.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleBatchRoute(route.id)}
                              className="h-3.5 w-3.5 shrink-0 accent-[color:var(--color-lime)]"
                              aria-label={`Select ${route.displayName}`}
                            />
                            <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
                              {route.modelPattern}
                            </span>
                            <span className={`chip ${route.enabled ? "chip-lime" : "chip-muted"}`}>
                              {route.enabled ? "active" : "disabled"}
                            </span>
                          </div>
                          <div className="mt-1 font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                            {route.displayName}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {/* Cooldown button */}
                          <button
                            type="button"
                            onClick={() => setCooldownOpen(cooldownOpen === route.id ? null : route.id)}
                            className="rounded p-1 text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                            title={t("ui.routes.cooldown_title")}
                          >
                            <Timer size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[color:var(--color-muted)]">
                        <span>{route.strategy}</span>
                        <span>{route.channelCount} channels</span>
                        <span>{route.avgLatency}ms avg</span>
                        <span>${route.avgCost?.toFixed(2)}/1k</span>
                      </div>
                      {/* Inline cooldown panel — the backend only supports
                          clearing a route's cooldown; there is no per-route
                          cooldown-duration setting to persist. */}
                      {cooldownOpen === route.id && (
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-[color:var(--color-amber)]/30 bg-[color:var(--color-amber)]/5 p-3">
                          <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-amber)]">{t("ui.routes.cooldown")}</span>
                          <span className="text-[10px] text-[color:var(--color-muted)]">{t("ui.routes.cooldown_clear_hint")}</span>
                          <button
                            type="button"
                            onClick={() => { setCooldownOpen(null); handleCooldownClear(route.id); }}
                            className="ml-auto rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                          >
                            CLEAR
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
          </div>

          {/* Detail panel — visible on all widths; stacks below the list on
              small screens so channel management works on mobile too. */}
          <div className="block">
            {selected ? (
              <div className="card p-5 lg:sticky lg:top-24">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">{selected.displayName}</h3>
                    <div className="mt-1 font-mono text-[10px] text-[color:var(--color-muted)]">{selected.modelPattern}</div>
                  </div>
                  <span className={`chip ${selected.enabled ? "chip-lime" : "chip-muted"}`}>
                    {selected.enabled ? t("ui.common.active") : t("ui.common.disabled")}
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-[color:var(--color-muted)]">{t("ui.routes.strategy")}</span>
                    <span className="font-mono text-[color:var(--color-fg)]">{selected.strategy}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[color:var(--color-muted)]">{t("ui.routes.channels")}</span>
                    <span className="font-mono text-[color:var(--color-fg)]">{channels.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[color:var(--color-muted)]">{t("ui.routes.avg_latency")}</span>
                    <span className="font-mono text-[color:var(--color-fg)]">{selected.avgLatency}ms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[color:var(--color-muted)]">Avg cost/1k</span>
                    <span className="font-mono text-[color:var(--color-fg)]">${selected.avgCost?.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-5 border-t border-[color:var(--color-border)] pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.routes.channels")}</span>
                    <button type="button" onClick={() => setAddChannelOpen((v) => !v)}
                      className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                      {t("ui.routes.add_channel")}
                    </button>
                  </div>

                  {addChannelOpen && (
                    <div className="mb-3 space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 p-3">
                      <label className="block">
                        <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.routes.account")}</span>
                        <select value={addChannelForm.accountId}
                          onChange={(e) => setAddChannelForm((f) => ({ ...f, accountId: e.target.value, tokenId: "" }))}
                          className="h-8 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50">
                          <option value="">{t("ui.routes.select_account")}</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.username} ({a.siteName})</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.routes.token_opt")}</span>
                        <select value={addChannelForm.tokenId}
                          onChange={(e) => setAddChannelForm((f) => ({ ...f, tokenId: e.target.value }))}
                          className="h-8 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50">
                          <option value="">{t("ui.routes.default_token")}</option>
                          {tokens.filter((tk: any) => String(tk.account?.id ?? tk.accountId ?? "") === addChannelForm.accountId).map((tk: any) => (
                            <option key={tk.id} value={tk.id}>{tk.name ?? `token-${tk.id}`}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.routes.source_model_opt")}</span>
                        <input value={addChannelForm.sourceModel}
                          onChange={(e) => setAddChannelForm((f) => ({ ...f, sourceModel: e.target.value }))}
                          list="model-candidates"
                          placeholder={modelCandidates.length ? "Pick a model…" : "e.g. gpt-4o"}
                          className="h-8 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50" />
                        <datalist id="model-candidates">
                          {modelCandidates.map((m) => <option key={m} value={m} />)}
                        </datalist>
                      </label>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAddChannelOpen(false)}
                          className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] text-[color:var(--color-muted)]">{t("ui.common.cancel")}</button>
                        <button type="button" onClick={handleAddChannel} disabled={channelsBusy.add}
                          className="rounded-md bg-[color:var(--color-lime)] px-3 py-1 font-mono text-[9px] font-bold text-[color:var(--color-ink)] disabled:opacity-40">
                          {channelsBusy.add ? "ADDING…" : t("ui.routes.add_channel")}
                        </button>
                      </div>
                    </div>
                  )}

                  {channelsLoading ? (
                    <div className="py-2 text-[10px] text-[color:var(--color-muted)]">{t("ui.routes.loading_channels")}</div>
                  ) : channels.length === 0 ? (
                    <div className="py-2 text-[10px] text-[color:var(--color-muted)]">
                      No channels yet. A route without channels will not forward traffic.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {channels.map((ch, idx) => (
                        <div key={ch.id} className="flex items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 px-2 py-1.5">
                          <div className="flex shrink-0 flex-col">
                            <button type="button" onClick={() => handleMoveChannel(ch.id, -1)} disabled={idx === 0}
                              className="text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-20" title={t("ui.routes.move_up")}>
                              <ArrowUp size={10} />
                            </button>
                            <button type="button" onClick={() => handleMoveChannel(ch.id, 1)} disabled={idx === channels.length - 1}
                              className="text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-20" title={t("ui.routes.move_down")}>
                              <ArrowDown size={10} />
                            </button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[10px] text-[color:var(--color-fg)]">
                              {ch.account?.username ?? ch.username ?? `account-${ch.accountId}`}
                            </div>
                            <div className="truncate font-mono text-[9px] text-[color:var(--color-muted)]">
                              {ch.token?.name ?? ch.tokenName ?? "default token"}
                              {ch.sourceModel ? ` · ${ch.sourceModel}` : ""}
                            </div>
                          </div>
                          <button type="button" onClick={() => handleToggleChannel(ch.id, !ch.enabled)}
                            className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] tracking-wider ${
                              ch.enabled ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" : "bg-[color:var(--color-muted)]/10 text-[color:var(--color-muted)]"
                            }`}>
                            {ch.enabled ? t("ui.common.on") : t("ui.common.off")}
                          </button>
                          <button type="button" onClick={() => handleDeleteChannel(ch.id)}
                            className="shrink-0 text-[color:var(--color-rose)]/70 hover:text-[color:var(--color-rose)]" title={t("ui.routes.remove_channel")}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-[color:var(--color-border)] pt-4">
                  <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.routes.decision_snapshot")}</div>
                  {decision ? (
                    <div className="space-y-2 text-xs">
                      {decision.summary.length > 0 ? (
                        decision.summary.map((line, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="font-mono text-[color:var(--color-lime)]">{i + 1}</span>
                            <span className="text-[color:var(--color-muted)]">{line}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[color:var(--color-lime)]">1</span>
                          <span className="text-[color:var(--color-muted)]">
                            {decision.matched
                              ? `Matched ${decision.actualModel} (${decision.candidates.length} candidates)`
                              : `No match for "${decision.requestedModel}"`}
                          </span>
                        </div>
                      )}
                      {decision.matched && decision.candidates.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[color:var(--color-lime)]">{decision.summary.length + 1}</span>
                          <span className="text-[color:var(--color-muted)]">{decision.candidates.length} candidate channel(s)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[color:var(--color-lime)]">1</span>
                        <span className="text-[color:var(--color-muted)]">Match: Pattern "{selected.modelPattern}"</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[color:var(--color-lime)]">2</span>
                        <span className="text-[color:var(--color-muted)]">Filter: {channels.length} channels available</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[color:var(--color-lime)]">3</span>
                        <span className="text-[color:var(--color-muted)]">Pick: {channels.length ? "highest-priority enabled channel selected" : "no channel available — traffic will fail"}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => selected && setEditing(selected)}
                    className="flex-1 rounded-lg bg-[color:var(--color-lime)] py-2 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
                    EDIT ROUTE
                  </button>
                  <button type="button" onClick={() => { setSelectedId(null); handleDelete(selected.id); }}
                    className="rounded-lg border border-[color:var(--color-rose)]/40 px-3 py-2 text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="card flex min-h-[300px] items-center justify-center p-5 text-center">
                <div>
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-muted)]">
                    <Route size={18} />
                  </div>
                  <div className="text-sm text-[color:var(--color-muted)]">{t("ui.routes.select_route")}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Route editor drawer */}
      {editing && (
        <RouteEditorDrawer
          route={editing}
          isNew={drawer === "new"}
          onClose={() => { setEditing(null); setDrawer(null); }}
          onSave={(next) => handleSave(next, drawer === "new")}
        />
      )}
    </div>
  );
}

function RouteEditorDrawer({
  route,
  isNew,
  onClose,
  onSave,
}: {
  route: RouteDisplay;
  isNew?: boolean;
  onClose: () => void;
  onSave: (next: RouteDisplay) => void;
}) {
  const [modelPattern, setModelPattern] = useState(route.modelPattern);
  const [displayName, setDisplayName] = useState(route.displayName);
  const [strategy, setStrategy] = useState(route.strategy);
  const [enabled, setEnabled] = useState(route.enabled);

  const strategies = ["weighted", "round_robin", "sticky_cost", "cheapest", "fallback"];

  return (
    <EditDrawer
      open
      onClose={onClose}
      title={isNew ? "New Route" : "Edit Route"}
      eyebrow={isNew ? "New routing rule" : "Routing rule"}
      subtitle={route.modelPattern || "New pattern route"}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
            CANCEL
          </button>
          <button type="button" onClick={() => onSave({ ...route, modelPattern, displayName, strategy, enabled })}
            className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
            {isNew ? t("ui.routes.create_route") : t("ui.routes.save_route")}
          </button>
        </>
      }
    >
      <Field label={t("ui.routes.display_name")}>
        <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("ui.routes.all_gpt")} />
      </Field>
      <Field label={t("ui.routes.model_pattern")} hint="Glob pattern, e.g. gpt-*">
        <TextInput value={modelPattern} onChange={(e) => setModelPattern(e.target.value)} placeholder="gpt-*" />
      </Field>
      <Field label={t("ui.routes.strategy")}>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)}
          className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50">
          {strategies.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
        <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.routes.enabled")}</span>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>
    </EditDrawer>
  );
}
