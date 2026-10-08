import { Fragment, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Download, RefreshCw, ScrollText, DollarSign } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { fetchProxyLogDetail } from "../lib/source";
import { fetchProxyPage, fetchProxyMeta, type ProxyMeta } from "./observability/api";
import { proxyQuery, proxyMetaQuery } from "./observability/proxyLogs";
import { useObservationLabels } from "./observability/labels";
import DebugTracePanel from "./observability/DebugTracePanel";
interface LogItem {
  id: number; createdAt: string; modelRequested: string | null; modelActual?: string | null; status: string;
  latencyMs: number | null; isStream?: boolean | null; firstByteLatencyMs?: number | null;
  promptTokens?: number | null; completionTokens?: number | null; totalTokens?: number | null;
  estimatedCost?: number | null; siteName?: string | null; username?: string | null; retryCount?: number;
  clientAppName?: string | null; downstreamKeyName?: string | null; usageSource?: string | null;
}
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export default function ProxyLogs() {
  const t = useUiText(); const l = useObservationLabels(); const { showToast } = useToast();
  const [logs, setLogs] = useState<LogItem[]>([]); const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<ProxyMeta | null>(null); const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1); const [perPage, setPerPage] = useState(10);
  const [clientFilter, setClientFilter] = useState(""); const [siteFilter, setSiteFilter] = useState("");
  const [fromFilter, setFromFilter] = useState(""); const [toFilter, setToFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0); const [autoRefresh, setAutoRefresh] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [traceId, setTraceId] = useState<number | null>(null); const [traceDetail, setTraceDetail] = useState<unknown>(null);
  const [traceError, setTraceError] = useState<string | null>(null); const [traceLoading, setTraceLoading] = useState(false);
  const querySequence = useRef(0);
  const query = proxyQuery({ page, pageSize: perPage, status: statusFilter, search, client: clientFilter, siteId: siteFilter, from: fromFilter, to: toFilter });
  // Stable across page/size changes; status still changes client-option metadata.
  const metaQuery = proxyMetaQuery(query);
  useEffect(() => {
    const id = ++querySequence.current; setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        // Server query rows are the final visible page; never filter or slice twice.
        const data = await fetchProxyPage<LogItem>(query);
        if (id !== querySequence.current) return;
        setLogs(data.items ?? []); setTotal(data.total);
      } catch (err) { if (id === querySequence.current) showToast(err instanceof Error ? err.message : t("ui.proxylogs.err_load")); }
      finally { if (id === querySequence.current) setLoading(false); }
    }, 200);
    return () => { window.clearTimeout(timer); querySequence.current++; };
  }, [query, refreshKey]);
  useEffect(() => {
    let active = true; setMetaLoading(true); setMeta(null);
    const timer = window.setTimeout(async () => {
      try { const metadata = await fetchProxyMeta(metaQuery); if (active) setMeta(metadata); }
      catch (err) { if (active) showToast(err instanceof Error ? err.message : t("ui.proxylogs.err_load")); }
      finally { if (active) setMetaLoading(false); }
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [metaQuery, refreshKey]);
  useEffect(() => { if (!autoRefresh) return; const timer = window.setInterval(() => setRefreshKey((key) => key + 1), autoRefresh * 1000); return () => window.clearInterval(timer); }, [autoRefresh]);
  useEffect(() => {
    if (traceId === null) return;
    let active = true; setTraceLoading(true); setTraceDetail(null); setTraceError(null);
    fetchProxyLogDetail(traceId).then((detail) => { if (active) setTraceDetail(detail); }).catch((err) => { if (active) setTraceError(err instanceof Error ? err.message : t("ui.proxylogs.err_load_detail")); }).finally(() => { if (active) setTraceLoading(false); });
    return () => { active = false; };
  }, [traceId, refreshKey]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  useEffect(() => { if (!loading) setPage((p) => Math.min(p, totalPages)); }, [totalPages, loading]);
  const exportPage = () => {
    const rows: unknown[][] = [["status", "modelRequested", "modelActual", "site", "client", "stream", "firstByteLatencyMs", "latencyMs", "cost", "promptTokens", "completionTokens", "usageSource", "createdAt"]];
    for (const log of logs) rows.push([log.status, log.modelRequested, log.modelActual, log.siteName, log.clientAppName, log.isStream, log.firstByteLatencyMs, log.latencyMs, log.estimatedCost, log.promptTokens, log.completionTokens, log.usageSource, log.createdAt]);
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `proxy-logs-page-${page}.csv`; a.click(); URL.revokeObjectURL(url);
    showToast(l("Current page exported", "已匯出目前頁面", "已导出当前页面"));
  };
  const summary = meta?.summary;
  const cls = "h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 text-xs";
  return <div className="space-y-6">
    <PageHeader eyebrow={t("ui.proxylogs.eyebrow_observe")} title={t("ui.proxylogs.page_title")} description={t("ui.proxylogs.page_desc")} actions={<>
      <button type="button" className={cls} disabled={loading || metaLoading} onClick={() => setRefreshKey((n) => n + 1)}><RefreshCw size={12} className="inline" /> {l("Refresh", "刷新")}</button>
      <button type="button" className={cls} disabled={!logs.length} onClick={exportPage}><Download size={12} className="inline" /> {l("Export current page", "匯出目前頁面", "导出当前页面")}</button>
    </>} />
    <p className="text-xs text-[color:var(--color-muted)]">{l("All-status summary — status filter applies to the table only; other filters apply to these totals.", "全部狀態摘要 — 狀態篩選僅作用於表格；其他篩選作用於此統計。", "全部状态摘要 — 状态筛选仅作用于表格；其他筛选作用于此统计。")}</p>
    {metaLoading && <p role="status" className="text-xs">{l("Loading summary…", "載入摘要中…", "加载摘要中…")}</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label={t("ui.proxylogs.total_requests")} value={summary?.totalCount ?? "—"} icon={<ScrollText size={16} />} />
      <StatCard label={t("ui.proxylogs.success")} value={summary?.successCount ?? "—"} detail={summary?.totalCount ? `${(summary.successCount / summary.totalCount * 100).toFixed(1)}%` : "—"} icon={<CheckCircle2 size={16} />} />
      <StatCard label={t("ui.proxylogs.errors")} value={summary?.failedCount ?? "—"} icon={<AlertTriangle size={16} />} />
      <StatCard label={t("ui.proxylogs.total_cost")} value={summary ? `$${summary.totalCost.toFixed(4)}` : "—"} icon={<DollarSign size={16} />} />
    </div>
    <div className="card flex flex-wrap items-end gap-3 p-3">
      <SearchField label={t("ui.proxylogs.search_label")} placeholder={t("ui.proxylogs.search_ph")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="min-w-48 flex-1" />
      <label className="text-xs">{t("ui.proxylogs.status")}<select className={`ml-2 ${cls}`} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="all">{t("ui.proxylogs.status_all")}</option><option value="success">{t("ui.proxylogs.success")}</option><option value="failed">{l("Non-success (including retried)", "非成功（包含重試）", "非成功（包含重试）")}</option></select></label>
      <label className="text-xs">{t("ui.proxylogs.client")}<select className={`ml-2 ${cls}`} value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}><option value="">{l("All clients", "全部客戶端", "全部客户端")}</option>{meta?.clientOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="text-xs">{l("Site", "站點", "站点")}<select className={`ml-2 ${cls}`} value={siteFilter} onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}><option value="">{l("All sites", "全部站點", "全部站点")}</option>{meta?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-xs">{t("ui.proxylogs.from")}<input type="date" className={`ml-2 ${cls}`} value={fromFilter} onChange={(e) => { setFromFilter(e.target.value); setPage(1); }} /></label>
      <label className="text-xs">{t("ui.proxylogs.to")}<input type="date" className={`ml-2 ${cls}`} value={toFilter} onChange={(e) => { setToFilter(e.target.value); setPage(1); }} /></label>
      <label className="text-xs">{l("Auto refresh", "自動刷新", "自动刷新")}<select className={`ml-2 ${cls}`} value={autoRefresh} onChange={(e) => setAutoRefresh(Number(e.target.value))}><option value={0}>{l("Off", "關閉", "关闭")}</option>{[15, 30, 60].map((n) => <option key={n} value={n}>{n}s</option>)}</select></label>
      <button type="button" className={cls} onClick={() => setDebugOpen((open) => !open)}>{t("ui.proxylogs.debug_traces")}</button>
    </div>
    {debugOpen && <DebugTracePanel refreshKey={refreshKey} />}
    {loading && <p role="status" className="text-xs">{l("Loading…", "載入中…", "加载中…")}</p>}
    {!logs.length && !loading ? <EmptyState title={t("ui.proxylogs.no_match")} description={t("ui.proxylogs.no_match_desc")} /> : <div className="card overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[color:var(--color-border)]">
      {[t("ui.proxylogs.status"), t("ui.proxylogs.model"), t("ui.proxylogs.channel"), t("ui.proxylogs.latency"), l("Stream / first byte", "串流／首位元組", "流式／首字节"), t("ui.proxylogs.cost"), t("ui.proxylogs.tokens"), t("ui.proxylogs.time"), l("Detail", "詳細", "详情")].map((label, i) => <th key={i} className="p-3 font-mono">{label}</th>)}
    </tr></thead><tbody>{logs.map((log) => <Fragment key={log.id}><tr className="border-b border-[color:var(--color-border)]/50">
      <td className="p-3"><span className={`chip chip-${log.status === "success" ? "lime" : log.status === "retried" ? "amber" : "rose"}`}>{log.status === "success" ? <CheckCircle2 size={10} /> : log.status === "retried" ? <Clock size={10} /> : <AlertTriangle size={10} />}{log.status}</span></td>
      <td className="p-3">{log.modelRequested || "—"}{log.modelActual && log.modelActual !== log.modelRequested && <p className="text-[color:var(--color-muted)]">→ {log.modelActual}</p>}</td>
      <td className="p-3">{log.siteName || "—"}<p>{log.username || log.downstreamKeyName || log.clientAppName || "—"}</p></td>
      <td className="p-3 font-mono">{log.latencyMs == null ? "—" : `${log.latencyMs}ms`}</td>
      <td className="p-3 font-mono">{log.isStream == null ? "—" : log.isStream ? l("Stream", "串流", "流式") : l("Non-stream", "非串流", "非流式")} / {log.firstByteLatencyMs == null ? "—" : `${log.firstByteLatencyMs}ms`}</td>
      <td className="p-3 font-mono">{log.estimatedCost == null ? "—" : `$${log.estimatedCost.toFixed(4)}`}</td>
      <td className="p-3 font-mono">{log.promptTokens ?? "—"} → {log.completionTokens ?? "—"}<p>{log.usageSource || "—"}</p></td>
      <td className="p-3">{log.createdAt || "—"}</td><td className="p-3"><button type="button" className="chip" onClick={() => setTraceId(traceId === log.id ? null : log.id)}>{l("Detail", "詳細", "详情")}</button></td>
    </tr>{traceId === log.id && <tr><td colSpan={9} className="p-4"><p className="mb-2 text-xs">{l("Actual stored log, HTTP status and billing details. Uncaptured request/response bodies are unavailable.", "實際儲存的日誌、HTTP 狀態與計費明細。未採集的請求／回應正文無法取得。", "实际保存的日志、HTTP 状态与计费明细。未采集的请求／响应正文无法获取。")}</p>{traceError && <p role="alert">{traceError}</p>}<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{traceLoading ? l("Loading…", "載入中…", "加载中…") : traceDetail == null ? "—" : JSON.stringify(traceDetail, null, 2)}</pre></td></tr>}</Fragment>)}</tbody></table></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><span>{page} / {totalPages} · {total} {l("requests", "請求", "请求")}</span><label>{l("Page size", "每頁筆數", "每页条数")} <select className={cls} value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label><div className="flex gap-2"><button type="button" className={cls} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>{l("Previous", "上一頁", "上一页")}</button><button type="button" className={cls} disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>{l("Next", "下一頁", "下一页")}</button></div></div>
  </div>;
}
