import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { mapAnnouncement, type AnnouncementRow } from "./observability/announcements";
import { fetchAnnouncementPage } from "./observability/api";
import { useObservationLabels } from "./observability/labels";
import AnnouncementContent from "./observability/AnnouncementContent";
import { readFocusAnnouncementId } from "../../../../src/web/pages/helpers/navigationFocus";
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
  markSiteAnnouncementRead,
  markAllSiteAnnouncementsRead,
  clearSiteAnnouncements,
  syncSiteAnnouncements,
} from "../lib/source";

const FOCUS_BATCH_SIZE = 500;
const FOCUS_SCAN_LIMIT = 5000;
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


export default function SiteAnnouncements() {
  const t = useUiText();
  const l = useObservationLabels();
  const location = useLocation();
  const focusId = readFocusAnnouncementId(location.search);
  const sequence = useRef(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [focusStatus, setFocusStatus] = useState<"searching" | "found" | "bounded" | "not-found" | "error" | null>(null);
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | AnnouncementLevel>("all");
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>(() => DATA_MODE === "prototype" ? [...ANNOUNCEMENTS] : []);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = async (append = false) => {
    if (DATA_MODE === "prototype") return;
    const id = ++sequence.current; setLoading(true); setFocusStatus(focusId ? "searching" : null);
    try {
      let nextOffset = append ? offset : 0;
      const rows: AnnouncementRow[] = [];
      const limit = focusId ? FOCUS_BATCH_SIZE : 50;
      let more = false;
      do {
        const data = await fetchAnnouncementPage(nextOffset, limit);
        if (id !== sequence.current) return;
        rows.push(...data.map(mapAnnouncement)); nextOffset += data.length; more = data.length === limit;
        // No direct-id API exists. Bound automatic full-table-read endpoint requests to ten.
      } while (!append && focusId && more && rows.length < FOCUS_SCAN_LIMIT && !rows.some((a) => a.id === String(focusId)));
      const combined = append ? [...new Map([...announcements, ...rows].map((a) => [a.id, a])).values()] : rows;
      setAnnouncements(combined);
      setOffset(nextOffset); setHasMore(more);
      if (focusId) setFocusStatus(combined.some((a) => a.id === String(focusId)) ? "found" : more ? "bounded" : "not-found");
    } catch (err) {
      if (id === sequence.current) { setFocusStatus(focusId ? "error" : null); showToast(err instanceof Error ? err.message : t("ui.anno.err_load")); }
    } finally { if (id === sequence.current) setLoading(false); }
  };

  useEffect(() => { setQuery(""); setLevel("all"); reload(); return () => { sequence.current++; }; }, [focusId]);
  useEffect(() => {
    if (!focusId || !announcements.some((a) => a.id === String(focusId))) return;
    const node = document.getElementById(`announcement-${focusId}`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" }); node?.focus({ preventScroll: true });
  }, [focusId, announcements]);

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
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.events.mark_read_failed"));
    }
  };

  const markAllRead = async () => {
    try {
      await markAllSiteAnnouncementsRead();
      await reload();
      flash(t("ui.ann.marked_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.events.mark_all_failed"));
    }
  };

  const sync = async () => {
    try {
      await syncSiteAnnouncements({});
      flash(t("ui.ann.sync_ok"));
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.sync_failed"));
    }
  };

  const clearAll = async () => {
    if (!window.confirm(l("Clear all site announcements?", "清除全部站點公告？", "清除全部站点公告？"))) return;
    try {
      await clearSiteAnnouncements();
      setAnnouncements([]); setOffset(0); setHasMore(false); setFocusStatus(focusId ? "not-found" : null);
      flash(t("ui.ann.clear_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.events.clear_failed"));
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
          label={l("Loaded announcements", "已載入公告", "已加载公告")}
          value={announcements.length}
          icon={<Megaphone size={16} />}
        />
        <StatCard
          label={t("ui.events.level_warning")}
          value={byLevel("maintenance")}
          icon={<Wrench size={16} />}
        />
        <StatCard
          label={t("ui.events.level_failure")}
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

      {focusStatus === "bounded" && <p role="status" className="rounded border border-[color:var(--color-amber)]/40 p-3 text-sm">{l(`Automatic focused lookup paused after ${FOCUS_SCAN_LIMIT} rows. Focused announcement not found yet; load more to continue.`, `自動定位已在 ${FOCUS_SCAN_LIMIT} 筆後暫停。尚未找到目標公告；可載入更多繼續查找。`, `自动定位已在 ${FOCUS_SCAN_LIMIT} 条后暂停。尚未找到目标公告；可加载更多继续查找。`)} {l("Loaded", "已載入", "已加载")}: {offset}</p>}
      {focusStatus === "not-found" && <p role="status" className="text-sm">{l("Focused announcement was not found in the server results.", "伺服器結果中未找到目標公告。", "服务器结果中未找到目标公告。")}</p>}
      {focusStatus === "error" && <div role="alert" className="space-y-2 text-sm"><p>{l("Focused lookup could not finish; this does not mean the announcement is missing.", "公告定位未能完成；這不代表公告不存在。", "公告定位未能完成；这不代表公告不存在。")}</p><button type="button" disabled={loading} className="chip" onClick={() => reload()}>{l("Retry focused lookup", "重試公告定位", "重试公告定位")}</button></div>}
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
                {lvl === "all" ? t("ui.ann.all_levels") : lvl === "maintenance" ? t("ui.events.level_warning") : lvl === "security" ? t("ui.events.level_failure") : lvl === "info" ? t("ui.events.level_info") : t("ui.ann.release")}
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
                id={`announcement-${announcement.id}`}
                tabIndex={-1}
                className={`card p-4 ${focusId === Number(announcement.id) ? "ring-2 ring-[color:var(--color-cyan)]" : announcement.read ? "" : "ring-1 ring-inset ring-[color:var(--color-lime)]/30"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`chip chip-${LEVEL_TONES[announcement.level]}`}>
                        {announcement.severity === "warning" ? t("ui.events.level_warning") : announcement.severity === "error" ? t("ui.events.level_failure") : announcement.level === "info" ? t("ui.events.level_info") : t(`ui.ann.${announcement.level}`)}
                      </span>
                      {!announcement.read && (
                        <span className="chip chip-lime">{t("ui.ann.unread_tag")}</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                      {announcement.title}
                    </h3>
                    <div className="mt-1.5 max-w-3xl overflow-x-auto text-sm leading-6 text-[color:var(--color-muted)] [&_img]:max-w-full [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_pre]:overflow-auto">
                      <AnnouncementContent content={announcement.summary} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-[color:var(--color-muted)]">
                      <span>{announcement.source}</span>
                      <span>{l("First seen", "首次發現", "首次发现")}: {announcement.publishedAt || "—"}</span>
                      {announcement.readAt && <span>{l("Read at", "已讀時間", "已读时间")}: {announcement.readAt}</span>}
                      {announcement.lastSeenAt && <span>{l("Last seen", "最後發現", "最后发现")}: {announcement.lastSeenAt}</span>}
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
        <p className="text-xs text-[color:var(--color-muted)]">{l("Counts and search cover loaded announcements.", "統計與搜尋僅包含已載入公告。", "统计与搜索仅包含已加载公告。")}</p>
        {loading && <p role="status">{l("Loading…", "載入中…", "加载中…")}</p>}
        {hasMore && <button type="button" disabled={loading} className="chip" onClick={() => reload(true)}>{t("ui.events.load_more")}</button>}
      </section>
    </div>
  );
}