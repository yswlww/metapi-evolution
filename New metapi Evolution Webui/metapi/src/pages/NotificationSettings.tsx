import { useEffect, useMemo, useState } from "react";
import { Bell, Mail, MessageSquare, Webhook, Zap } from "lucide-react";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "../data/prototype";
import PageHeader from "../components/PageHeader";
import {
  EmptyState,
  SearchField,
  SectionTitle,
  StatCard,
} from "../components/PrototypeUI";
import { EditDrawer, Field, TextInput } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { fetchRuntimeSettings, updateRuntimeSettings, testNotification, DATA_MODE } from "../lib/source";

const STATUS_TONES: Record<string, string> = {
  enabled: "lime",
  disabled: "muted",
  "needs-attention": "amber",
};

function KindIcon({ kind }: { kind: NotificationChannel["kind"] }) {
  const size = 16;
  switch (kind) {
    case "webhook":
      return <Webhook size={size} />;
    case "telegram":
      return <MessageSquare size={size} />;
    case "smtp":
      return <Mail size={size} />;
    case "bark":
      return <Bell size={size} />;
    case "serverchan":
      return <Zap size={size} />;
  }
}

// Map runtime settings keys to the prototype channel list so the page reflects
// the real gateway config in API mode.
const CHANNEL_RUNTIME_KEYS: Record<string, { enabled: string; destination?: string }> = {
  webhook: { enabled: "webhookEnabled", destination: "webhookUrl" },
  bark: { enabled: "barkEnabled", destination: "barkUrl" },
  serverchan: { enabled: "serverChanEnabled" },
  telegram: { enabled: "telegramEnabled", destination: "telegramChatId" },
  smtp: { enabled: "smtpEnabled", destination: "smtpHost" },
};

export default function NotificationSettings() {
  const t = useUiText();
  const { showToast } = useToast();
  const [channels, setChannels] = useState(() => [...NOTIFICATION_CHANNELS]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | NotificationChannel["status"]>("all");
  const [drawer, setDrawer] = useState<{ id: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState("300");

  // In API mode, reflect the real enabled flags from runtime settings.
  useEffect(() => {
    if (DATA_MODE === "prototype") return;
    fetchRuntimeSettings()
      .then((data) => {
        const s = data as Record<string, unknown>;
        setChannels((prev) =>
          prev.map((c) => {
            const key = CHANNEL_RUNTIME_KEYS[c.kind];
            if (!key) return c;
            const enabled = s[key.enabled] === true;
            // In API mode, the runtime destination is authoritative — an empty
            // string means "not configured", never fall back to the prototype
            // placeholder destination.
            const runtimeDest = key.destination && typeof s[key.destination] === "string"
              ? (s[key.destination] as string)
              : "";
            return {
              ...c,
              status: enabled ? "enabled" as const : "disabled" as const,
              statusLabel: enabled ? "Enabled" : "Disabled",
              destination: runtimeDest || "Not configured",
            };
          }),
        );
        if (typeof s.notifyCooldownSec === "number") setCooldown(String(s.notifyCooldownSec));
      })
      .catch(() => { /* keep prototype display */ });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((channel) => {
      const matchesQuery =
        q.length === 0 ||
        [channel.name, channel.destination, channel.kind].join(" ").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || channel.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [channels, query, statusFilter]);

  const enabled = channels.filter((c) => c.status === "enabled").length;
  const needsAttention = channels.filter((c) => c.status === "needs-attention").length;

  const flash = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const handleToggle = async (id: string) => {
    const channel = channels.find((c) => c.id === id);
    if (!channel) return;
    const key = CHANNEL_RUNTIME_KEYS[channel.kind];
    if (!key) {
      // No runtime mapping — keep the local toggle (unconfigured channels).
      setChannels((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const next = c.status === "enabled" ? "disabled" : "enabled";
          return {
            ...c,
            status: next,
            statusLabel: next === "enabled" ? "Enabled" : "Disabled",
          } as NotificationChannel;
        }),
      );
      return;
    }
    const next = channel.status === "enabled" ? false : true;
    try {
      await updateRuntimeSettings({ [key.enabled]: next });
      setChannels((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          return {
            ...c,
            status: next ? "enabled" as const : "disabled" as const,
            statusLabel: next ? "Enabled" : "Disabled",
          };
        }),
      );
      flash(next ? "Channel enabled." : "Channel disabled.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.");
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      await testNotification();
      flash(t("ui.notif.test_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(null);
    }
  };

  const handleSaveCooldown = async () => {
    try {
      await updateRuntimeSettings({ notifyCooldownSec: Number(cooldown) || 300 });
      flash(t("ui.notif.cooldown_saved"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.notif.eyebrow")}
        title={t("ui.notif.title")}
        description={t("ui.notif.desc")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.notif.channels")}
          value={channels.length}
          detail={t("ui.notif.configured")}
          icon={<Bell size={16} />}
        />
        <StatCard
          label={t("ui.notif.enabled")}
          value={enabled}
          trend={{ label: enabled > 0 ? t("ui.notif.delivering") : t("ui.notif.none_active"), tone: enabled > 0 ? "lime" : "muted" }}
          icon={<Zap size={16} />}
        />
        <StatCard
          label={t("ui.notif.needs_attention")}
          value={needsAttention}
          trend={{ label: needsAttention > 0 ? t("ui.notif.check_deliveries") : t("ui.notif.clear"), tone: needsAttention > 0 ? "amber" : "lime" }}
          icon={<MessageSquare size={16} />}
        />
        <StatCard
          label={t("ui.notif.event_types")}
          value={new Set(channels.flatMap((c) => c.eventTypes)).size}
          detail={t("ui.notif.routing_rules")}
          icon={<Webhook size={16} />}
        />
      </div>

      {feedback && (
        <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">
          {feedback}
        </div>
      )}

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">
            {t("ui.notif.cooldown")}
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">{t("ui.notif.cooldown_hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            className="h-9 w-32 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
          <button
            type="button"
            onClick={handleSaveCooldown}
            className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            {t("ui.common.save")}
          </button>
        </div>
      </div>

      <section className="space-y-4">
        <SectionTitle
          title={t("ui.notif.channels_section")}
          description={t("ui.notif.channels_desc")}
          eyebrow={t("ui.notif.channels_section")}
          actions={<span className="chip chip-lime">{t("ui.common.rows", { n: filtered.length })}</span>}
        />
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3 sm:flex-row sm:items-center">
          <SearchField
            label={t("ui.notif.search_ph")}
            placeholder={t("ui.notif.search_ph")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <select
            aria-label={t("ui.notif.filter_status")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | NotificationChannel["status"])}
            className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          >
            <option value="all">{t("ui.notif.all_statuses")}</option>
            <option value="enabled">{t("ui.notif.enabled")}</option>
            <option value="disabled">{t("ui.notif.status_disabled")}</option>
            <option value="needs-attention">{t("ui.notif.needs_attention")}</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t("ui.notif.empty_title")}
            description={t("ui.notif.empty_desc")}
            icon={<Bell size={18} />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((channel) => {
              const tone = STATUS_TONES[channel.status] ?? "muted";
              const isTesting = testing === channel.id;
              return (
                <div key={channel.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]">
                        <KindIcon kind={channel.kind} />
                      </div>
                      <div>
                        <h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                          {channel.name}
                        </h3>
                        <div className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] uppercase">
                          {channel.kind}
                        </div>
                      </div>
                    </div>
                    <span className={`chip chip-${tone}`}>{channel.statusLabel}</span>
                  </div>
                  <div className="mt-3 break-all font-mono text-[11px] text-[color:var(--color-muted)]">
                    {channel.destination}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {channel.eventTypes.map((type) => (
                      <span
                        key={type}
                        className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)]"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    {DATA_MODE === "prototype" ? (
                      <>
                        <span className="font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                          {channel.lastDelivery.statusLabel}
                          {channel.lastDelivery.occurredAt &&
                            ` · ${new Date(channel.lastDelivery.occurredAt).toLocaleString()}`}
                        </span>
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            channel.lastDelivery.status === "delivered"
                              ? "bg-[color:var(--color-lime)]"
                              : channel.lastDelivery.status === "failed"
                                ? "bg-[color:var(--color-rose)]"
                                : "bg-[color:var(--color-muted)]"
                          }`}
                          aria-label={channel.lastDelivery.status}
                        />
                      </>
                    ) : (
                      <span className="font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                        No delivery recorded
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(channel.id)}
                      className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {channel.status === "enabled" ? t("ui.notif.disable") : t("ui.notif.enable")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawer({ id: channel.id })}
                      className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {t("ui.notif.configure")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTest(channel.id)}
                      disabled={isTesting}
                      className="ml-auto rounded-md bg-[color:var(--color-lime)] px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-50"
                    >
                      {isTesting ? t("ui.notif.testing") : t("ui.notif.test")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {drawer && (
        <ChannelDrawer
          id={drawer.id}
          onClose={() => setDrawer(null)}
          onFlash={flash}
        />
      )}
    </div>
  );
}

function ChannelDrawer({
  id,
  onClose,
  onFlash,
}: {
  id: string;
  onClose: () => void;
  onFlash: (msg: string) => void;
}) {
  const t = useUiText();
  const channel = NOTIFICATION_CHANNELS.find((c) => c.id === id);

  return (
    <EditDrawer
      open
      onClose={onClose}
      title={channel?.name ?? ""}
      eyebrow={t("ui.notif.configure_eyebrow")}
      subtitle={channel?.destination}
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
            onClick={() => {
              onFlash(t("ui.notif.saved_ok", { name: channel?.name ?? "" }));
              onClose();
            }}
            className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
          >
            {t("ui.common.save")}
          </button>
        </>
      }
    >
      <Field label={t("ui.notif.destination")}>
        <TextInput defaultValue={channel?.destination ?? ""} />
      </Field>
      <Field label={t("ui.notif.event_types_field")}>
        <div className="flex flex-wrap gap-1.5">
          {(["oauth", "key", "announcement", "system", "export"] as const).map((type) => {
            const checked = channel?.eventTypes.includes(type) ?? false;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={checked}
                className={`rounded border px-2 py-1 font-mono text-[10px] tracking-wider ${
                  checked
                    ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </Field>
      {channel && (
        <Field label={t("ui.notif.credential_field")}>
          <TextInput type="password" placeholder={t("ui.common.enter_credential")} />
        </Field>
      )}
    </EditDrawer>
  );
}