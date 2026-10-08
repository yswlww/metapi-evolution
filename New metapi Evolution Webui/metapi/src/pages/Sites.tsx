import { useEffect, useMemo, useState } from "react";
import { Link } from 'react-router-dom';
import SiteModelsChooser from './sites/SiteModelsChooser';
import { useManagementText } from '../lib/managementParityText';
import { batchOutcome, buildOrderUpdates, sortManagementRows, type BatchResponse } from '../lib/managementParity';
import { apiPost } from '../lib/client';
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Pencil,
  Plus,
  Radio,
  Server,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import { ADAPTER_NAMES, ADAPTER_COLORS } from "../lib/adapters";
import PageHeader from "../components/PageHeader";
import {
  EmptyState,
  SearchField,
  SectionTitle,
  StatCard,
} from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import {
  fetchSites, createSite, updateSite, deleteSite, probeSiteNow, updateSiteDisabledModels,
  fetchSiteDisabledModels, detectSite, batchUpdateSites,
} from "../lib/source";
import type { Site } from "../data/prototype";
import { type SiteStatus } from "../data/prototype";

type StatusFilter = "all" | SiteStatus;

const STATUS_TONES: Record<SiteStatus, string> = {
  healthy: "lime",
  degraded: "amber",
  unhealthy: "rose",
  disabled: "muted",
};

export default function Sites() {
  const t = useUiText();
  const l = useManagementText();
  const [createdSite, setCreatedSite] = useState<Site | null>(null);
  const [disabledLoaded, setDisabledLoaded] = useState(false);
  const { showToast } = useToast();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSites()
      .then((data) => { if (!cancelled) setSites(data); })
      .catch(() => { if (!cancelled) showToast(t("ui.sites.err_load")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // The drawer holds the site being edited, plus backend-only fields the UI
  // Site type does not carry (sortOrder, customHeaders, proxy settings).
  const [drawer, setDrawer] = useState<(Partial<Site> & {
    sortOrder?: number;
    customHeaders?: unknown;
    proxyUrl?: string | null;
    useSystemProxy?: boolean;
  }) | null>(null);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adapter: "new-api",
    url: "",
    region: "",
    status: "healthy" as SiteStatus,
    note: "",
    enabled: true,
    customHeaders: "",
    proxyUrl: "",
    useSystemProxy: false,
    weight: "1.0",
    pinned: false,
    disabledModels: "",
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sites.length };
    for (const s of sites) counts[s.status] = (counts[s.status] || 0) + 1;
    return counts;
  }, [sites]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sortManagementRows(sites).filter((s) => {
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.adapter.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, sites]);

  const openCreate = () => {
    setDrawerMode("create");
    setForm({ name: "", slug: "", adapter: "new-api", url: "", region: "", status: "healthy", note: "", enabled: true, customHeaders: "", proxyUrl: "", useSystemProxy: false, weight: "1.0", pinned: false, disabledModels: "" });
    setDrawer({ id: 0 });
  };

  const openEdit = (site: Site) => {
    setDrawerMode("edit");
    setForm({
      name: site.name,
      slug: site.slug,
      adapter: site.adapter,
      url: site.url,
      region: site.region,
      status: site.status,
      note: site.note,
      enabled: site.enabled,
      customHeaders: site.customHeaders && typeof site.customHeaders === "object"
        ? JSON.stringify(site.customHeaders)
        : "",
      proxyUrl: site.proxyUrl ?? "",
      useSystemProxy: site.useSystemProxy ?? false,
      weight: String(site.globalWeight ?? 1),
      pinned: site.isPinned ?? false,
      disabledModels: "",
    });
    setDrawer(site);
  };

  const [saving, setSaving] = useState(false);
  const [batchIds, setBatchIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState<Record<string, boolean>>({});

  const toggleBatch = (id: number) => {
    setBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBatch = async (action: "enable" | "disable" | "delete" | 'enableSystemProxy' | 'disableSystemProxy') => {
    const ids = Array.from(batchIds);
    if (!ids.length) return;
    if (action === "delete" && !window.confirm(`Delete ${ids.length} site(s)? This cannot be undone.`)) return;
    setBatchBusy((b) => ({ ...b, [action]: true }));
    try {
      const outcome = batchOutcome(await apiPost<BatchResponse>('/api/sites/batch', { ids, action }));
      showToast(`${l('success')}: ${outcome.succeeded}; ${l('failed')}: ${outcome.failedIds.length}${outcome.messages.length ? ` — ${outcome.messages.join('; ')}` : ''}`);
      setBatchIds(new Set(outcome.failedIds));
      const data = await fetchSites();
      setSites(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.routes.batch_op_failed"));
    } finally {
      setBatchBusy((b) => ({ ...b, [action]: false }));
    }
  };

  // Build the backend payload from the form. The API expects backend field
  // names (name/url/platform/status), not the UI Site display shape.
  const buildSitePayload = (forCreate: boolean) => ({
    name: form.name.trim(),
    url: form.url.trim(),
    // Always send the platform — the backend falls back to URL detection only
    // when platform is absent, and an undetectable URL then returns 400.
    platform: form.adapter,
    status: form.enabled ? ("active" as const) : ("disabled" as const),
    note: form.note.trim() || undefined,
    isPinned: form.pinned,
    // Preserve the existing sortOrder on edit (create defaults to 0).
    sortOrder: forCreate ? 0 : (drawer?.sortOrder ?? 0),
    globalWeight: parseFloat(form.weight) || 1,
    // Advanced fields that the form exposes.
    ...(form.proxyUrl.trim() ? { proxyUrl: form.proxyUrl.trim() } : { proxyUrl: null }),
    useSystemProxy: form.useSystemProxy,
    ...(form.customHeaders.trim()
      ? (() => {
        try {
          return { customHeaders: JSON.parse(form.customHeaders), customHeadersOverrideRequestHeaders: false };
        } catch {
          return {};
        }
      })()
      : { customHeaders: null, customHeadersOverrideRequestHeaders: false }),
  });

  // Load disabled models when editing a site so the field reflects reality
  // and an empty input clears the old list.
  useEffect(() => {
    let cancelled = false;
    setDisabledLoaded(false);
    if (drawerMode === "edit" && drawer?.id) {
      fetchSiteDisabledModels(drawer.id)
        .then((models) => { if (!cancelled) { setForm((prev) => ({ ...prev, disabledModels: (models ?? []).join(", ") })); setDisabledLoaded(true); } })
        .catch((err) => { if (!cancelled) showToast(err instanceof Error ? err.message : l('loadFailed')); });
    } else if (drawerMode === "create") {
      setForm((prev) => ({ ...prev, disabledModels: "" }));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerMode, drawer?.id]);

  const handleDetect = async () => {
    if (!form.url.trim()) return;
    try {
      const info = await detectSite(form.url.trim());
      if (info?.platform) {
        setForm((prev) => ({ ...prev, adapter: info.platform!, name: prev.name || info.name || "" }));
      } else if (info?.name) {
        setForm((prev) => ({ ...prev, name: prev.name || info.name || "" }));
      }
      showToast(t("ui.sites.detected"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.sites.detection_failed"));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      showToast(t("ui.sites.err_required"));
      return;
    }
    setSaving(true);
    try {
      if (drawerMode === "create") {
        const created = await createSite(buildSitePayload(true));
        setCreatedSite(created);
      } else if (drawer?.id) {
        await updateSite(drawer.id, buildSitePayload(false));
        // Always persist disabled-models so an empty input clears the old list.
        const models = form.disabledModels.split(",").map((m) => m.trim()).filter(Boolean);
        if (disabledLoaded) await updateSiteDisabledModels(drawer.id, models);
      }
      showToast(drawerMode === "create" ? t("ui.sites.created") : t("ui.sites.saved"));
      setDrawer(null);
      const data = await fetchSites();
      setSites(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!drawer?.id) return;
    if (!window.confirm(`Delete site "${form.name}"? This cannot be undone.`)) return;
    try {
      await deleteSite(drawer.id);
      showToast(t("ui.sites.deleted"));
      setDrawer(null);
      const data = await fetchSites();
      setSites(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.delete_failed"));
    }
  };

  const handleProbe = async () => {
    if (!drawer?.id) return;
    try {
      await probeSiteNow(drawer.id, { scope: "single" });
      showToast(t("ui.sites.probe_ok", { name: form.name }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.monitor.probe_failed"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("ui.sites.eyebrow")}
        title={t("ui.sites.title")}
        description={t("ui.sites.desc")}
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex h-9 items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            <Plus size={14} />
            {t("ui.sites.add")}
          </button>
        }
      />

      {createdSite && <div className="card flex flex-wrap gap-3 p-4"><span>{createdSite.name}</span><Link to={`/app/accounts?create=1&siteId=${createdSite.id}`}>{l('addAccount')}</Link><button onClick={() => setCreatedSite(null)}>{l('cancel')}</button></div>}
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("ui.sites.filter.all")} value={statusCounts.all ?? 0} icon={<Server size={16} />} />
        <StatCard label={t("ui.sites.filter.healthy")} value={statusCounts.healthy ?? 0} trend={{ label: "online", tone: "lime" }} icon={<CheckCircle2 size={16} />} />
        <StatCard label={t("ui.sites.filter.degraded")} value={(statusCounts.degraded ?? 0) + (statusCounts.unhealthy ?? 0)} trend={{ label: "attention", tone: "amber" }} icon={<ShieldAlert size={16} />} />
        <StatCard label={t("ui.sites.filter.disabled")} value={statusCounts.disabled ?? 0} trend={{ label: "offline", tone: "muted" }} icon={<XCircle size={16} />} />
      </div>

      {/* Search + filter */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchField label={t("ui.sites.search_ph")} placeholder={t("ui.sites.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md flex-1" />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "healthy", "degraded", "disabled"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                statusFilter === s
                  ? "border-[color:var(--color-border-bright)] bg-[color:var(--color-panel)] text-[color:var(--color-fg)]"
                  : "border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              }`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${s === "all" ? "bg-[color:var(--color-lime)]" : STATUS_TONES[s] === "lime" ? "bg-[color:var(--color-lime)]" : STATUS_TONES[s] === "amber" ? "bg-[color:var(--color-amber)]" : "bg-[color:var(--color-muted)]"}`} />
              {t(`ui.sites.filter.${s}`)}
              <span className="ml-0.5 text-[color:var(--color-lime)]">{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Batch action bar */}
      {batchIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3">
          <span className="chip chip-lime">{batchIds.size} {t("ui.sites.selected")}</span>
          <button type="button" onClick={() => runBatch("enable")} disabled={batchBusy.enable}
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40">
            {batchBusy.enable ? "…" : t("ui.common.enable")}
          </button>
          <button type="button" onClick={() => runBatch("disable")} disabled={batchBusy.disable}
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40">
            {batchBusy.disable ? "…" : t("ui.common.disable")}
          </button>
          <button type="button" onClick={() => runBatch("delete")} disabled={batchBusy.delete}
            className="rounded-md border border-[color:var(--color-rose)]/40 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10 disabled:opacity-40">
            {batchBusy.delete ? "…" : t("ui.common.delete")}
          </button>
          {(['enableSystemProxy', 'disableSystemProxy'] as const).map(action => <button key={action} disabled={Object.values(batchBusy).some(Boolean)} onClick={() => runBatch(action)} className="rounded border px-3 py-2">{l(action === 'enableSystemProxy' ? 'systemProxyOn' : 'systemProxyOff')}</button>)}
          <button type="button" onClick={() => setBatchIds(new Set())}
            className="ml-auto rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
            CLEAR
          </button>
        </div>
      )}

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState title={t("ui.sites.empty")} description={t("ui.sites.empty_desc")} icon={<Server size={18} />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((site) => {
            const adapterColor = ADAPTER_COLORS[site.adapter] || "#c8ff2e";
            return (
              <article
                key={site.id}
                className="card group relative overflow-hidden p-5 text-left transition-all hover:border-[color:var(--color-border-bright)]"
              >
                <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${adapterColor}, transparent)` }} />
                <input
                  type="checkbox"
                  checked={batchIds.has(site.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleBatch(site.id)}
                  className="absolute right-3 top-3 h-3.5 w-3.5 accent-[color:var(--color-lime)]"
                  aria-label={`Select ${site.name}`}
                />
                <div className="flex items-start justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]" style={{ color: adapterColor }}>
                      <Server size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display text-lg tracking-tight text-[color:var(--color-fg)]">{site.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-[color:var(--color-muted)]">
                        <Globe size={11} /> {site.region}
                        <span className="text-[color:var(--color-border-bright)]">·</span>
                        {ADAPTER_NAMES[site.adapter] || site.adapter}
                      </div>
                    </div>
                  </div>
                  <span className={`mr-5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wider ${
                    site.status === "healthy"
                      ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                      : site.status === "degraded"
                        ? "bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)]"
                        : site.status === "unhealthy"
                          ? "bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]"
                          : "bg-[color:var(--color-muted)]/10 text-[color:var(--color-muted)]"
                  }`}>
                    {site.enabled ? (
                      <Radio size={10} />
                    ) : (
                      <XCircle size={10} />
                    )}
                    {site.status}
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <span className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">
                      {t("ui.sites.card.balance")}
                    </span>
                    <div className="mt-0.5 font-display text-2xl text-[color:var(--color-fg)]">${site.balance.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">
                      {t("ui.sites.card.accounts")}
                    </span>
                    <div className="mt-0.5 font-mono text-lg text-[color:var(--color-fg)]">{site.accounts}</div>
                  </div>
                </div>

                {site.note && (
                  <p className="mt-3 truncate text-xs text-[color:var(--color-muted)]">{site.note}</p>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <span className="truncate font-mono text-[10px] text-[color:var(--color-muted)]">{site.url}</span>
                  <Pencil size={12} className="shrink-0 text-[color:var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="mt-3 flex flex-wrap gap-3"><button onClick={() => openEdit(site)}>{l('edit')}</button><button disabled={saving} onClick={async () => { setSaving(true); try { await updateSite(site.id, { isPinned: !site.isPinned }); setSites(await fetchSites()); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setSaving(false); } }}>{l('pin')}</button>{(['up', 'down'] as const).map(direction => <button key={direction} disabled={saving} onClick={async () => { setSaving(true); try { await Promise.all(buildOrderUpdates(sites, site.id, direction).map(update => updateSite(update.id, { sortOrder: update.sortOrder }))); setSites(await fetchSites()); } catch(e) { showToast(e instanceof Error ? e.message : l('saveFailed')); } finally { setSaving(false); } }}>{l(direction)}</button>)}</div>
              </article>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-[color:var(--color-ink)]/70 backdrop-blur-sm" onClick={() => setDrawer(null)} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-graphite)]">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
              <div>
                <h2 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                  {drawerMode === "create" ? t("ui.sites.drawer.new") : t("ui.sites.drawer.edit")}
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">{t("ui.sites.drawer.subtitle")}</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 p-5">
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.name")}</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    placeholder="New API · Hong Kong"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.slug")}</span>
                    <input
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      disabled={drawerMode === "edit"}
                      placeholder="new-api-hk"
                      className={`h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50 disabled:opacity-50 ${drawerMode === "edit" ? "cursor-not-allowed" : ""}`}
                    />
                    <span className="mt-1 block font-mono text-[9px] text-[color:var(--color-muted)]">{t("ui.sites.field.slug_hint")}</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.adapter")}</span>
                    <select
                      value={form.adapter}
                      onChange={(e) => setForm({ ...form, adapter: e.target.value })}
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    >
                      {Object.keys(ADAPTER_NAMES).map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.url")}</span>
                    <div className="flex gap-2">
                      <input
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                        placeholder="https://api.example.com/v1"
                      />
                      <button
                        type="button"
                        onClick={handleDetect}
                        disabled={!form.url.trim()}
                        className="h-9 shrink-0 rounded-lg border border-[color:var(--color-border)] px-2.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40"
                      >
                        {t("ui.sites.detect")}
                      </button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.region")}</span>
                    <input
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                      placeholder="hkg-1"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.status")}</span>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as SiteStatus })}
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    >
                      <option value="healthy">{t("ui.status.healthy")}</option>
                      <option value="degraded">{t("ui.status.degraded")}</option>
                      <option value="unhealthy">{t("ui.sites.unhealthy")}</option>
                      <option value="disabled">{t("ui.status.disabled")}</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pb-1">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                      className="accent-[color:var(--color-lime)]"
                    />
                    <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.sites.drawer.enabled_hint")}</span>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.field.note")}</span>
                  <textarea
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder={t("ui.sites.field.note_ph")}
                    className="h-16 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  />
                  <span className="mt-1 block font-mono text-[9px] text-[color:var(--color-muted)]">{t("ui.sites.field.note_hint")}</span>
                </label>
              </div>

              {/* Advanced site settings */}
              <div className="space-y-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/30 p-4">
                <div className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-lime)]">{t("ui.sites.advanced")}</div>

                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.adv_headers")}</span>
                  <textarea
                    value={form.customHeaders}
                    onChange={(e) => setForm({ ...form, customHeaders: e.target.value })}
                    placeholder='{"X-API-Version": "2024-01"}'
                    className="h-14 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.adv_proxy_url")}</span>
                    <input
                      value={form.proxyUrl}
                      onChange={(e) => setForm({ ...form, proxyUrl: e.target.value })}
                      placeholder="http://proxy.internal:8080"
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.adv_weight")}</span>
                    <input
                      value={form.weight}
                      onChange={(e) => setForm({ ...form, weight: e.target.value })}
                      placeholder="1.0"
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.useSystemProxy}
                      onChange={(e) => setForm({ ...form, useSystemProxy: e.target.checked })}
                      className="accent-[color:var(--color-lime)]"
                    />
                    <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.sites.adv_sys_proxy")}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                      className="accent-[color:var(--color-amber)]"
                    />
                    <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.sites.adv_pinned")}</span>
                  </label>
                </div>

                {drawerMode === 'edit' && drawer.id && disabledLoaded && <SiteModelsChooser key={drawer.id} siteId={drawer.id} value={form.disabledModels} onChange={disabledModels => setForm(prev => ({ ...prev, disabledModels }))} />}
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.sites.adv_disabled_models")}</span>
                  <input
                    value={form.disabledModels}
                    onChange={(e) => setForm({ ...form, disabledModels: e.target.value })}
                    placeholder="gpt-4o, gpt-4o-mini"
                    className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  />
                </label>
              </div>

              {/* Readonly metadata (edit mode) */}
              {drawerMode === "edit" && drawer?.balance !== undefined && (
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 p-4">
                  <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.sites.readonly")}</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="font-mono text-[10px] text-[color:var(--color-muted)]">{t("ui.sites.ro.accounts")}</span>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-[color:var(--color-fg)]">{drawer.accounts}</div>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] text-[color:var(--color-muted)]">{t("ui.sites.ro.balance")}</span>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-[color:var(--color-fg)]">${drawer.balance?.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="sticky bottom-0 flex items-center justify-between border-t border-[color:var(--color-border)] bg-[color:var(--color-graphite)] px-5 py-4">
              <div className="flex gap-2">
                {drawerMode === "edit" && (
                  <>
                    <button
                      type="button"
                      onClick={handleProbe}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {t("ui.sites.probe")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="rounded-lg border border-[color:var(--color-rose)]/40 px-3 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10"
                    >
                      {t("ui.common.delete")}
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDrawer(null)}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                  {t("ui.common.cancel")}
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="rounded-lg bg-[color:var(--color-lime)] px-4 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">
                  {saving ? "SAVING…" : t("ui.common.save")}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper icon for ExternalLink fallback (already imported lucide ExternalLink)