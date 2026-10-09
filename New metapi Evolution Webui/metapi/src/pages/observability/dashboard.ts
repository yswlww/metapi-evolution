export interface SiteTrend { date: string; sites: Record<string, { spend: number; calls: number }> }
export interface ModelUsage { model: string; calls: number; spend: number; tokens: number; successRate?: number; avgLatencyMs?: number }
export interface DashboardAnalysis { window?: { days: number; start: string; end: string }; totals?: { calls: number; spend: number; tokens: number }; spendTrend?: Array<{ day: string; spend: number }>; callRanking?: ModelUsage[] }
export function usageRows(rows: ModelUsage[], metric: "calls" | "spend" | "tokens", query = ""): Array<ModelUsage & { share: number }> {
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  return rows.filter((row) => row.model.toLowerCase().includes(query.toLowerCase())).map((row) => ({ ...row, share: total ? row[metric] / total * 100 : 0 })).sort((a, b) => b[metric] - a[metric] || a.model.localeCompare(b.model));
}
