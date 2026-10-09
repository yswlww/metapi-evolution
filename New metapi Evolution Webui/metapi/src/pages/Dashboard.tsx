import { useCallback, useEffect, useMemo, useState } from "react";
import ModelAnalysis from "./observability/ModelAnalysis";
import { fetchDashboardAnalysis } from "./observability/api";
import { useObservationLabels } from "./observability/labels";
import type { ModelUsage, DashboardAnalysis, SiteTrend } from "./observability/dashboard";
import { Clock, DollarSign, Route, TrendingUp, Zap, Activity, Gauge, Boxes } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { fetchDashboardFeed, fetchModelBySite, probeSiteNow, type DashboardFeed } from "../lib/source";

export default function Dashboard() {
  const t = useUiText();
  const l = useObservationLabels();
  const [analysisDays, setAnalysisDays] = useState(7);
  const [analysisSite, setAnalysisSite] = useState("");
  const [analysisEpoch, setAnalysisEpoch] = useState(0);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisDetails, setAnalysisDetails] = useState<DashboardAnalysis | null>(null);
  const { showToast } = useToast();
  const [feed, setFeed] = useState<DashboardFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelAnalysis, setModelAnalysis] = useState<ModelUsage[]>([]);
  const [speedBusy, setSpeedBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchDashboardFeed();
      setFeed(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.dash.err_load"));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true; setAnalysisLoading(true); setModelAnalysis([]); setAnalysisDetails(null);
    Promise.all([fetchModelBySite({ days: analysisDays, ...(analysisSite ? { siteId: Number(analysisSite) } : {}) }), analysisDays === 7 && !analysisSite ? fetchDashboardAnalysis(analysisEpoch > 0) : Promise.resolve(null)])
      .then(([models, details]) => { if (active) { setModelAnalysis(models as ModelUsage[]); setAnalysisDetails(details?.modelAnalysis ?? null); } })
      .catch((err) => { if (active) showToast(err instanceof Error ? err.message : t("ui.dash.err_load")); })
      .finally(() => { if (active) setAnalysisLoading(false); });
    return () => { active = false; };
  }, [analysisDays, analysisSite, analysisEpoch]);

  const handleSpeedTest = async (siteId?: number) => {
    if (!siteId) return;
    setSpeedBusy(siteId);
    try {
      await probeSiteNow(siteId, { scope: "single" });
      showToast(t("ui.dash.speed_test_queued"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.dash.speed_test_failed"));
    } finally {
      setSpeedBusy(null);
    }
  };

  const kpi = feed?.summary ?? { totalBalance: 0, todaySpend: 0, todayReward: 0, avgLatency: 0, requestsPerMinute: 0, activeAccounts: 0, totalAccounts: 0, activeRoutes: 0, totalRoutes: 0 };
  const siteAvailability = feed?.siteAvailability ?? [];
  const siteTrend = (feed?.siteTrend ?? []) as unknown as SiteTrend[];
  const siteDistribution = feed?.siteDistribution ?? [];

  const totalAccountBalance = useMemo(
    () => siteDistribution.reduce((a, s) => a + (s.totalBalance ?? 0), 0),
    [siteDistribution],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("ui.dash.eyebrow_control")}
        title={t("ui.dash.dashboard")}
        description={t("ui.dash.dashboard_desc")}
        actions={
          <button type="button" onClick={() => { setLoading(true); setAnalysisEpoch((n) => n + 1); load(); }}
            className="flex h-9 items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
            <RefreshCw size={13} /> {l("Refresh all", "全部刷新")}
          </button>
        }
      />

      {loading && !feed ? (
        <div className="card flex items-center justify-center p-10 text-sm text-[color:var(--color-muted)]">{t("ui.dash.loading")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t("ui.dash.total_balance")} value={`$${(kpi.totalBalance ?? totalAccountBalance).toLocaleString()}`} trend={{ label: `$${(kpi.todaySpend ?? 0).toFixed(2)} ${l("spent today", "今日消耗")}`, tone: "muted" }} icon={<DollarSign size={16} />} />
            <StatCard label={t("ui.dash.active_routes")} value={kpi.activeRoutes ?? 0} trend={{ label: l("Routing", "路由中"), tone: "lime" }} icon={<Route size={16} />} />
            <StatCard label={l("P50 latency", "P50 延遲", "P50 延迟")} value={kpi.avgLatency ? `${kpi.avgLatency}ms` : "—"} trend={{ label: l("Across channels", "跨頻道", "跨频道"), tone: "cyan" }} icon={<Clock size={16} />} />
            <StatCard label={t("ui.dash.accounts_card")} value={`${kpi.activeAccounts ?? 0}/${kpi.totalAccounts ?? 0}`} trend={{ label: t("ui.dash.active_total"), tone: "lime" }} icon={<Activity size={16} />} />
          </div>

          {/* Site observability (real availability/latency from insights) */}
          <section className="space-y-4">
            <SectionTitle
              title={t("ui.dash.site_observability")}
              description={t("ui.dash.obs_desc")}
              eyebrow={t("ui.accounts.sites_label")}
            />
            <div className="card overflow-hidden">
              {siteAvailability.length === 0 ? (
                <div className="p-6 text-sm text-[color:var(--color-muted)]">{t("ui.dash.no_site_data")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)]">
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.site")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.availability")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.avg_latency")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{l("24h requests", "24 小時請求", "24 小时请求")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.speed_test")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteAvailability.map((site) => (
                        <tr key={site.siteId ?? site.siteName} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${
                                site.availabilityPercent === null || site.availabilityPercent === undefined ? "bg-[color:var(--color-muted)]" : site.availabilityPercent >= 99 ? "bg-[color:var(--color-lime)]" : site.availabilityPercent >= 95 ? "bg-[color:var(--color-amber)]" : "bg-[color:var(--color-rose)]"
                              }`} />
                              <span className="font-medium text-[color:var(--color-fg)]">{site.siteName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">{site.availabilityPercent !== null && site.availabilityPercent !== undefined ? `${site.availabilityPercent.toFixed(2)}%` : "—"}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-muted)]">{site.averageLatencyMs ? `${site.averageLatencyMs}ms` : "—"}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">{(site.totalRequests ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => handleSpeedTest(site.siteId)} disabled={speedBusy === site.siteId}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                              {speedBusy === site.siteId ? "…" : t("ui.dash.speed_test")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Site distribution */}
          <section className="space-y-4">
            <SectionTitle title={t("ui.dash.site_distribution")} description={t("ui.dash.dist_desc")} eyebrow={t("ui.accounts.sites_label")} />
            <div className="card overflow-hidden">
              {siteDistribution.length === 0 ? (
                <div className="p-6 text-sm text-[color:var(--color-muted)]">{t("ui.dash.no_dist_data")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)]">
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.site")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.balance")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.spend")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.accounts")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteDistribution.map((site) => (
                        <tr key={site.siteId ?? site.siteName} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]">{site.siteName}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">${(site.totalBalance ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-muted)]">${(site.totalSpend ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">{site.accountCount ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Model analysis */}
          <section className="space-y-4">
            <SectionTitle title={t("ui.dash.model_analysis")} description={t("ui.dash.model_analysis_desc")} eyebrow={t("ui.dash.models_eyebrow")} />
            <div className="card flex flex-wrap items-center gap-3 p-3">
              <label className="text-xs">{l("Analysis range", "分析時段", "分析时段")} <select value={analysisDays} onChange={(e) => setAnalysisDays(Number(e.target.value))} className="rounded bg-[color:var(--color-panel-2)] p-2">{[1, 7, 14, 30, 90].map((days) => <option key={days} value={days}>{days} {l("days", "天")}</option>)}</select></label>
              <label className="text-xs">{t("ui.dash.site")} <select value={analysisSite} onChange={(e) => setAnalysisSite(e.target.value)} className="rounded bg-[color:var(--color-panel-2)] p-2"><option value="">{l("All sites", "全部站點", "全部站点")}</option>{siteDistribution.filter((s) => s.siteId != null).map((s) => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}</select></label>
              <button type="button" className="chip" disabled={analysisLoading} onClick={() => setAnalysisEpoch((n) => n + 1)}>{l("Refresh analysis", "刷新分析")}</button>
            </div>
            {analysisLoading ? <p role="status">{l("Loading analysis…", "載入分析中…", "加载分析中…")}</p> : <ModelAnalysis rows={modelAnalysis} details={analysisDetails} defaultScope={analysisDays === 7 && !analysisSite} />}
          </section>

          {/* Site trend */}
          <section className="space-y-4">
            <SectionTitle title={t("ui.dash.site_trend")} description={l("7-day per-site spend and request counts", "7 日各站點消耗與請求數", "7 日各站点消耗与请求数")} eyebrow={t("ui.dash.trends_eyebrow")} />
            <div className="card p-4">
              {siteTrend.length === 0 ? (
                <div className="py-4 text-sm text-[color:var(--color-muted)]">{t("ui.dash.no_trend_data")}</div>
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">{l("Date", "日期")}</th><th className="p-2">{t("ui.dash.site")}</th><th className="p-2">{t("ui.dash.spend")} (USD)</th><th className="p-2">{t("ui.dash.requests")}</th></tr></thead><tbody>{siteTrend.flatMap((day) => Object.entries(day.sites ?? {}).map(([site, stats]) => <tr key={`${day.date}-${site}`}><td className="p-2">{day.date}</td><td className="p-2">{site}</td><td className="p-2">${stats.spend.toFixed(6)}</td><td className="p-2">{stats.calls.toLocaleString()}</td></tr>))}</tbody></table></div>
              )}
            </div>
          </section>
          {/* Recent events */}
          <section className="space-y-4">
            <SectionTitle title={t("ui.dash.recent_events")} description={t("ui.dash.latest_events")} eyebrow={t("ui.dash.eyebrow_events")} />
            <div className="space-y-2">
              {(feed?.events ?? []).length === 0 ? (
                <div className="card p-4 text-sm text-[color:var(--color-muted)]">{t("ui.dash.no_events")}</div>
              ) : (
                (feed?.events ?? []).map((event: any) => (
                  <div key={event.id} className="card flex items-center gap-3 p-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${
                      event.level === "error" ? "bg-[color:var(--color-rose)]" :
                      event.level === "warning" || event.level === "warn" ? "bg-[color:var(--color-amber)]" :
                      event.level === "success" ? "bg-[color:var(--color-lime)]" : "bg-[color:var(--color-cyan)]"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-[color:var(--color-fg)]">{event.title}</div>
                      {event.message && (
                        <div className="truncate text-xs text-[color:var(--color-muted)]">{event.message}</div>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-[color:var(--color-muted)]">
                      {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function RefreshCw({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
