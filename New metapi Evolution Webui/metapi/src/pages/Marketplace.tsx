import { useMemo, useState } from "react";
import { Box, Boxes, Search, Store } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { MODELS, type Model } from "../data/prototype";

const STATUS_TONES: Record<Model["status"], string> = {
  available: "lime",
  preview: "cyan",
  deprecated: "rose",
};

const PROVIDERS = [...new Set(MODELS.map((m) => m.provider))];

export default function Marketplace() {
  const t = useUiText();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<"all" | string>("all");
  const [status, setStatus] = useState<"all" | Model["status"]>("all");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return MODELS.filter((model) => {
      const matchSearch = !q ||
        model.name.toLowerCase().includes(q) ||
        model.family.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q) ||
        model.description.toLowerCase().includes(q);
      const matchProvider = provider === "all" || model.provider === provider;
      const matchStatus = status === "all" || model.status === status;
      return matchSearch && matchProvider && matchStatus;
    });
  }, [query, provider, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Federation"
        title={t("ui.models.marketplace_title")}
        description={t("ui.models.marketplace_desc")}
        actions={
          <button type="button" onClick={() => showToast("Marketplace refreshed (prototype).")}
            className="flex h-9 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]">
            <RefreshCw size={13} /> REFRESH
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("ui.playground.models_label")} value={MODELS.length} icon={<Boxes size={16} />} />
        <StatCard label={t("ui.models.providers")} value={PROVIDERS.length} detail={PROVIDERS.join(", ")} icon={<Store size={16} />} />
        <StatCard label={t("ui.models.available")} value={MODELS.filter((m) => m.status === "available").length} icon={<Box size={16} />} />
        <StatCard label={t("ui.models.preview")} value={MODELS.filter((m) => m.status === "preview").length} icon={<Box size={16} />} />
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchField label={t("ui.models.search_models")} placeholder={t("ui.models.search_models_ph")} value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-md flex-1" />
        <div className="flex gap-1.5">
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50">
            <option value="all">{t("ui.models.all_providers")}</option>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | Model["status"])}
            className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50">
            <option value="all">{t("ui.models.all_statuses")}</option>
            <option value="available">{t("ui.models.available")}</option>
            <option value="preview">{t("ui.models.preview")}</option>
            <option value="deprecated">{t("ui.status.deprecated")}</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("ui.models.no_match")} description={t("ui.models.no_match_desc")} icon={<Boxes size={18} />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((model) => (
            <div key={model.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">{model.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] uppercase">{model.provider} · {model.family}</div>
                </div>
                <span className={`chip ${STATUS_TONES[model.status]}`}>{model.statusLabel}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-2.5 text-xs">
                <div>
                  <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.input")}</span>
                  <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">${model.inputPricePerMillion.toFixed(2)}</div>
                </div>
                <div>
                  <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.playground.output")}</span>
                  <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">${model.outputPricePerMillion.toFixed(2)}</div>
                </div>
                <div>
                  <span className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.models.context")}</span>
                  <div className="mt-0.5 font-mono text-[color:var(--color-fg)]">{(model.contextWindow / 1000).toFixed(0)}k</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RefreshCw({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
