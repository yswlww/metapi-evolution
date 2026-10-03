import { useEffect, useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { PROGRAM_EVENTS, type ProgramEvent, type ProgramEventStatus } from "../data/prototype";
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
  DATA_MODE,
  fetchEvents,
  markEventRead,
  markAllEventsRead,
  clearEvents,
} from "../lib/source";

const TYPE_OPTIONS: ("all" | ProgramEvent["type"])[] = [
  "all",
  "oauth",
  "key",
  "announcement",
  "system",
  "export",
];

const STATUS_OPTIONS: ("all" | ProgramEventStatus)[] = [
  "all",
  "success",
  "warning",
  "failure",
  "info",
];

const STATUS_TONES: Record<ProgramEventStatus, string> = {
  success: "lime",
  warning: "amber",
  failure: "rose",
  info: "cyan",
};

// Backend event row shape.
interface BackendEvent {
  id: number;
  type: string;
  level?: string;
  title: string;
  message?: string;
  read: boolean;
  createdAt?: string;
}

function mapBackendEvent(raw: BackendEvent): ProgramEvent {
  const status = raw.level === "error" || raw.level === "failure"
    ? "failure" as const
    : raw.level === "warning" ? "warning" as const
    : raw.level === "info" ? "info" as const
    : "info" as const;
  const type = (["oauth", "key", "announcement", "system", "export"] as const).includes(raw.type as ProgramEvent["type"])
    ? (raw.type as ProgramEvent["type"])
    : "system";
  return {
    id: String(raw.id),
    type,
    status,
    statusLabel: status === "failure" ? "Failure" : status === "warning" ? "Warning" : status === "info" ? "Info" : "Success",
    title: raw.title,
    detail: raw.message ?? "",
    occurredAt: raw.createdAt ?? "",
    read: Boolean(raw.read),
  };
}

export default function ProgramLogs() {
  const t = useUiText();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ProgramEvent["type"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ProgramEventStatus>("all");
  const [events, setEvents] = useState<ProgramEvent[]>(() => [...PROGRAM_EVENTS]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const reload = async () => {
    if (DATA_MODE === "prototype") return;
    try {
      const data = await fetchEvents(50);
      setEvents((data as BackendEvent[]).map(mapBackendEvent));
    } catch (err) {
      setEvents([]);
      showToast(err instanceof Error ? err.message : "Failed to load events.");
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesQuery =
        q.length === 0 ||
        [event.title, event.detail, event.type].join(" ").toLowerCase().includes(q);
      const matchesType = typeFilter === "all" || event.type === typeFilter;
      const matchesStatus = statusFilter === "all" || event.status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [events, query, typeFilter, statusFilter]);

  const unread = events.filter((e) => !e.read).length;

  const flash = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  };

  const markRead = async (id: string) => {
    try {
      await markEventRead(Number(id));
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Mark read failed.");
    }
  };

  const markAllRead = async () => {
    try {
      await markAllEventsRead();
      setEvents((prev) => prev.map((e) => ({ ...e, read: true })));
      flash(t("ui.events.read_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Mark all failed.");
    }
  };

  const clearAll = async () => {
    try {
      await clearEvents();
      setEvents([]);
      flash(t("ui.events.clear_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Clear failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.events.eyebrow")}
        title={t("ui.events.title")}
        description={t("ui.events.desc")}
        actions={
          <>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40"
            >
              {t("ui.events.mark_all_read")}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={events.length === 0}
              className="h-9 rounded-lg border border-[color:var(--color-rose)]/40 px-4 font-mono text-xs tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10 disabled:opacity-40"
            >
              {t("ui.events.clear_all")}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.events.total")}
          value={events.length}
          icon={<ScrollText size={16} />}
        />
        <StatCard
          label={t("ui.events.unread")}
          value={unread}
          trend={{ label: unread > 0 ? t("ui.events.needs_review") : t("ui.events.all_read"), tone: unread > 0 ? "amber" : "lime" }}
          icon={<ScrollText size={16} />}
        />
        <StatCard
          label={t("ui.events.warnings")}
          value={events.filter((e) => e.status === "warning").length}
          trend={{ label: t("ui.events.attention"), tone: events.some((e) => e.status === "warning") ? "amber" : "muted" }}
          icon={<ScrollText size={16} />}
        />
        <StatCard
          label={t("ui.events.failures")}
          value={events.filter((e) => e.status === "failure").length}
          trend={{ label: events.some((e) => e.status === "failure") ? t("ui.events.investigate") : t("ui.events.clear"), tone: events.some((e) => e.status === "failure") ? "rose" : "lime" }}
          icon={<ScrollText size={16} />}
        />
      </div>

      {feedback && (
        <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">
          {feedback}
        </div>
      )}

      <section className="space-y-4">
        <SectionTitle
          title={t("ui.events.log")}
          description={t("ui.events.log_desc")}
          eyebrow={t("ui.events.log")}
          actions={<span className="chip chip-lime">{t("ui.common.rows", { n: filtered.length })}</span>}
        />
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3 sm:flex-row sm:items-center">
          <SearchField
            label={t("ui.events.search_ph")}
            placeholder={t("ui.events.search_ph")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t("ui.events.filter_type")}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | ProgramEvent["type"])}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              {TYPE_OPTIONS.map((tt) => (
                <option key={tt} value={tt}>
                  {tt === "all" ? t("ui.events.all_types") : tt}
                </option>
              ))}
            </select>
            <select
              aria-label={t("ui.events.filter_status")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ProgramEventStatus)}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            >
              {STATUS_OPTIONS.map((ss) => (
                <option key={ss} value={ss}>
                  {ss === "all" ? t("ui.events.all_statuses") : ss}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t("ui.events.empty_title")}
            description={t("ui.events.empty_desc")}
            icon={<ScrollText size={18} />}
          />
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, visibleCount).map((event) => (
              <article
                key={event.id}
                className={`card flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4 ${
                  event.read ? "" : "ring-1 ring-inset ring-[color:var(--color-lime)]/30"
                }`}
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-32">
                  <span className={`chip chip-${STATUS_TONES[event.status]}`}>
                    {event.statusLabel}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg tracking-tight text-[color:var(--color-fg)]">
                      {event.title}
                    </h3>
                    <span className="rounded border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)]">
                      {event.type}
                    </span>
                    {!event.read && (
                      <span className="chip chip-lime">{t("ui.events.unread_tag")}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[color:var(--color-muted)]">
                    {event.detail}
                  </p>
                  <div className="mt-2 font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                    {new Date(event.occurredAt).toLocaleString()}
                  </div>
                </div>
                {!event.read && (
                  <button
                    type="button"
                    onClick={() => markRead(event.id)}
                    className="shrink-0 self-start rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                  >
                    {t("ui.events.read")}
                  </button>
                )}
              </article>
            ))}
            {visibleCount < filtered.length && (
              <div className="flex justify-center py-4">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => Math.min(prev + 20, filtered.length))}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-5 py-2 font-mono text-xs tracking-wider text-[color:var(--color-muted)] hover:border-[color:var(--color-border-bright)] hover:text-[color:var(--color-fg)] transition-colors"
                >
                  {t("ui.events.load_more")} ({filtered.length - visibleCount})
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}