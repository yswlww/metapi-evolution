import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Webhook,
  X,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EditDrawer, Field, Select, TextInput, Toggle } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import SettingsAdvanced from "./settings/SettingsAdvanced";
import { fetchRuntimeSettings, updateRuntimeSettings, testNotification } from "../lib/source";

type TabKey = "general" | "notify" | "security" | "advanced";

type NotifyDraft = {
  enabled: boolean;
  url?: string;
  key?: string;
  token?: string;
  chat_id?: string;
  host?: string;
  port?: string;
  secure?: boolean;
  user?: string;
  pass?: string;
  to?: string;
  from?: string;
};

const NOTIFY_KINDS = ["webhook", "bark", "serverchan", "telegram", "smtp"] as const;
type NotifyKind = (typeof NOTIFY_KINDS)[number];

const NOTIFY_ICONS: Record<NotifyKind, React.ReactNode> = {
  webhook: <Webhook size={16} />,
  bark: <Bell size={16} />,
  serverchan: <MessageSquare size={16} />,
  telegram: <SendIcon />,
  smtp: <Mail size={16} />,
};

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function NotifyCard({
  kind,
  label,
  desc,
  enabled,
  onToggle,
  onConfig,
  onTest,
  testing,
}: {
  kind: NotifyKind;
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onConfig: () => void;
  onTest: () => void;
  testing: boolean;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]">
        {NOTIFY_ICONS[kind]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg tracking-tight text-[color:var(--color-fg)]">{label}</h3>
          <Toggle checked={enabled} onChange={onToggle} />
        </div>
        <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{desc}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onConfig}
            className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
            CONFIG
          </button>
          <button type="button" onClick={onTest} disabled={testing}
            className="rounded-md bg-[color:var(--color-lime)] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-50">
            {testing ? "SENDING…" : "TEST"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RowField({
  label,
  desc,
  value,
  onChange,
  secret,
  placeholder,
  suffix,
}: {
  label: string;
  desc?: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">{label}</div>
          {desc && <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{desc}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {suffix && <span className="font-mono text-xs text-[color:var(--color-muted)]">{suffix}</span>}
          <input
            type={secret ? "password" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] placeholder:text-[color:var(--color-muted)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
        </div>
      </div>
    </div>
  );
}

function WeightSlider({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">{label}</div>
        <span className="font-mono text-sm text-[color:var(--color-lime)]">{value}</span>
      </div>
      {desc && <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{desc}</p>}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[color:var(--color-lime)]"
      />
    </div>
  );
}

export default function SettingsPage() {
  const t = useUiText();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>("general");

  // General
  const [checkinCron, setCheckinCron] = useState("0 8 * * *");
  const [balanceCron, setBalanceCron] = useState("0 */6 * * *");
  // Log cleanup settings (runtime-backed).
  const [logCleanupCron, setLogCleanupCron] = useState("0 6 * * *");
  const [logCleanupRetentionDays, setLogCleanupRetentionDays] = useState("30");
  const [logCleanupUsageLogsEnabled, setLogCleanupUsageLogsEnabled] = useState(true);
  const [logCleanupProgramLogsEnabled, setLogCleanupProgramLogsEnabled] = useState(false);
  const [cooldown, setCooldown] = useState("60");
  const [costWeight, setCostWeight] = useState(40);
  const [balanceWeight, setBalanceWeight] = useState(30);
  const [usageWeight, setUsageWeight] = useState(30);

  // Notify
  const [notify, setNotify] = useState<Record<NotifyKind, NotifyDraft>>({
    webhook: { enabled: true, url: "https://ops.example.test/hooks/metapi" },
    bark: { enabled: true, url: "https://api.day.app/YOUR_KEY" },
    serverchan: { enabled: false, key: "" },
    telegram: { enabled: false, token: "", chat_id: "" },
    smtp: { enabled: false, host: "", port: "587", secure: false, user: "", pass: "", to: "", from: "" },
  });
  const [configKind, setConfigKind] = useState<NotifyKind | null>(null);
  const [testing, setTesting] = useState<NotifyKind | null>(null);

  // Security
  const [ipAllow, setIpAllow] = useState("127.0.0.1, ::1");

  const dirty = useMemo(() => false, []);

  const updateNotify = (kind: NotifyKind, patch: Partial<NotifyDraft>) =>
    setNotify((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));

  // Load real runtime settings from the backend on mount.
  useEffect(() => {
    let cancelled = false;
    fetchRuntimeSettings()
      .then((data) => {
        if (cancelled) return;
        const s = data as Record<string, unknown>;
        if (typeof s.checkinCron === "string") setCheckinCron(s.checkinCron);
        if (typeof s.balanceRefreshCron === "string") setBalanceCron(s.balanceRefreshCron);
        if (typeof s.logCleanupCron === "string") setLogCleanupCron(s.logCleanupCron);
        if (typeof s.logCleanupRetentionDays === "number") setLogCleanupRetentionDays(String(s.logCleanupRetentionDays));
        if (typeof s.logCleanupUsageLogsEnabled === "boolean") setLogCleanupUsageLogsEnabled(s.logCleanupUsageLogsEnabled);
        if (typeof s.logCleanupProgramLogsEnabled === "boolean") setLogCleanupProgramLogsEnabled(s.logCleanupProgramLogsEnabled);
        if (typeof s.tokenRouterFailureCooldownMaxSec === "number") setCooldown(String(s.tokenRouterFailureCooldownMaxSec));
        const weights = s.routingWeights as { costWeight?: number; balanceWeight?: number; usageWeight?: number } | undefined;
        if (weights?.costWeight !== undefined) setCostWeight(Math.round(weights.costWeight * 100));
        if (weights?.balanceWeight !== undefined) setBalanceWeight(Math.round(weights.balanceWeight * 100));
        if (weights?.usageWeight !== undefined) setUsageWeight(Math.round(weights.usageWeight * 100));
        if (Array.isArray(s.adminIpAllowlist)) setIpAllow((s.adminIpAllowlist as string[]).join(", "));
        // Notification channels (secrets come back masked; leave those blank).
        setNotify((prev) => ({
          ...prev,
          webhook: { ...prev.webhook, enabled: s.webhookEnabled === true, url: typeof s.webhookUrl === "string" ? s.webhookUrl : prev.webhook.url },
          bark: { ...prev.bark, enabled: s.barkEnabled === true, url: typeof s.barkUrl === "string" ? s.barkUrl : prev.bark.url },
          serverchan: { ...prev.serverchan, enabled: s.serverChanEnabled === true },
          telegram: {
            ...prev.telegram,
            enabled: s.telegramEnabled === true,
            chat_id: typeof s.telegramChatId === "string" ? s.telegramChatId : prev.telegram.chat_id,
          },
          smtp: {
            ...prev.smtp,
            enabled: s.smtpEnabled === true,
            host: typeof s.smtpHost === "string" ? s.smtpHost : prev.smtp.host,
            port: typeof s.smtpPort === "number" ? String(s.smtpPort) : prev.smtp.port,
            secure: s.smtpSecure === true,
            user: typeof s.smtpUser === "string" ? s.smtpUser : prev.smtp.user,
            to: typeof s.smtpTo === "string" ? s.smtpTo : prev.smtp.to,
            from: typeof s.smtpFrom === "string" ? s.smtpFrom : prev.smtp.from,
          },
        }));
      })
      .catch((err) => { if (!cancelled) showToast(err instanceof Error ? err.message : "Failed to load settings."); });
    return () => { cancelled = true; };
  }, [showToast]);

  const [saving, setSaving] = useState(false);

  const saveAll = async () => {
    setSaving(true);
    try {
      await updateRuntimeSettings({
        checkinCron: checkinCron.trim(),
        checkinScheduleMode: "cron",
        balanceRefreshCron: balanceCron.trim(),
        logCleanupCron: logCleanupCron.trim(),
        logCleanupRetentionDays: Number(logCleanupRetentionDays) || 30,
        logCleanupUsageLogsEnabled: logCleanupUsageLogsEnabled,
        logCleanupProgramLogsEnabled: logCleanupProgramLogsEnabled,
        tokenRouterFailureCooldownMaxSec: Number(cooldown) || 60,
        routingWeights: {
          baseWeightFactor: 0.5,
          valueScoreFactor: 0.5,
          costWeight: costWeight / 100,
          balanceWeight: balanceWeight / 100,
          usageWeight: usageWeight / 100,
        },
        webhookEnabled: notify.webhook.enabled,
        webhookUrl: notify.webhook.url ?? "",
        barkEnabled: notify.bark.enabled,
        barkUrl: notify.bark.url ?? "",
        serverChanEnabled: notify.serverchan.enabled,
        ...(notify.serverchan.key ? { serverChanKey: notify.serverchan.key } : {}),
        telegramEnabled: notify.telegram.enabled,
        telegramChatId: notify.telegram.chat_id ?? "",
        ...(notify.telegram.token ? { telegramBotToken: notify.telegram.token } : {}),
        smtpEnabled: notify.smtp.enabled,
        smtpHost: notify.smtp.host ?? "",
        smtpPort: Number(notify.smtp.port) || 587,
        smtpSecure: notify.smtp.secure ?? false,
        smtpUser: notify.smtp.user ?? "",
        smtpFrom: notify.smtp.from ?? "",
        smtpTo: notify.smtp.to ?? "",
        ...(notify.smtp.pass ? { smtpPass: notify.smtp.pass } : {}),
        adminIpAllowlist: ipAllow.split(",").map((s) => s.trim()).filter(Boolean),
      });
      showToast(t("ui.settings.saved"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const cancelAll = async () => {
    // Reload from the backend so unsaved edits are discarded.
    setTab("general");
    const data = await fetchRuntimeSettings().catch(() => null);
    if (data) {
      const s = data as Record<string, unknown>;
      if (typeof s.checkinCron === "string") setCheckinCron(s.checkinCron);
      if (typeof s.balanceRefreshCron === "string") setBalanceCron(s.balanceRefreshCron);
        if (typeof s.logCleanupCron === "string") setLogCleanupCron(s.logCleanupCron);
        if (typeof s.logCleanupRetentionDays === "number") setLogCleanupRetentionDays(String(s.logCleanupRetentionDays));
        if (typeof s.logCleanupUsageLogsEnabled === "boolean") setLogCleanupUsageLogsEnabled(s.logCleanupUsageLogsEnabled);
        if (typeof s.logCleanupProgramLogsEnabled === "boolean") setLogCleanupProgramLogsEnabled(s.logCleanupProgramLogsEnabled);
      if (Array.isArray(s.adminIpAllowlist)) setIpAllow((s.adminIpAllowlist as string[]).join(", "));
    }
    showToast(t("ui.settings.cancelled"));
  };

  const testNotify = async (kind: NotifyKind) => {
    setTesting(kind);
    try {
      await testNotification();
      showToast(t("ui.settings.notify_test_sent"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(null);
    }
  };

  // Save the channel being configured in the drawer directly to runtime.
  const handleSaveNotify = async () => {
    if (!configKind) return;
    const d = notify[configKind];
    const payload: Record<string, unknown> = {};
    switch (configKind) {
      case "webhook":
        payload.webhookEnabled = d.enabled;
        payload.webhookUrl = d.url ?? "";
        break;
      case "bark":
        payload.barkEnabled = d.enabled;
        payload.barkUrl = d.url ?? "";
        break;
      case "serverchan":
        payload.serverChanEnabled = d.enabled;
        if (d.key) payload.serverChanKey = d.key;
        break;
      case "telegram":
        payload.telegramEnabled = d.enabled;
        payload.telegramChatId = d.chat_id ?? "";
        if (d.token) payload.telegramBotToken = d.token;
        break;
      case "smtp":
        payload.smtpEnabled = d.enabled;
        payload.smtpHost = d.host ?? "";
        payload.smtpPort = Number(d.port) || 587;
        payload.smtpSecure = d.secure ?? false;
        payload.smtpUser = d.user ?? "";
        payload.smtpFrom = d.from ?? "";
        payload.smtpTo = d.to ?? "";
        if (d.pass) payload.smtpPass = d.pass;
        break;
    }
    try {
      await updateRuntimeSettings(payload);
      showToast(t("ui.settings.saved"));
      setConfigKind(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.settings.eyebrow")}
        title={t("ui.settings.title")}
        description={t("ui.settings.desc")}
        actions={
          dirty ? (
            <span className="chip chip-amber">● UNSAVED</span>
          ) : (
            <span className="chip chip-lime">{t("ui.settings.saved_badge")}</span>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Tab nav */}
        <nav className="card h-fit p-3">
          {([
            { key: "general", label: t("ui.settings.tab_general"), icon: <SlidersHorizontal size={14} /> },
            { key: "notify", label: t("ui.settings.tab_notify"), icon: <Bell size={14} /> },
            { key: "security", label: t("ui.settings.tab_security"), icon: <ShieldCheck size={14} /> },
            { key: "advanced", label: t("ui.settings.tab_advanced"), icon: <Terminal size={14} /> },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                tab === item.key
                  ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                  : "text-[color:var(--color-fg)]/75 hover:bg-white/[0.03]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="space-y-4">
          {tab === "general" && (
            <>
              <RowField label={t("ui.settings.checkin_cron")} desc={t("ui.settings.checkin_cron_desc")} value={checkinCron} onChange={setCheckinCron} />
              <RowField label={t("ui.settings.balance_cron")} desc={t("ui.settings.balance_cron_desc")} value={balanceCron} onChange={setBalanceCron} />
              <RowField label={t("ui.settings.log_cleanup_cron")} desc={t("ui.settings.log_cleanup_cron_desc")} value={logCleanupCron} onChange={setLogCleanupCron} />
              <RowField label={t("ui.settings.log_cleanup_retention")} desc={t("ui.settings.log_cleanup_retention_desc")} value={logCleanupRetentionDays} onChange={setLogCleanupRetentionDays} suffix="days" />
              <div className="card p-4">
                <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.settings.log_cleanup_scopes")}</div>
                <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{t("ui.settings.log_cleanup_scopes_desc")}</p>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={logCleanupUsageLogsEnabled} onChange={(e) => setLogCleanupUsageLogsEnabled(e.target.checked)} className="accent-[color:var(--color-lime)]" />
                    <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.settings.log_cleanup_usage")}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={logCleanupProgramLogsEnabled} onChange={(e) => setLogCleanupProgramLogsEnabled(e.target.checked)} className="accent-[color:var(--color-lime)]" />
                    <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.settings.log_cleanup_program")}</span>
                  </label>
                </div>
              </div>
              <RowField label={t("ui.settings.cooldown")} desc={t("ui.settings.cooldown_desc")} value={cooldown} onChange={setCooldown} suffix="s" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <WeightSlider label={t("ui.settings.weight_cost")} desc={t("ui.settings.weight_cost_desc")} value={costWeight} onChange={setCostWeight} />
                <WeightSlider label={t("ui.settings.weight_balance")} desc={t("ui.settings.weight_balance_desc")} value={balanceWeight} onChange={setBalanceWeight} />
                <WeightSlider label={t("ui.settings.weight_usage")} desc={t("ui.settings.weight_usage_desc")} value={usageWeight} onChange={setUsageWeight} />
              </div>
            </>
          )}

          {tab === "notify" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {NOTIFY_KINDS.map((kind) => (
                <NotifyCard
                  key={kind}
                  kind={kind}
                  label={t(`ui.settings.notify_${kind}`)}
                  desc={t(`ui.settings.notify_${kind}_desc`)}
                  enabled={notify[kind].enabled}
                  onToggle={(v) => updateNotify(kind, { enabled: v })}
                  onConfig={() => setConfigKind(kind)}
                  onTest={() => testNotify(kind)}
                  testing={testing === kind}
                />
              ))}
            </div>
          )}

          {tab === "security" && (
            <>
              <RowField label={t("ui.settings.ip_allow")} desc={t("ui.settings.ip_allow_desc")} value={ipAllow} onChange={setIpAllow} />
              <p className="text-xs text-[color:var(--color-muted)]">
                Admin token rotation lives on the Accounts page; the proxy token lives in Advanced settings.
              </p>
            </>
          )}

          {tab === "advanced" && <SettingsAdvanced />}

          {/* Save / Cancel */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={cancelAll}
              className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-xs tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
              {t("ui.common.cancel")}
            </button>
            <button type="button" onClick={saveAll} disabled={saving}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">
              <Save size={13} /> {saving ? "SAVING…" : t("ui.common.save")}
            </button>
          </div>
        </div>
      </div>

      {/* Notify config drawer */}
      {configKind && (
        <EditDrawer
          open
          onClose={() => setConfigKind(null)}
          title={t(`ui.settings.notify_${configKind}`)}
          eyebrow={t("ui.settings.tab_notify")}
          subtitle={t("ui.settings.notify_drawer_sub")}
          footer={
            <>
              <button type="button" onClick={() => setConfigKind(null)}
                className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                {t("ui.common.cancel")}
              </button>
              <button type="button" onClick={handleSaveNotify}
                className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
                {t("ui.common.save")}
              </button>
            </>
          }
        >
          <div className="mb-4 flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/50 p-3">
            <span className="font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.settings.notify_enabled")}</span>
            <Toggle checked={notify[configKind].enabled} onChange={(v) => updateNotify(configKind, { enabled: v })} />
          </div>
          <NotifyConfigFields kind={configKind} draft={notify[configKind]} update={patch => updateNotify(configKind, patch)} t={t} />
        </EditDrawer>
      )}
    </div>
  );
}

function NotifyConfigFields({
  kind,
  draft,
  update,
  t,
}: {
  kind: NotifyKind;
  draft: NotifyDraft;
  update: (patch: Partial<NotifyDraft>) => void;
  t: (key: string) => string;
}) {
  if (kind === "webhook") {
    return <Field label={t("ui.settings.notify_webhook_url")}><TextInput value={draft.url ?? ""} onChange={(e) => update({ url: e.target.value })} placeholder={t("ui.settings.notify_webhook_url_ph")} /></Field>;
  }
  if (kind === "bark") {
    return <Field label={t("ui.settings.notify_bark_key")}><TextInput value={draft.url ?? ""} onChange={(e) => update({ url: e.target.value })} placeholder={t("ui.settings.notify_bark_key_ph")} /></Field>;
  }
  if (kind === "serverchan") {
    return <Field label={t("ui.settings.serverchan_key")}><TextInput value={draft.key ?? ""} onChange={(e) => update({ key: e.target.value })} placeholder="SCT..." /></Field>;
  }
  if (kind === "telegram") {
    return (
      <>
        <Field label={t("ui.settings.notify_telegram_token")}><TextInput value={draft.token ?? ""} onChange={(e) => update({ token: e.target.value })} placeholder="123:AAH..." /></Field>
        <Field label={t("ui.settings.notify_telegram_chat")}><TextInput value={draft.chat_id ?? ""} onChange={(e) => update({ chat_id: e.target.value })} placeholder="@channel or -100..." /></Field>
      </>
    );
  }
  return (
    <>
      <Field label={t("ui.settings.notify_smtp_host")}><TextInput value={draft.host ?? ""} onChange={(e) => update({ host: e.target.value })} placeholder="smtp.example.com:587" /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("ui.settings.notify_smtp_user")}><TextInput value={draft.user ?? ""} onChange={(e) => update({ user: e.target.value })} /></Field>
        <Field label={t("ui.settings.notify_smtp_pass")}><TextInput type="password" value={draft.pass ?? ""} onChange={(e) => update({ pass: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("ui.settings.notify_smtp_to")}><TextInput value={draft.to ?? ""} onChange={(e) => update({ to: e.target.value })} /></Field>
        <Field label={t("ui.settings.notify_smtp_from")}><TextInput value={draft.from ?? ""} onChange={(e) => update({ from: e.target.value })} /></Field>
      </div>
    </>
  );
}