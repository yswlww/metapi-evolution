import { useEffect, useMemo, useState } from "react";
import { Megaphone, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { ANNOUNCEMENTS, type AnnouncementLevel } from "../data/prototype";
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
  fetchAnnouncements,
  markSiteAnnouncementRead,
  markAllSiteAnnouncementsRead,
  clearSiteAnnouncements,
  syncSiteAnnouncements,
} from "../lib/source";

const LEVEL_OPTIONS: ("all" | AnnouncementLevel)[] = [
  "all",
  "release",
  "maintenance",
  "security",
  "info",
];

const LEVEL_TONES: Record<AnnouncementLevel, string> = {
  release: "lime",
  maintenance: "amber",
  security: "rose",
  info: "cyan",
};

// Backend announcement row shape.
interface BackendAnnouncement {
  id: number;
  title: string;
  summary?: string;
  message?: string;
  level?: string;
  source?: string;
  read: boolean;
  createdAt?: string;
  publishedAt?: string;
}

function mapBackendAnnouncement(raw: BackendAnnouncement): (typeof ANNOUNCEMENTS)[number] {
  const level = (["release", "maintenance", "security", "info"] as const).includes(raw.level as AnnouncementLevel)
    ? (raw.level as AnnouncementLevel)
    : "info";
  return {
    id: String(raw.id),
    title: raw.title,
    summary: raw.summary ?? raw.message ?? "",
    source: raw.source ?? "",
    level,
    read: Boolean(raw.read),
    publishedAt: raw.publishedAt ?? raw.createdAt ?? "",
  };
}

export default function SiteAnnouncements() {
  const t = useUiText();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | AnnouncementLevel>("all");
  const [announcements, setAnnouncements] = useState(() => ANNOUNCEMENTS);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = async () => {
    if (DATA_MODE === "prototype") return;
    try {
      const data = await fetchAnnouncements();
      setAnnouncements((data as BackendAnnouncement[]).map(mapBackendAnnouncement));
    } catch (err) {
      setAnnouncements([]);
      showToast(err instanceof Error ? err.message : "Failed to load announcements.");
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return announcements.filter((ann) => {
      const matchesQuery =
        q.length === 0 ||
        [ann.title, ann.summary, ann.source].join(" ").toLowerCase().includes(q);
      const matchesLevel = level === "all" || ann.level === level;
      return matchesQuery && matchesLevel;
    });
  }, [announcements, query, level]);

  const unread = announcements.filter((a) => !a.read).length;
  const byLevel = (lvl: AnnouncementLevel) =>
    announcements.filter((a) => a.level === lvl).length;

  const flash = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  };

  const markRead = async (id: string) => {
    try {
      await markSiteAnnouncementRead(Number(id));
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, read: true } : a)),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Mark read failed.");
    }
  };

  const markAllRead = async () => {
    try {
      await markAllSiteAnnouncementsRead();
      setAnnouncements((prev) => prev.map((a) => ({ ...a, read: true })));
      flash(t("ui.ann.marked_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Mark all failed.");
    }
  };

  const sync = async () => {
    try {
      await syncSiteAnnouncements({});
      flash(t("ui.ann.sync_ok"));
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed.");
    }
  };

  const clearAll = async () => {
    try {
      await clearSiteAnnouncements();
      setAnnouncements([]);
      flash(t("ui.ann.clear_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Clear failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.ann.eyebrow")}
        title={t("ui.ann.title")}
        description={t("ui.ann.desc")}
        actions={
          <>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40"
            >
              {t("ui.ann.mark_all_read")}
            </button>
            <button
              type="button"
              onClick={sync}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
            >
              <RefreshCw size={12} /> {t("ui.ann.sync")}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={announcements.length === 0}
              className="h-9 rounded-lg border border-[color:var(--color-rose)]/40 px-4 font-mono text-xs tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10 disabled:opacity-40"
            >
              {t("ui.common.clear_all")}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.ann.unread")}
          value={unread}
          detail={t("ui.ann.need_attention")}
          trend={{ label: unread > 0 ? t("ui.ann.action_required") : t("ui.ann.all_caught_up"), tone: unread > 0 ? "amber" : "lime" }}
          icon={<Megaphone size={16} />}
        />
        <StatCard
          label={t("ui.ann.release")}
          value={byLevel("release")}
          icon={<Megaphone size={16} />}
        />
        <StatCard
          label={t("ui.ann.maintenance")}
          value={byLevel("maintenance")}
          icon={<Wrench size={16} />}
        />
        <StatCard
          label={t("ui.ann.security")}
          value={byLevel("security")}
          trend={{ label: byLevel("security") > 0 ? t("ui.ann.review_recommended") : t("ui.ann.clear"), tone: byLevel("security") > 0 ? "rose" : "lime" }}
          icon={<ShieldAlert size={16} />}
        />
      </div>

      {feedback && (
        <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">
          {feedback}
        </div>
      )}

      <section className="space-y-4">
        <SectionTitle
          title={t("ui.ann.feed")}
          description={t("ui.ann.feed_desc")}
          eyebrow={t("ui.ann.feed")}
          actions={<span className="chip chip-lime">{t("ui.common.rows", { n: filtered.length })}</span>}
        />
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3 sm:flex-row sm:items-center">
          <SearchField
            label={t("ui.ann.search_ph")}
            placeholder={t("ui.ann.search_ph")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <select
            aria-label={t("ui.ann.filter_level")}
            value={level}
            onChange={(e) => setLevel(e.target.value as "all" | AnnouncementLevel)}
            className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          >
            {LEVEL_OPTIONS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl === "all" ? t("ui.ann.all_levels") : lvl}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t("ui.ann.empty_title")}
            description={t("ui.ann.empty_desc")}
            icon={<Megaphone size={18} />}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((announcement) => (
              <article
                key={announcement.id}
                className={`card p-4 ${announcement.read ? "" : "ring-1 ring-inset ring-[color:var(--color-lime)]/30"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`chip chip-${LEVEL_TONES[announcement.level]}`}>
                        {announcement.level}
                      </span>
                      {!announcement.read && (
                        <span className="chip chip-lime">{t("ui.ann.unread_tag")}</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                      {announcement.title}
                    </h3>
                    <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[color:var(--color-muted)]">
                      {announcement.summary}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                      <span>{announcement.source}</span>
                      <span>{new Date(announcement.publishedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  {!announcement.read && (
                    <button
                      type="button"
                      onClick={() => markRead(announcement.id)}
                      className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                    >
                      {t("ui.common.mark_read")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}