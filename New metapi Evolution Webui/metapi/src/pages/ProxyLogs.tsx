import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Download, Filter, Search } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import type { ProxyLogEntry } from "../data/prototype";
import { DATA_MODE, fetchProxyLogs, fetchProxyLogDetail, fetchProxyDebugTraces, fetchProxyDebugTraceDetail } from "../lib/source";

type StatusFilter = "all" | ProxyLogEntry["status"];
// Backend proxy-log item shape (ProxyLogListItem).
interface BackendLogItem {
  id: number;
  createdAt: string;
  modelRequested: string;
  modelActual?: string | null;
  status: string;
  latencyMs: number;
  totalTokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  estimatedCost?: number | null;
  siteName?: string | null;
  downstreamKeyName?: string | null;
  clientAppName?: string | null;
  errorMessage?: string | null;
}

function mapBackendLog(raw: BackendLogItem): ProxyLogEntry {
  const status = raw.status === "success" ? "success" as const
    : raw.status === "pending" ? "pending" as const
    : "error" as const;
  return {
    id: String(raw.id),
    model: raw.modelRequested ?? raw.modelActual ?? "unknown",
    channel: raw.siteName ?? raw.downstreamKeyName ?? raw.clientAppName ?? "—",
    status,
    latencyMs: raw.latencyMs ?? 0,
    cost: raw.estimatedCost ?? 0,
    requestTokens: raw.promptTokens ?? 0,
    responseTokens: raw.completionTokens ?? raw.totalTokens ?? 0,
    createdAt: raw.createdAt ?? "",
  };
}

export default function ProxyLogs() {
  const t = useUiText();
  const { showToast } = useToast();
  const [apiLogs, setApiLogs] = useState<ProxyLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ totalCount?: number; successCount?: number; failedCount?: number; totalCost?: number; totalTokensAll?: number } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<string | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  // Advanced filters: client, site, time range.
  const [clientFilter, setClientFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [traceListOpen, setTraceListOpen] = useState(false);
  const [traceList, setTraceList] = useState<any[]>([]);

  // Fetch the real log detail (route/channel/http status/billing) on trace open.
  const toggleTrace = async (id: string) => {
    if (traceId === id) {
      setTraceId(null);
      setTraceDetail(null);
      return;
    }
    setTraceId(id);
    setTraceLoading(true);
    setTraceDetail(null);
    try {
      const detail = await fetchProxyLogDetail(Number(id));
      setTraceDetail(JSON.stringify(detail, null, 2));
    } catch (err) {
      setTraceDetail(err instanceof Error ? err.message : "Failed to load detail.");
    } finally {
      setTraceLoading(false);
    }
  };

  const reload = async (resetPage = false) => {
    if (resetPage) setPage(1);
    try {
      const data = await fetchProxyLogs({
        limit: perPage,
        offset: (page - 1) * perPage,
        // Backend only recognizes success/failed; map the UI "error" filter
        // to "failed" so the request actually filters server-side.
        ...(statusFilter === "error" ? { status: "failed" } : statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(clientFilter.trim() ? { client: clientFilter.trim() } : {}),
        ...(siteFilter ? { siteId: siteFilter } : {}),
        // Send naive local ISO strings (no Z) so `new Date()` on the server
        // parses both boundaries in the server's local timezone consistently.
        ...(fromFilter ? { from: `${fromFilter}T00:00:00` } : {}),
        ...(toFilter ? { to: `${toFilter}T23:59:59` } : {}),
      });
      setApiLogs((data.logs as BackendLogItem[]).map(mapBackendLog));
      setTotal(data.total);
      setSummary(data.summary as typeof summary);
    } catch (err) {
      setApiLogs([]);
      setTotal(0);
      showToast(err instanceof Error ? err.message : "Failed to load logs.");
    }
  };

  useEffect(() => { reload(false); }, [perPage]);

  // Reload on page/status/search/filters change with debounce.
  useEffect(() => {
    if (DATA_MODE === "prototype") return;
    const timer = window.setTimeout(() => reload(false), 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, search, clientFilter, siteFilter, fromFilter, toFilter]);

  const allLogs = apiLogs;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allLogs.filter((log) => {
      const matchSearch = !q || log.model.toLowerCase().includes(q) || log.channel.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || log.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, allLogs]);

  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const successCount = filtered.filter((l) => l.status === "success").length;
  const errorCount = filtered.filter((l) => l.status === "error").length;
  const totalCost = filtered.reduce((a, l) => a + l.cost, 0);

  const toggleDebugTraces = async () => {
    if (traceListOpen) { setTraceListOpen(false); return; }
    setTraceListOpen(true);
    try {
      const traces = await fetchProxyDebugTraces({ limit: 20 });
      setTraceList(traces as any[]);
    } catch (err) {
      setTraceList([]);
      showToast(err instanceof Error ? err.message : "Failed to load debug traces.");
    }
  };

  const handleExport = () => {
    const rows = [["status", "model", "channel", "latency_ms", "cost", "created_at"]];
    for (const log of allLogs) {
      rows.push([log.status, log.model, log.channel, String(log.latencyMs), log.cost.toFixed(4), log.createdAt]);
    }
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proxy-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Logs exported.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observe"
        title={t("ui.proxylogs.page_title")}
        description={t("ui.proxylogs.page_desc")}
        actions={
          <button type="button" onClick={handleExport}
            className="flex h-9 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]">
            <Download size={13} /> EXPORT
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("ui.proxylogs.total_requests")} value={summary?.totalCount ?? total} icon={<ScrollText size={16} />} />
        <StatCard label={t("ui.proxylogs.success")} value={summary?.successCount ?? successCount} trend={{ label: total ? `${(((summary?.successCount ?? successCount) / total) * 100).toFixed(1)}%` : "0%", tone: "lime" }} icon={<CheckCircle2 size={16} />} />
        <StatCard label={t("ui.proxylogs.errors")} value={summary?.failedCount ?? errorCount} trend={{ label: errorCount > 0 ? "investigate" : "clear", tone: errorCount > 0 ? "rose" : "lime" }} icon={<AlertTriangle size={16} />} />
        <StatCard label={t("ui.proxylogs.total_cost")} value={`$${(summary?.totalCost ?? totalCost).toFixed(4)}`} icon={<DollarSign size={16} />} />
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchField label={t("ui.proxylogs.search_label")} placeholder={t("ui.proxylogs.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md flex-1" />
        <div className="flex gap-1.5">
          {(["all", "success", "error", "pending"] as StatusFilter[]).map((s) => (
            <button key={s} type="button" onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                statusFilter === s
                  ? "border-[color:var(--color-border-bright)] bg-[color:var(--color-panel)] text-[color:var(--color-fg)]"
                  : "border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              }`}>
              {s === "all" ? "ALL" : s === "success" ? "OK" : s === "error" ? "FAILED" : "RETRIED"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-[color:var(--color-muted)]">{t("ui.proxylogs.page")}</span>
          {[10, 20, 50].map((n) => (
            <button key={n} type="button" onClick={() => { setPerPage(n); setPage(1); }}
              className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-wider transition-colors ${
                perPage === n ? "border-[color:var(--color-border-bright)] bg-[color:var(--color-panel)] text-[color:var(--color-fg)]" : "border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              }`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced filters: client, site, time range, debug traces */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.proxylogs.client")}</span>
          <input
            value={clientFilter}
            onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            placeholder="app:curl or family:openai"
            title="Backend accepts app:&lt;name&gt; or family:&lt;family&gt;"
            className="h-8 w-48 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.proxylogs.site_id")}</span>
          <input
            type="number"
            value={siteFilter}
            onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
            placeholder="e.g. 611"
            className="h-8 w-28 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.proxylogs.from")}</span>
          <input
            type="date"
            value={fromFilter}
            onChange={(e) => { setFromFilter(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.proxylogs.to")}</span>
          <input
            type="date"
            value={toFilter}
            onChange={(e) => { setToFilter(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
        </label>
        <button
          type="button"
          onClick={toggleDebugTraces}
          className={`ml-auto h-8 rounded-lg border px-3 font-mono text-[10px] tracking-wider ${
            traceListOpen
              ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
              : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          }`}
        >
          DEBUG TRACES
        </button>
      </div>

      {traceListOpen && (
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--color-border)] px-4 py-2 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-lime)]">{t("ui.proxylogs.debug_traces")}</div>
          {traceList.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--color-muted)]">{t("ui.proxylogs.no_traces")}</div>
          ) : (
            <div className="max-h-64 overflow-auto">
              {traceList.map((tr) => (
                <TraceRow key={tr.id ?? tr.traceId ?? JSON.stringify(tr).slice(0, 20)} trace={tr} />
              ))}
            </div>
          )}
        </div>
      )}

      {paginated.length === 0 ? (
        <EmptyState title={t("ui.proxylogs.no_match")} description={t("ui.proxylogs.no_match_desc")} icon={<ScrollText size={18} />} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.status")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.model")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.channel")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.latency")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.cost")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.tokens")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.proxylogs.time")}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((log) => (
                  <Fragment key={log.id}>
                  <tr className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider ${
                        log.status === "success" ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" :
                        log.status === "error" ? "bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]" :
                        "bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)]"
                      }`}>
                        {log.status === "success" ? <CheckCircle2 size={10} /> : log.status === "error" ? <AlertTriangle size={10} /> : <Clock size={10} />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]">{log.model}</td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{log.channel}</td>
                    <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">{log.latencyMs}ms</td>
                    <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">${log.cost.toFixed(4)}</td>
                    <td className="px-4 py-3 font-mono text-[color:var(--color-muted)]">{log.requestTokens}→{log.responseTokens}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-muted)]">{new Date(log.createdAt).toLocaleTimeString()}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => toggleTrace(log.id)}
                        className={`rounded-md border px-2 py-1 font-mono text-[9px] tracking-wider transition-colors ${
                          traceId === log.id ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                        }`}>
                        TRACE
                      </button>
                    </td>
                  </tr>
                  {traceId === log.id && (
                    <tr className="bg-[color:var(--color-panel)]/30">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 p-3">
                          <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-lime)]">{t("ui.proxylogs.log_detail")}</div>
                          <pre className="whitespace-pre-wrap font-mono text-[10px] leading-5 text-[color:var(--color-muted)]">{traceLoading ? "Loading detail…" : traceDetail ?? traceContent(log)}</pre>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-4 py-3">
              <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 font-mono text-[10px] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                  PREV
                </button>
                <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 font-mono text-[10px] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                  NEXT
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function traceContent(log: ProxyLogEntry): string {
  return [
    "request:",
    "  POST /v1/chat/completions",
    `  model: ${log.model}`,
    `  channel: ${log.channel}`,
    "  headers:",
    "    authorization: Bearer ***",
    `    x-metapi-trace: ${log.id}`,
    "",
    "response:",
    "  status: 200 OK",
    `  latency: ${log.latencyMs}ms`,
    `  tokens: in=${log.requestTokens} out=${log.responseTokens}`,
    `  cost: $${log.cost.toFixed(4)}`,
  ].join("\n");
}

// A single debug trace row — click to load the per-trace detail.
function TraceRow({ trace }: { trace: any }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const id = Number(trace.id ?? trace.traceId);
  const label = trace.modelRequested ?? trace.downstreamPath ?? `trace-${id ?? "?"}`;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!Number.isFinite(id) || id <= 0) { setDetail("No trace id available."); return; }
    setLoading(true);
    try {
      const d = await fetchProxyDebugTraceDetail(id);
      setDetail(JSON.stringify(d, null, 2));
    } catch (err) {
      setDetail(err instanceof Error ? err.message : "Failed to load trace detail.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-b border-[color:var(--color-border)]/50 last:border-0">
      <button type="button" onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.03]">
        <span className="truncate font-mono text-[10px]">{label}</span>
        <span className="ml-auto shrink-0 font-mono text-[9px] text-[color:var(--color-muted)]">
          {open ? "close" : "detail"}
        </span>
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto px-4 pb-3 font-mono text-[10px] text-[color:var(--color-muted)]">
          {loading ? "Loading detail…" : detail ?? "—"}
        </pre>
      )}
    </div>
  );
}

function ScrollText({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h12a2 2 0 002-2v-2H10v2a2 2 0 01-2 2zm0 0H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v8"/><path d="M8 2v3M8 11v0"/></svg>;
}
function DollarSign({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
}
