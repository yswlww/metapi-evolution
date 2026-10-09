import { useEffect, useState } from 'react';
import { useManagementText } from '../../lib/managementParityText';
import { buildPolicyRestrictions, parseSiteWeightDraft, type CredentialRef } from '../../lib/managementParity';
import CredentialExclusions from './CredentialExclusions';
import { DOWNSTREAM_KEYS as PROTOTYPE_KEYS, MODELS } from '../../data/prototype';
import { EditDrawer, Field, TextInput, TextArea, Toggle } from '../../components/EditDrawer';
import { useUiText } from '../../i18n/useUiText';
import { useToast } from '../../components/Toast';
import { DATA_MODE, createDownstreamApiKey, updateDownstreamApiKey, fetchModelsMarketplace, fetchRoutes, fetchSites } from '../../lib/source';


const MODEL_OPTIONS = MODELS.map(m => ({ name: m.name, family: m.family }));
type ManagedKey = (typeof PROTOTYPE_KEYS)[number] & { excludedCredentialRefs?: CredentialRef[]; enabled?: boolean };

export default function KeyDrawer({
  mode,
  keysSource,
  onClose,
  onFlash,
  onSaved,
}: {
  mode: "create" | { id: string };
  keysSource: ManagedKey[];
  onClose: () => void;
  onFlash: (msg: string) => void;
  onSaved: () => Promise<void>;
}) {
  const t = useUiText();
  const l = useManagementText();
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
  const [enabled, setEnabled] = useState(key ? key.enabled ?? key.status === 'active' : true);
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
  const [excludedCredentials, setExcludedCredentials] = useState<CredentialRef[]>(key?.excludedCredentialRefs ?? []);
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

  const toggleModel = (m: string) => setSelectedModels((p) => { const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const toggleRoute = (r: string) => setSelectedRoutes((p) => { const n = new Set(p); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const toggleExcludedSite = (id: number) => setExcludedSiteIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filteredModels = [...new Set([...catalogModels, ...selectedModels])]
    .map((name) => ({ name, family: name.split(/[-_/]/)[0] ?? name }))
    .filter(
      (m) => !modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.family.toLowerCase().includes(modelSearch.toLowerCase()),
    );
  const filteredRoutes = routeOptions.filter((r) => !routeSearch || r.label.toLowerCase().includes(routeSearch.toLowerCase()));

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        name: (name || key?.name) ?? "",
        key: tokenKey,
        description: description || null,
        groupName: groupName || null,
        tags,
        enabled,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxCost: maxCost ? Number(maxCost) : null,
        maxRequests: maxRequests ? Number(maxRequests) : null,
        supportedModels: Array.from(selectedModels),
        ...buildPolicyRestrictions(selectedRoutes, excludedSiteIds, excludedCredentials),
        siteWeightMultipliers: parseSiteWeightDraft(siteWeightsText),
      };
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
      showToast(err instanceof SyntaxError || (err instanceof Error && err.message === 'Invalid site weights') ? l('invalid') : err instanceof Error ? err.message : t('ui.toast.save_failed'));
    } finally {
      setSaving(false);
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
          <button type="button" onClick={handleSave} disabled={saving}
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
            <button type="button" className="ml-2 text-xs underline" onClick={() => setSelectedModels(new Set())}>{l('clear')}</button>
            <TextInput value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder={t("ui.keys.search_models")} className="mt-2" />
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
              {!catalogLoaded ? (
                <p className="text-xs text-[color:var(--color-muted)]">{t("ui.keys.loading_catalog")}</p>
              ) : catalogModels.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">
                  {l('catalogEmpty')}
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
            <button type="button" className="mb-2 text-xs underline" onClick={() => setSelectedRoutes(new Set())}>{l('clear')}</button>
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
            <button type="button" className="mb-2 text-xs underline" onClick={() => setExcludedSiteIds(new Set())}>{l('clear')}</button>
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

          <CredentialExclusions value={excludedCredentials} onChange={setExcludedCredentials} />
        </div>
      )}
    </EditDrawer>
  );
}