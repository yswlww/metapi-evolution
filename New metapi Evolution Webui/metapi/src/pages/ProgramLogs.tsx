import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollText, RefreshCw } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { markEventRead, markAllEventsRead, clearEvents } from "../lib/source";
import { fetchEventPage, fetchUnreadCount } from "./observability/api";
import { mapEvent, appendEventPage, type ProgramEvent, type EventResult } from "./observability/events";
import { useObservationLabels } from "./observability/labels";

const PAGE_SIZE = 50;
const TYPES = ["all", "checkin", "balance", "token", "proxy", "status", "site_notice", "oauth", "key", "system", "export"];
const RESULTS: EventResult[] = ["success", "warning", "failure", "info", "skipped", "running"];
const TONES: Record<EventResult, string> = { success: "lime", warning: "amber", failure: "rose", info: "cyan", skipped: "amber", running: "cyan" };
export default function ProgramLogs() {
  const t = useUiText(); const l = useObservationLabels(); const { showToast } = useToast();
  const [events, setEvents] = useState<ProgramEvent[]>([]);
  const [query, setQuery] = useState(""); const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); const [onlyUnread, setOnlyUnread] = useState(false);
  const [unread, setUnread] = useState<number | null>(null); const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(false); const [mutating, setMutating] = useState(false);
  const sequence = useRef(0);
  const statusLabel = (s: EventResult) => s === "skipped" ? l("Skipped", "已跳過", "已跳过") : s === "running" ? l("Running", "進行中", "进行中") : s === "success" ? t("ui.proxylogs.success") : t(`ui.events.level_${s}`);
  const typeLabel = (type: string) => ({ checkin: l("Check-in", "簽到", "签到"), balance: l("Balance", "餘額", "余额"), token: l("Token", "令牌"), proxy: l("Proxy", "代理"), status: l("Status", "狀態", "状态"), site_notice: t("ui.ann.title") }[type] ?? type);

  const reload = async (append = false) => {
    const id = ++sequence.current; const nextOffset = append ? offset : 0; setLoading(true);
    try {
      const [rows, count] = await Promise.all([fetchEventPage({ offset: nextOffset, limit: PAGE_SIZE, type: typeFilter, unread: onlyUnread }), fetchUnreadCount()]);
      if (id !== sequence.current) return;
      const safeRows = Array.isArray(rows) ? rows : [];
      setEvents((prev) => append ? appendEventPage(prev, safeRows.map(mapEvent)) : safeRows.map(mapEvent));
      // Offset counts raw server rows, never deduplicated or locally filtered rows.
      setOffset(nextOffset + safeRows.length); setHasMore(safeRows.length === PAGE_SIZE); setUnread(count.count);
    } catch (err) { if (id === sequence.current) showToast(err instanceof Error ? err.message : t("ui.events.err_load")); }
    finally { if (id === sequence.current) setLoading(false); }
  };
  useEffect(() => { setEvents([]); setOffset(0); setHasMore(false); reload(); return () => { sequence.current++; }; }, [typeFilter, onlyUnread]);
  const filtered = useMemo(() => events.filter((e) => (statusFilter === "all" || e.status === statusFilter) && (!query.trim() || `${e.title} ${e.detail} ${e.type}`.toLowerCase().includes(query.trim().toLowerCase()))), [events, query, statusFilter]);
  const refreshUnread = async () => {
    try { setUnread((await fetchUnreadCount()).count); }
    catch (err) { setUnread(null); showToast(err instanceof Error ? err.message : t("ui.events.err_load")); }
  };
  const markRead = async (id: string) => {
    setMutating(true);
    try {
      await markEventRead(Number(id));
      setEvents((prev) => onlyUnread ? prev.filter((event) => event.id !== id) : prev.map((event) => event.id === id ? { ...event, read: true } : event));
      // Removing a row from the server unread set shifts all subsequent raw offsets.
      if (onlyUnread) setOffset((value) => Math.max(0, value - 1));
      await refreshUnread();
    } catch (err) { showToast(err instanceof Error ? err.message : t("ui.events.mark_read_failed")); } finally { setMutating(false); }
  };
  const markAll = async () => {
    setMutating(true);
    try {
      await markAllEventsRead();
      setEvents((prev) => onlyUnread ? [] : prev.map((event) => ({ ...event, read: true })));
      if (onlyUnread) { setOffset(0); setHasMore(false); }
      await refreshUnread(); showToast(t("ui.events.read_ok"));
    } catch (err) { showToast(err instanceof Error ? err.message : t("ui.events.mark_all_failed")); } finally { setMutating(false); }
  };
  const clearAll = async () => {
    if (!window.confirm(l("Clear all program events?", "清除全部程式事件？", "清除全部程序事件？"))) return;
    setMutating(true);
    try { await clearEvents(); setEvents([]); setOffset(0); setHasMore(false); await refreshUnread(); showToast(t("ui.events.clear_ok")); } catch (err) { showToast(err instanceof Error ? err.message : t("ui.events.clear_failed")); } finally { setMutating(false); }
  };
  return <div className="space-y-8">
    <PageHeader eyebrow={t("ui.events.eyebrow")} title={t("ui.events.title")} description={t("ui.events.desc")} actions={<>
      <button type="button" className="chip" disabled={loading || mutating} onClick={() => reload()}><RefreshCw size={12} /> {l("Refresh", "刷新")}</button>
      <button type="button" className="chip" disabled={mutating || loading || unread === 0 || unread === null} onClick={markAll}>{t("ui.events.mark_all_read")}</button>
      <button type="button" className="chip chip-rose" disabled={mutating || loading} onClick={clearAll}>{t("ui.events.clear_all")}</button>
    </>} />
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label={l("Loaded events", "已載入事件", "已加载事件")} value={events.length} icon={<ScrollText size={16} />} />
      <StatCard label={t("ui.events.unread")} value={unread ?? "—"} detail={l("All server events", "全部伺服器事件", "全部服务器事件")} />
      <StatCard label={t("ui.events.warnings")} value={events.filter((e) => e.status === "warning").length} detail={l("Loaded events only", "僅已載入事件", "仅已加载事件")} />
      <StatCard label={t("ui.events.failures")} value={events.filter((e) => e.status === "failure").length} detail={l("Loaded events only", "僅已載入事件", "仅已加载事件")} />
    </div>
    <section className="space-y-4">
      <SectionTitle title={t("ui.events.log")} description={t("ui.events.log_desc")} actions={<span className="chip">{filtered.length} / {events.length}</span>} />
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <SearchField label={t("ui.events.search_ph")} placeholder={t("ui.events.search_ph")} value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-48 flex-1" />
        <select aria-label={t("ui.events.filter_type")} disabled={mutating} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-2 text-xs">
          {TYPES.map((type) => <option key={type} value={type}>{type === "all" ? t("ui.events.all_types") : typeLabel(type)}</option>)}
        </select>
        <select aria-label={t("ui.events.filter_status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-2 text-xs">
          <option value="all">{t("ui.events.all_statuses")}</option>{RESULTS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={mutating} checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />{l("Unread only", "僅未讀", "仅未读")}</label>
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">{l("Search and result filters apply to loaded events; type and unread filters apply on the server. Load more to search older events.", "搜尋與結果篩選僅作用於已載入事件；類型與未讀由伺服器篩選。載入更多可搜尋較舊事件。", "搜索与结果筛选仅作用于已加载事件；类型与未读由服务器筛选。加载更多可搜索较旧事件。")}</p>
      {filtered.length === 0 && !loading ? <EmptyState title={t("ui.events.empty_title")} description={t("ui.events.empty_desc")} /> : filtered.map((e) => <article key={e.id} className={`card flex flex-col gap-3 p-4 sm:flex-row ${e.read ? "" : "ring-1 ring-[color:var(--color-lime)]/30"}`}>
        <span className={`chip chip-${TONES[e.status]} self-start`}>{statusLabel(e.status)}</span>
        <div className="min-w-0 flex-1"><h3 className="text-lg">{e.title}</h3><span className="text-xs text-[color:var(--color-muted)]">{typeLabel(e.type)}</span><p className="whitespace-pre-wrap text-sm">{e.detail}</p><time className="text-xs text-[color:var(--color-muted)]">{e.occurredAt ? new Date(e.occurredAt).toLocaleString() : "—"}</time></div>
        {!e.read && <button type="button" disabled={mutating || loading} className="chip self-start" onClick={() => markRead(e.id)}>{t("ui.events.read")}</button>}
      </article>)}
      {loading && <p role="status">{l("Loading…", "載入中…", "加载中…")}</p>}
      {hasMore && <button type="button" disabled={loading || mutating} className="chip" onClick={() => reload(true)}>{t("ui.events.load_more")}</button>}
    </section>
  </div>;
}
