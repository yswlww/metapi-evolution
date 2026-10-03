import { useEffect, useState } from "react";
import {
  Database,
  Globe,
  Key,
  Radio,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import { useUiText } from "../../i18n/useUiText";
import { useToast } from "../../components/Toast";
import { Toggle, TextInput, TextArea } from "../../components/EditDrawer";
import {
  testSystemProxy,
  fetchRuntimeSettings,
  updateRuntimeSettings,
  clearRuntimeCache,
  clearUsageData,
  migrateExternalDatabase,
  testExternalDatabaseConnection,
  factoryReset,
} from "../../lib/source";

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-lime)]">
        {title}
      </div>
      {desc && <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ActionBtn({
  label,
  tone = "default",
  onClick,
  disabled,
}: {
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3.5 py-1.5 font-mono text-[11px] tracking-wider transition-colors disabled:opacity-40 ${
        tone === "danger"
          ? "border-[color:var(--color-rose)]/40 text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10"
          : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]"
      }`}
    >
      {label}
    </button>
  );
}

export default function SettingsAdvanced() {
  const t = useUiText();
  const { showToast } = useToast();

  // System proxy
  const [systemProxy, setSystemProxy] = useState("");
  // Proxy failure rules
  const [proxyErrorKeywords, setProxyErrorKeywords] = useState("");
  const [emptyContentFail, setEmptyContentFail] = useState(true);
  // Payload rules (JSON)
  const [payloadRules, setPayloadRules] = useState("");
  // Codex transport
  const [codexWebsocket, setCodexWebsocket] = useState(true);
  const [responsesFallback, setResponsesFallback] = useState(true);
  const [channelConcurrency, setChannelConcurrency] = useState("4");
  // Batch probe
  const [batchProbeEnabled, setBatchProbeEnabled] = useState(false);
  // PROXY_TOKEN
  const [proxyTokenValue, setProxyTokenValue] = useState("");
  // Route strategy
  const [routePreset, setRoutePreset] = useState("balanced");
  const [fallbackUnitCost, setFallbackUnitCost] = useState("0.001");
  const [firstByteTimeout, setFirstByteTimeout] = useState("30");
  const [routeCooldown, setRouteCooldown] = useState("60");
  // Blocklists
  const [blockedBrands, setBlockedBrands] = useState("");
  const [allowedModels, setAllowedModels] = useState("");
  // DB migration
  const [dbDialect, setDbDialect] = useState("sqlite");
  const [dbConnection, setDbConnection] = useState("");
  const [factoryResetConfirm, setFactoryResetConfirm] = useState(false);

  // Load real runtime values so the form reflects the live gateway instead of
  // shipping hardcoded example values back on the next save.
  useEffect(() => {
    let cancelled = false;
    fetchRuntimeSettings()
      .then((data) => {
        if (cancelled) return;
        const s = data as Record<string, unknown>;
        if (typeof s.systemProxyUrl === "string") setSystemProxy(s.systemProxyUrl);
        if (s.payloadRules) {
          try { setPayloadRules(JSON.stringify(s.payloadRules, null, 2)); } catch { /* keep */ }
        }
        if (typeof s.codexUpstreamWebsocketEnabled === "boolean") setCodexWebsocket(s.codexUpstreamWebsocketEnabled);
        if (typeof s.responsesCompactFallbackToResponsesEnabled === "boolean") setResponsesFallback(s.responsesCompactFallbackToResponsesEnabled);
        if (typeof s.proxySessionChannelConcurrencyLimit === "number") setChannelConcurrency(String(s.proxySessionChannelConcurrencyLimit));
        if (typeof s.modelAvailabilityProbeEnabled === "boolean") setBatchProbeEnabled(s.modelAvailabilityProbeEnabled);
        if (typeof s.routingFallbackUnitCost === "number") setFallbackUnitCost(String(s.routingFallbackUnitCost));
        if (typeof s.proxyFirstByteTimeoutSec === "number" && s.proxyFirstByteTimeoutSec > 0) setFirstByteTimeout(String(s.proxyFirstByteTimeoutSec));
        if (typeof s.tokenRouterFailureCooldownMaxSec === "number") setRouteCooldown(String(s.tokenRouterFailureCooldownMaxSec));
        if (Array.isArray(s.proxyErrorKeywords)) setProxyErrorKeywords((s.proxyErrorKeywords as string[]).join(", "));
        if (Array.isArray(s.globalBlockedBrands)) setBlockedBrands((s.globalBlockedBrands as string[]).join(", "));
        if (Array.isArray(s.globalAllowedModels)) setAllowedModels((s.globalAllowedModels as string[]).join(", "));
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  // ── Real backend actions ─────────────────────────────────────────────
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fn();
      showToast(okMsg);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const handleProxyTest = () =>
    run("probe", () => testSystemProxy({ url: systemProxy || undefined }), t("ui.settings.adv_proxy_tested"));

  const handleSavePayload = () => {
    let parsed: unknown;
    try {
      parsed = payloadRules.trim() ? JSON.parse(payloadRules) : {};
    } catch {
      showToast("Payload rules must be valid JSON.");
      return;
    }
    run("payload", () => updateRuntimeSettings({ payloadRules: parsed }), t("ui.settings.saved"));
  };

  const handleSaveAdvanced = () =>
    run("save", () => updateRuntimeSettings({
      systemProxyUrl: systemProxy || undefined,
      proxyErrorKeywords: proxyErrorKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      codexUpstreamWebsocketEnabled: codexWebsocket,
      responsesCompactFallbackToResponsesEnabled: responsesFallback,
      proxySessionChannelConcurrencyLimit: Number(channelConcurrency) || 2,
      modelAvailabilityProbeEnabled: batchProbeEnabled,
      routingFallbackUnitCost: Number(fallbackUnitCost) || 0.001,
      proxyFirstByteTimeoutSec: Number(firstByteTimeout) || 0,
      tokenRouterFailureCooldownMaxSec: Number(routeCooldown) || 60,
      // Blocklists use the backend field names; only send non-empty lists.
      ...(blockedBrands.trim() ? { globalBlockedBrands: blockedBrands.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
      ...(allowedModels.trim() ? { globalAllowedModels: allowedModels.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
      // Proxy token — only rotate when the field is non-empty.
      ...(proxyTokenValue.trim() ? { proxyToken: proxyTokenValue.trim() } : {}),
    }), t("ui.settings.saved"));

  const handleRegenerateToken = () =>
    run("regen", () => updateRuntimeSettings({
      proxyToken: `sk-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`,
    }), t("ui.settings.adv_regenerated"));

  const handleDbTest = () => {
    if (dbDialect === "sqlite") {
      // SQLite is the built-in database — there is no test-connection API for
      // it, so do not claim a remote connection test succeeded.
      showToast("SQLite is the built-in database.");
      return;
    }
    if (!dbConnection.trim()) {
      showToast("Connection string is required.");
      return;
    }
    run("dbtest", () => testExternalDatabaseConnection({
      dialect: dbDialect as "mysql" | "postgres",
      connectionString: dbConnection.trim(),
    }), t("ui.settings.adv_conn_ok"));
  };

  const handleDbMigrate = () => {
    if (dbDialect === "sqlite") return;
    if (!window.confirm(t("ui.settings.adv_migrate_confirm"))) return;
    run("dbmigrate", () => migrateExternalDatabase({
      dialect: dbDialect as "mysql" | "postgres",
      connectionString: dbConnection,
      overwrite: false,
    }), t("ui.settings.adv_migrated"));
  };

  const handleClearCache = () => {
    if (!window.confirm(t("ui.settings.adv_clear_cache_confirm"))) return;
    run("cache", () => clearRuntimeCache(), t("ui.settings.saved"));
  };

  const handleClearUsage = () => {
    if (!window.confirm(t("ui.settings.adv_clear_usage_confirm"))) return;
    run("clear", () => clearUsageData(), t("ui.settings.saved"));
  };

  const handleFactoryReset = () => {
    if (!window.confirm(t("ui.settings.adv_factory_confirm"))) { setFactoryResetConfirm(false); return; }
    setFactoryResetConfirm(false);
    run("reset", () => factoryReset(), t("ui.settings.adv_factory_done"));
  };

  return (
    <div className="space-y-5">
      {/* System proxy */}
      <Section title={t("ui.settings.adv_proxy_title")} desc={t("ui.settings.adv_proxy_desc")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TextInput
            value={systemProxy}
            onChange={(e) => setSystemProxy(e.target.value)}
            placeholder="http://proxy.internal:8080"
            className="flex-1"
          />
          <ActionBtn label={t("ui.settings.adv_test")} onClick={handleProxyTest} disabled={busy.probe} />
        </div>
      </Section>

      {/* Proxy failure rules */}
      <Section title={t("ui.settings.adv_fail_title")} desc={t("ui.settings.adv_fail_desc")}>
        <TextArea
          value={proxyErrorKeywords}
          onChange={(e) => setProxyErrorKeywords(e.target.value)}
          rows={2}
          className="mb-3"
        />
        <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
          <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
            {t("ui.settings.adv_empty_content")}
          </span>
          <Toggle checked={emptyContentFail} onChange={setEmptyContentFail} />
        </div>
      </Section>

      {/* Payload rules */}
      <Section title={t("ui.settings.adv_payload_title")} desc={t("ui.settings.adv_payload_desc")}>
        <TextArea
          value={payloadRules}
          onChange={(e) => setPayloadRules(e.target.value)}
          rows={5}
          className="font-mono"
        />
        <div className="mt-2 flex gap-2">
          <ActionBtn label={t("ui.settings.adv_save")} onClick={handleSavePayload} disabled={busy.payload} />
        </div>
      </Section>

      {/* Codex transport */}
      <Section title={t("ui.settings.adv_codex_title")} desc={t("ui.settings.adv_codex_desc")}>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
            <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
              {t("ui.settings.adv_websocket")}
            </span>
            <Toggle checked={codexWebsocket} onChange={setCodexWebsocket} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
            <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
              {t("ui.settings.adv_responses_fallback")}
            </span>
            <Toggle checked={responsesFallback} onChange={setResponsesFallback} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
            <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
              {t("ui.settings.adv_concurrency")}
            </span>
            <input
              type="number"
              min={1}
              value={channelConcurrency}
              onChange={(e) => setChannelConcurrency(e.target.value)}
              className="h-8 w-20 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            />
          </div>
        </div>
        <div className="mt-3">
          <ActionBtn label={t("ui.settings.adv_save")} onClick={handleSaveAdvanced} disabled={busy.save} />
        </div>
      </Section>

      {/* Batch model probe */}
      <Section title={t("ui.settings.adv_probe_title")} desc={t("ui.settings.adv_probe_desc")}>
        <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
          <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
            {t("ui.settings.adv_probe_enabled")}
          </span>
          <Toggle checked={batchProbeEnabled} onChange={setBatchProbeEnabled} />
        </div>
        {batchProbeEnabled && (
          <div className="mt-2">
            <ActionBtn label={t("ui.settings.adv_probe_run")} onClick={handleProxyTest} disabled={busy.probe} />
          </div>
        )}
      </Section>

      {/* PROXY_TOKEN */}
      <Section title={t("ui.settings.adv_proxy_token")} desc={t("ui.settings.adv_proxy_token_desc")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TextInput value={proxyTokenValue} onChange={(e) => setProxyTokenValue(e.target.value)} className="flex-1 font-mono" />
          <ActionBtn
            label={t("ui.settings.adv_regenerate")}
            onClick={handleRegenerateToken}
            disabled={busy.regen}
          />
        </div>
      </Section>

      {/* Route strategy */}
      <Section title={t("ui.settings.adv_route_strategy")} desc={t("ui.settings.adv_route_strategy_desc")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">
              {t("ui.settings.adv_preset")}
            </span>
            <select
              value={routePreset}
              onChange={(e) => setRoutePreset(e.target.value)}
              className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              <option value="balanced">{t("ui.status.balanced")}</option>
              <option value="cost">Cost-first</option>
              <option value="speed">Speed-first</option>
              <option value="reliability">Reliability-first</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">
              {t("ui.settings.adv_fallback_cost")}
            </span>
            <input
              value={fallbackUnitCost}
              onChange={(e) => setFallbackUnitCost(e.target.value)}
              className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">
              {t("ui.settings.adv_first_byte")}
            </span>
            <input
              value={firstByteTimeout}
              onChange={(e) => setFirstByteTimeout(e.target.value)}
              className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            />
          </label>
        </div>
      </Section>

      {/* Blocklists */}
      <Section title={t("ui.settings.adv_blocklist")} desc={t("ui.settings.adv_blocklist_desc")}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">
              {t("ui.settings.adv_blocked_brands")}
            </span>
            <TextInput value={blockedBrands} onChange={(e) => setBlockedBrands(e.target.value)} placeholder="openai, anthropic" />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">
              {t("ui.settings.adv_allowed_models")}
            </span>
            <TextInput value={allowedModels} onChange={(e) => setAllowedModels(e.target.value)} placeholder="gpt-5, claude-*" />
          </label>
        </div>
      </Section>

      {/* DB migration */}
      <Section title={t("ui.settings.adv_db_title")} desc={t("ui.settings.adv_db_desc")}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
            <select
              value={dbDialect}
              onChange={(e) => setDbDialect(e.target.value)}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              <option value="sqlite">{t("ui.settings.adv_sqlite")}</option>
              <option value="mysql">{t("ui.settings.adv_mysql")}</option>
              <option value="postgres">{t("ui.settings.adv_postgres")}</option>
            </select>
            <TextInput
              value={dbConnection}
              onChange={(e) => setDbConnection(e.target.value)}
              placeholder="postgres://user:pass@host:5432/metapi"
              className="font-mono"
            />
          </div>
          <div className="flex gap-2">
            <ActionBtn label={t("ui.settings.adv_test_conn")} onClick={handleDbTest} disabled={busy.dbtest} />
            <ActionBtn label={t("ui.settings.adv_migrate")} onClick={handleDbMigrate} disabled={busy.dbmigrate} />
          </div>
        </div>
      </Section>

      {/* Factory reset */}
      <Section title={t("ui.settings.adv_factory_title")} desc={t("ui.settings.adv_factory_desc")}>
        <div className="mb-3 flex gap-2">
          <ActionBtn label={t("ui.settings.adv_clear_cache")} onClick={handleClearCache} disabled={busy.cache} />
          <ActionBtn label={t("ui.settings.adv_clear_usage")} tone="danger" onClick={handleClearUsage} disabled={busy.clear} />
        </div>
        {factoryResetConfirm ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-rose)]/40 bg-[color:var(--color-rose)]/10 p-4">
            <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-rose)]">
              {t("ui.settings.adv_factory_confirm")}
            </span>
            <div className="flex gap-2">
              <ActionBtn label={t("ui.common.cancel")} onClick={() => setFactoryResetConfirm(false)} />
              <ActionBtn label={t("ui.settings.adv_factory_reset")} tone="danger"
                onClick={handleFactoryReset}
                disabled={busy.reset} />
            </div>
          </div>
        ) : (
          <ActionBtn label={t("ui.settings.adv_factory_reset")} tone="danger" onClick={() => setFactoryResetConfirm(true)} />
        )}
      </Section>
    </div>
  );
}