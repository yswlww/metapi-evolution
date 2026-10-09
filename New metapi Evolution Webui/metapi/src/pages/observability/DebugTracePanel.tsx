import { useEffect, useState } from "react";
import { fetchRuntimeSettings, updateRuntimeSettings, fetchProxyDebugTraces, fetchProxyDebugTraceDetail } from "../../lib/source";
import { useToast } from "../../components/Toast";
import { useObservationLabels } from "./labels";
import { normalizeDebugSettings, debugSettingsPayload, type DebugSettings } from "./proxyLogs";
interface Trace { id: number; requestedModel?: string | null; downstreamPath?: string; createdAt?: string; finalStatus?: string | null; finalHttpStatus?: number | null; sessionId?: string | null; clientKind?: string | null }
interface TraceDetail { trace: Record<string, unknown>; attempts: Array<Record<string, unknown>> }
function decoded(row: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(row).map(([key, value]) => { if (key.endsWith("Json") && typeof value === "string") { try { return [key, JSON.parse(value)]; } catch { /* Keep actual non-JSON content. */ } } return [key, value]; })); }
export default function DebugTracePanel({ refreshKey }: { refreshKey: number }) {
  const l = useObservationLabels(); const { showToast } = useToast();
  const [draft, setDraft] = useState<DebugSettings | null>(null); const [busy, setBusy] = useState(false);
  const [traces, setTraces] = useState<Trace[]>([]); const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<number | null>(null); const [detail, setDetail] = useState<TraceDetail | null>(null); const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  useEffect(() => { let active = true; setBusy(true); Promise.all([fetchRuntimeSettings(), fetchProxyDebugTraces({ limit })]).then(([settings, rows]) => { if (active) { setDraft(normalizeDebugSettings(settings)); setTraces(rows as Trace[]); } }).catch((err) => { if (active) showToast(err instanceof Error ? err.message : l("Could not load debug settings", "無法載入調試設定", "无法加载调试设置")); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [refreshKey, limit]);
  useEffect(() => { setDetail(null); setError(null); setLoadingDetail(false); if (selected === null) return; let active = true; setLoadingDetail(true); fetchProxyDebugTraceDetail(selected).then((d) => { if (active) setDetail(d as TraceDetail); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : l("Detail unavailable", "無法取得詳細資料", "无法获取详情")); }).finally(() => { if (active) setLoadingDetail(false); }); return () => { active = false; }; }, [selected, refreshKey]);
  const save = async () => {
    if (!draft) return; setBusy(true);
    try {
      let payload: DebugSettings;
      try { payload = debugSettingsPayload(draft); } catch { throw new Error(l("Retention must be an integer ≥ 1 hour; capture size must be an integer ≥ 1024 bytes.", "保留時間須為 ≥ 1 的整數小時；採集上限須為 ≥ 1024 的整數位元組。", "保留时间须为 ≥ 1 的整数小时；采集上限须为 ≥ 1024 的整数字节。")); }
      const result = await updateRuntimeSettings(payload) as { success?: boolean; message?: string };
      if (result?.success === false) throw new Error(result.message || l("Save failed", "儲存失敗", "保存失败"));
      setDraft(normalizeDebugSettings(await fetchRuntimeSettings()));
      showToast(l("Debug settings saved and reloaded", "調試設定已儲存並重載", "调试设置已保存并重载"));
    } catch (err) { showToast(err instanceof Error ? err.message : l("Save failed", "儲存失敗", "保存失败")); } finally { setBusy(false); }
  };
  const flags: Array<[keyof DebugSettings, string]> = [["proxyDebugTraceEnabled", l("Enable tracing", "啟用追蹤", "启用追踪")], ["proxyDebugCaptureHeaders", l("Capture headers", "採集標頭", "采集头信息")], ["proxyDebugCaptureBodies", l("Capture bodies", "採集正文", "采集正文")], ["proxyDebugCaptureStreamChunks", l("Capture stream chunks", "採集串流分片", "采集流式分片")]];
  const fields: Array<[keyof DebugSettings, string, string]> = [["proxyDebugTargetSessionId", l("Target session", "目標工作階段", "目标会话"), "text"], ["proxyDebugTargetClientKind", l("Target client kind", "目標客戶端類型", "目标客户端类型"), "text"], ["proxyDebugTargetModel", l("Target model", "目標模型", "目标模型"), "text"], ["proxyDebugRetentionHours", l("Retention (hours)", "保留時間（小時）", "保留时间（小时）"), "number"], ["proxyDebugMaxBodyBytes", l("Capture limit (bytes)", "採集上限（位元組）", "采集上限（字节）"), "number"]];
  return <section className="card space-y-4 p-4">
    <h2 className="text-lg">{l("Debug capture & attempts", "調試採集與嘗試", "调试采集与尝试")}</h2>
    <p className="text-xs text-[color:var(--color-muted)]">{l("Captured headers, payloads and stream chunks may contain sensitive data. Restrict targets and retention. Missing capture data is never reconstructed.", "採集的標頭、內容與串流可能包含敏感資料。請限制目標與保留時間；不會重建缺失資料。", "采集的头信息、内容与流可能包含敏感数据。请限制目标与保留时间；不会重建缺失数据。")}</p>
    {draft && <>
      <div className="flex flex-wrap gap-4">{flags.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy} checked={Boolean(draft[key])} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />{label}</label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label, type]) => <label key={key} className="text-xs">{label}<input className="mt-1 block w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-2" type={type} value={String(draft[key])} disabled={busy} onChange={(e) => setDraft({ ...draft, [key]: type === "number" ? Number(e.target.value) : e.target.value })} /></label>)}</div>
      <div className="flex gap-3"><button type="button" className="chip chip-lime" disabled={busy} onClick={save}>{l("Save capture settings", "儲存採集設定", "保存采集设置")}</button></div>
    </>}
    <label className="text-xs">{l("Recent traces", "近期追蹤", "近期追踪")} <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded bg-[color:var(--color-panel-2)] p-1">{[20, 50, 100, 200].map((n) => <option key={n}>{n}</option>)}</select></label>
    {traces.map((tr) => <button type="button" key={tr.id} className="block w-full rounded border border-[color:var(--color-border)] p-2 text-left text-xs" onClick={() => setSelected(selected === tr.id ? null : tr.id)}>{tr.requestedModel || "—"} · {tr.downstreamPath || "—"} · {tr.clientKind || "—"} · {tr.sessionId || "—"} · {tr.finalStatus || "—"} · HTTP {tr.finalHttpStatus ?? "—"} · {tr.createdAt || "—"}</button>)}
    {traces.length === 0 && <p className="text-xs">{l("No captured traces", "沒有採集追蹤", "没有采集追踪")}</p>}
    {selected !== null && loadingDetail && <p role="status">{l("Loading…", "載入中…", "加载中…")}</p>}{selected !== null && error && <p role="alert">{error}</p>}
    {selected !== null && detail && <div className="space-y-3"><h3>{l("Captured request, response & routing state", "已採集請求、回應與路由狀態", "已采集请求、响应与路由状态")}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(decoded(detail.trace), null, 2)}</pre>
      <h3>{l("Endpoint attempts", "端點嘗試", "端点尝试")} ({detail.attempts.length})</h3>{detail.attempts.map((attempt, i) => <details key={String(attempt.id ?? i)} open className="rounded border border-[color:var(--color-border)] p-2"><summary>{String(attempt.attemptIndex ?? i)} · {String(attempt.endpoint ?? "—")} · HTTP {String(attempt.responseStatus ?? "—")}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(decoded(attempt), null, 2)}</pre></details>)}
    </div>}
  </section>;
}
