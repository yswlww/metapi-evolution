import { useState } from "react";
import { usageRows, type DashboardAnalysis, type ModelUsage } from "./dashboard";
import { useObservationLabels } from "./labels";
export default function ModelAnalysis({ rows, details, defaultScope }: { rows: ModelUsage[]; details: DashboardAnalysis | null; defaultScope: boolean }) {
  const l = useObservationLabels(); const [tab, setTab] = useState("calls"); const [query, setQuery] = useState("");
  const ranking = defaultScope ? new Map(details?.callRanking?.map((r) => [r.model, r]) ?? []) : new Map<string, ModelUsage>();
  const metric = tab === "spend" ? "spend" : tab === "tokens" ? "tokens" : "calls";
  const ordered = usageRows(rows, metric, query);
  const tabs = [["spend", l("Spend distribution", "消耗分布")], ["trend", l("Spend trend", "消耗趨勢", "消耗趋势")], ["calls", l("Call distribution", "呼叫分布", "调用分布")], ["rank", l("Ranking", "排行榜")], ["tokens", l("Token distribution", "Token 分布")]];
  return <div className="card space-y-3 p-4">
    <div className="flex flex-wrap gap-2" role="tablist">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`chip ${tab === key ? "chip-lime" : ""}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === "trend" ? defaultScope ? <div className="overflow-x-auto"><p className="text-xs">{l("Server model-analysis window", "伺服器模型分析時段", "服务器模型分析时段")}: {details?.window?.start ?? "—"} – {details?.window?.end ?? "—"}</p><table className="w-full text-left text-xs"><thead><tr><th className="p-2">{l("Date", "日期")}</th><th className="p-2">{l("Spend (USD)", "消耗（USD）")}</th></tr></thead><tbody>{details?.spendTrend?.map((r) => <tr key={r.day}><td className="p-2">{r.day}</td><td className="p-2">${r.spend.toFixed(6)}</td></tr>)}</tbody></table></div> : <p className="text-xs">{l("The backend supplies spend trend and success/latency ranking only for its default all-site analysis window. Select all sites and 7 days to inspect those metrics.", "後端僅在預設全站分析時段提供消耗趨勢與成功率／延遲排名。請選全部站點與 7 天查看。", "后端仅在默认全站分析时段提供消耗趋势与成功率／延迟排名。请选择全部站点与 7 天查看。")}</p> : <>
      <label className="text-xs">{l("Filter models", "篩選模型", "筛选模型")} <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-2" /></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{[l("Model", "模型"), l("Calls", "呼叫數", "调用数"), l("Spend (USD)", "消耗（USD）"), "Tokens", l("Share", "占比"), ...(tab === "rank" ? [l("Success rate", "成功率"), l("Average latency", "平均延遲", "平均延迟")] : [])].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{ordered.map((r) => <tr key={r.model} className="border-t border-[color:var(--color-border)]"><td className="p-2">{r.model}</td><td className="p-2">{r.calls.toLocaleString()}</td><td className="p-2">${r.spend.toFixed(6)}</td><td className="p-2">{r.tokens.toLocaleString()}</td><td className="p-2">{r.share.toFixed(1)}%</td>{tab === "rank" && <><td className="p-2">{ranking.get(r.model)?.successRate == null ? "—" : `${ranking.get(r.model)!.successRate!.toFixed(1)}%`}</td><td className="p-2">{ranking.get(r.model)?.avgLatencyMs == null ? "—" : `${ranking.get(r.model)!.avgLatencyMs}ms`}</td></>}</tr>)}</tbody></table></div>
      {!ordered.length && <p>{l("No model usage", "沒有模型用量", "没有模型用量")}</p>}
    </>}
  </div>;
}
