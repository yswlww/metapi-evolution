import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Box, Boxes, Layers, RefreshCw, Table as TableIcon, LayoutGrid } from "lucide-react";
import { MODELS, type ModelStatus } from "../data/prototype";
import { mapMarketplaceModel, uniqueAccountCount as countAccounts, formatSuccessRate, formatPrice, type MarketplaceModel as Model, type MarketplaceRow } from "./observability/marketplace";
import { useObservationLabels } from "./observability/labels";
import { getBrand } from "../../../../src/server/shared/modelBrand";
import { mergeMarketplaceMetadata } from "../../../../src/web/pages/helpers/modelsMarketplaceMetadata";
import PageHeader from "../components/PageHeader";
import {
  EmptyState,
  SearchField,
  SectionTitle,
  StatCard,
} from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import ModelMetadata from "./observability/ModelMetadata";
import { DATA_MODE, fetchModelsMarketplace } from "../lib/source";

const STATUS_TONES: Record<ModelStatus, string> = {
  available: "lime",
  preview: "cyan",
  deprecated: "rose",
};

type SortKey = "name" | "accountCount" | "tokenCount" | "avgLatency" | "successRate";
type SortDir = "asc" | "desc";
type ViewMode = "card" | "table";


export default function Models() {
  const t = useUiText();
  const l = useObservationLabels();
  const requestId = useRef(0);
  const { search: locationSearch } = useLocation();
  const focusedName = new URLSearchParams(locationSearch).get("focusModel")?.trim() ?? "";
  const [brandFilter, setBrandFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const { showToast } = useToast();
  const [query, setQuery] = useState(focusedName);
  const [provider, setProvider] = useState<"all" | string>("all");
  const [status, setStatus] = useState<"all" | ModelStatus>("all");
  const [sortBy, setSortBy] = useState<SortKey>("accountCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [models, setModels] = useState<Model[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Provider/brand lists derived from the loaded models (real site names in
  // API mode) instead of the prototype catalog.
  const providersList = useMemo(() => [...new Set(models.flatMap((m) => m.siteOverrides.map((a) => a.siteName)))], [models]);
  const brandsList = useMemo(() => [...new Set(models.map((m) => m.brand))], [models]);

  const reload = async (refresh = false) => {
    const id = ++requestId.current;
    if (DATA_MODE === "prototype") {
      setModels(MODELS.map((m) => ({ ...m, pricingSources: [], successRate: m.successRate == null ? null : m.successRate * 100 })));
      return;
    }
    setRefreshing(true);
    try {
      const base = await fetchModelsMarketplace({ refresh, includePricing: false });
      if (id !== requestId.current) return;
      const normalize = (rows: MarketplaceRow[]) => rows.map((raw) => ({ ...mapMarketplaceModel(raw), brand: getBrand(raw.name)?.name ?? "" }));
      const baseRows = base.models as MarketplaceRow[];
      setModels(normalize(baseRows));
      // Hydrate all prices/metadata; keep the fast base list on enrichment failure.
      try {
        const detailed = await fetchModelsMarketplace({ includePricing: true });
        if (id !== requestId.current) return;
        const shape = (r: MarketplaceRow) => ({ ...r, description: r.description ?? null, tags: r.tags ?? [], supportedEndpointTypes: r.supportedEndpointTypes ?? [], pricingSources: r.pricingSources ?? [] });
        setModels(normalize(mergeMarketplaceMetadata(baseRows.map(shape), (detailed.models as MarketplaceRow[]).map(shape))));
      } catch (err) {
        if (id === requestId.current) showToast(err instanceof Error ? err.message : t("ui.models.err_load"));
      }
      if (refresh && id === requestId.current) showToast(l("Model refresh requested", "已請求模型刷新", "已请求模型刷新"));
    } catch (err) {
      if (id === requestId.current) showToast(err instanceof Error ? err.message : t("ui.models.err_load"));
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  };

  useEffect(() => { reload(false); return () => { requestId.current++; }; }, []);
  useEffect(() => {
    setQuery(focusedName);
    if (focusedName) { setBrandFilter("all"); setProvider("all"); setStatus("all"); setPage(1); }
  }, [focusedName]);
  useEffect(() => {
    if (!focusedName || query !== focusedName || typeof document === "undefined") return;
    const node = [...document.querySelectorAll<HTMLElement>("[data-model-name]")].find((element) => element.dataset.modelName === focusedName);
    node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    node?.focus({ preventScroll: true });
  }, [focusedName, query, models, viewMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = models.filter((model) => {
      if (focusedName && query === focusedName && model.name !== focusedName) return false;
      const matchesQuery =
        q.length === 0 ||
        [model.name, model.family, model.brand, model.provider, ...model.capabilities, ...model.tags, model.description]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesProvider = provider === "all" || model.siteOverrides.some((a) => a.siteName === provider);
      const matchesBrand = brandFilter === "all" || model.brand === brandFilter;
      const matchesStatus = status === "all" || model.status === status;
      return matchesQuery && matchesProvider && matchesBrand && matchesStatus;
    });

    // Sort
    list.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortBy) {
        case "name":
          va = a.name; vb = b.name;
          break;
        case "accountCount":
          va = a.accountCount; vb = b.accountCount;
          break;
        case "tokenCount":
          va = a.tokenCount; vb = b.tokenCount;
          break;
        case "avgLatency":
          va = a.avgLatency ?? Infinity; vb = b.avgLatency ?? Infinity;
          break;
        case "successRate":
          va = a.successRate ?? -1; vb = b.successRate ?? -1;
          break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [query, focusedName, provider, brandFilter, status, sortBy, sortDir, models]);
  useEffect(() => setPage(1), [query, provider, brandFilter, status, sortBy, sortDir]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage((p) => Math.min(p, pages)), [pages]);

  // Group by brand for card view
  const grouped = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const model of pageRows) {
      const brand = model.brand || t("ui.models.unbranded");
      if (!map.has(brand)) map.set(brand, []);
      map.get(brand)!.push(model);
    }
    return Array.from(map.entries());
  }, [filtered, page, t]);

  const summary = useMemo(() => {
    const available = models.filter((m) => m.status === "available").length;
    const preview = models.filter((m) => m.status === "preview").length;
    const sites = new Set(models.flatMap((m) => m.siteOverrides.map((s) => s.siteName))).size;
    return { available, preview, sites };
  }, [models]);

  const uniqueAccountCount = useMemo(() => countAccounts(models), [models]);

  const fmtLatency = (ms: number | null) => ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  const fmtSuccess = formatSuccessRate;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.models.eyebrow")}
        title={t("ui.models.title")}
        description={t("ui.models.desc")}
        actions={
          <button
            type="button"
            onClick={() => reload(true)}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> {refreshing ? l("Loading…", "載入中…", "加载中…") : t("ui.models.refresh")}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.models.models")}
          value={models.length}
          detail={t("ui.models.available_count", { n: summary.available })}
          icon={<Boxes size={16} />}
        />
        <StatCard
          label={t("ui.models.preview")}
          value={summary.preview}
          trend={{ label: t("ui.models.new_capabilities"), tone: "cyan" }}
          icon={<Box size={16} />}
        />
        <StatCard
          label={t("ui.models.accounts")}
          value={uniqueAccountCount}
          detail={`${models.reduce((a, m) => a + m.accountCount, 0)} ${t("ui.models.accounts")}`}
          icon={<Boxes size={16} />}
        />
        <StatCard
          label={t("ui.models.sites")}
          value={summary.sites}
          detail={t("ui.models.with_overrides")}
          icon={<Layers size={16} />}
        />
      </div>

      <section className="space-y-4">
        <SectionTitle
          title={t("ui.models.catalog")}
          description={t("ui.models.catalog_desc")}
          eyebrow={t("ui.models.catalog")}
          actions={
            <div className="flex items-center gap-2">
              <span className="chip chip-lime">{t("ui.common.rows", { n: filtered.length })} / {models.length}</span>
              <button
                type="button"
                onClick={() => setViewMode(viewMode === "card" ? "table" : "card")}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] px-2.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                aria-label={viewMode === "card" ? t("ui.models.view_table") : t("ui.models.view_card")}
              >
                {viewMode === "card" ? <TableIcon size={13} /> : <LayoutGrid size={13} />}
                {viewMode === "card" ? t("ui.models.view_table") : t("ui.models.view_card")}
              </button>
            </div>
          }
        />

        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3 sm:flex-row sm:items-center">
          <SearchField
            label={t("ui.models.search_ph")}
            placeholder={t("ui.models.search_ph")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={l("Brand", "品牌")} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 text-xs">
              <option value="all">{l("All brands", "全部品牌")}</option>
              {brandsList.map((b) => <option key={b} value={b}>{b || t("ui.models.unbranded")}</option>)}
            </select>
            <select
              aria-label={t("ui.models.filter_provider")}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              <option value="all">{t("ui.models.all_providers")}</option>
              {providersList.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              aria-label={t("ui.models.filter_status")}
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | ModelStatus)}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              <option value="all">{t("ui.models.all_statuses")}</option>
              <option value="available">{t("ui.models.available")}</option>
              <option value="preview">{t("ui.models.preview")}</option>
              <option value="deprecated">{t("ui.status.deprecated")}</option>
            </select>
            <select
              aria-label={t("ui.models.sort_by")}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              <option value="name">{t("ui.models.sort_name")}</option>
              <option value="accountCount">{t("ui.models.sort_accounts")}</option>
              <option value="successRate">{t("ui.models.sort_success")}</option>
              <option value="avgLatency">{t("ui.models.sort_latency")}</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            >
              {sortDir === "asc" ? t("ui.models.sort_dir_asc") : t("ui.models.sort_dir_desc")}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title={t("ui.models.empty_title")} description={t("ui.models.empty_desc")} icon={<Boxes size={18} />} />
        ) : viewMode === "card" ? (
          <div className="space-y-6">
            {grouped.map(([brand, brandModels]) => (
              <div key={brand}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="chip chip-cyan">{brand}</span>
                  <span className="font-mono text-[10px] text-[color:var(--color-muted)]">{brandModels.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {brandModels.map((model) => (
                    <ModelCard key={model.id} model={model} t={t} showToast={showToast} fmtLatency={fmtLatency} fmtSuccess={fmtSuccess} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.col_model")}</th>
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.col_status")}</th>
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.col_accounts")}</th>
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.col_success")}</th>
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.col_latency")}</th>
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.input_1m")}</th>
                    <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.models.output_1m")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((model) => (
                    <tr key={model.id} data-model-name={model.name} tabIndex={-1} className="border-b border-[color:var(--color-border)]/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[color:var(--color-fg)]">{model.name}</div>
                        <div className="font-mono text-[10px] text-[color:var(--color-muted)]">{model.brand} · {model.family}</div>
                        {model.description && <div className="mt-0.5 text-[10px] leading-4 text-[color:var(--color-muted)] line-clamp-1">{model.description}</div>}
                        <ModelMetadata model={model} />
                      </td>
                      <td className="px-4 py-3"><span className={`chip chip-${STATUS_TONES[model.status]}`}>{model.status === "available" ? t("ui.models.status_available") : model.status === "preview" ? t("ui.models.preview") : t("ui.status.deprecated")}</span></td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-[color:var(--color-fg)]">{model.accountCount}</span></td>
                      <td className="px-4 py-3"><span className={`font-mono text-xs ${model.successRate != null && model.successRate < 95 ? "text-[color:var(--color-rose)]" : "text-[color:var(--color-fg)]"}`}>{fmtSuccess(model.successRate)}</span></td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-[color:var(--color-muted)]">{fmtLatency(model.avgLatency)}</span></td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-[color:var(--color-fg)]">{formatPrice(model.inputPricePerMillion)}</span></td>
                      <td className="px-4 py-3"><span className="font-mono text-xs text-[color:var(--color-fg)]">{formatPrice(model.outputPricePerMillion)}</span></td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(model.name).then(() => showToast(t("ui.models.copied")))}
                          className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                        >
                          {t("ui.models.copy_name")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mobile card fallback for table mode */}
        {viewMode === "table" && (
          <div className="space-y-3 lg:hidden">
            {pageRows.map((model) => (
              <ModelCard key={model.id} model={model} t={t} showToast={showToast} fmtLatency={fmtLatency} fmtSuccess={fmtSuccess} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{l("Previous", "上一頁", "上一页")}</button>
          <span>{page} / {pages} · {filtered.length}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{l("Next", "下一頁", "下一页")}</button>
        </div>
      </section>
    </div>
  );
}

function ModelCard({
  model,
  t,
  showToast,
  fmtLatency,
  fmtSuccess,
}: {
  model: Model;
  t: (key: string) => string;
  showToast: (msg: string) => void;
  fmtLatency: (ms: number | null) => string;
  fmtSuccess: (r: number | null) => string;
}) {
  return (
    <div className="card p-4" data-model-name={model.name} tabIndex={-1}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">{model.name}</h3>
          <div className="mt-0.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] uppercase">
            {model.provider} · {model.family}
          </div>
        </div>
        <span className={`chip chip-${STATUS_TONES[model.status]}`}>{model.status === "available" ? t("ui.models.status_available") : model.status === "preview" ? t("ui.models.preview") : t("ui.status.deprecated")}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {model.modalities.map((m) => (
          <span key={m} className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)]">
            {m}
          </span>
        ))}
        {model.capabilities.map((c) => (
          <span key={c} className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)]">
            {c}
          </span>
        ))}
      </div>

      {model.description && (
        <p className="mt-2 text-xs leading-5 text-[color:var(--color-muted)] line-clamp-2">{model.description}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-2.5 text-xs">
        <div>
          <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.input_1m")}</span>
          <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{formatPrice(model.inputPricePerMillion)}</div>
        </div>
        <div>
          <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.output_1m")}</span>
          <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{formatPrice(model.outputPricePerMillion)}</div>
        </div>
        <div>
          <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.context")}</span>
          <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{model.contextWindow == null ? "—" : `${(model.contextWindow / 1000).toFixed(0)}k`}</div>
        </div>
        <div>
          <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.accounts")}</span>
          <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{model.accountCount} · {model.tokenCount} {t("ui.models.tokens")}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-2.5 text-xs">
        <div>
          <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.latency")}</span>
          <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{fmtLatency(model.avgLatency)}</div>
        </div>
        <div>
          <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.success")}</span>
          <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{fmtSuccess(model.successRate)}</div>
        </div>
      </div>

      {model.siteOverrides.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">
            {t("ui.models.site_overrides")}
          </div>
          <div className="space-y-1">
            {model.siteOverrides.map((site) => (
              <div key={site.id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="flex items-center gap-1.5 text-[color:var(--color-fg)]">
                  <span className={`h-1.5 w-1.5 rounded-full ${site.enabled ? "bg-[color:var(--color-lime)]" : "bg-[color:var(--color-muted)]"}`} />
                  {site.siteName}
                </span>
                <span className="font-mono text-[color:var(--color-muted)]">{formatPrice(site.inputPricePerMillion)} / {formatPrice(site.outputPricePerMillion)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ModelMetadata model={model} />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(model.name).then(() => showToast(t("ui.models.copied")))}
          className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
        >
          {t("ui.models.copy_name")}
        </button>
      </div>
    </div>
  );
}
