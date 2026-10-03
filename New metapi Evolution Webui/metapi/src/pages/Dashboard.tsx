import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, DollarSign, Route, TrendingUp, Zap, Activity, Gauge, Boxes } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { fetchDashboardFeed, fetchModelBySite, probeSiteNow, type DashboardFeed } from "../lib/source";

export default function Dashboard() {
  const t = useUiText();
  const { showToast } = useToast();
  const [feed, setFeed] = useState<DashboardFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelAnalysis, setModelAnalysis] = useState<any[]>([]);
  const [speedBusy, setSpeedBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchDashboardFeed();
      setFeed(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Model usage analysis (per-site model request distribution).
  useEffect(() => {
    fetchModelBySite({ days: 7 })
      .then((models) => setModelAnalysis(models as any[]))
      .catch(() => setModelAnalysis([]));
  }, []);

  const handleSpeedTest = async (siteId?: number) => {
    if (!siteId) return;
    setSpeedBusy(siteId);
    try {
      await probeSiteNow(siteId, { scope: "single" });
      showToast("Speed test queued for site.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Speed test failed.");
    } finally {
      setSpeedBusy(null);
    }
  };

  const kpi = feed?.summary ?? { totalBalance: 0, todaySpend: 0, todayReward: 0, avgLatency: 0, requestsPerMinute: 0, activeAccounts: 0, totalAccounts: 0, activeRoutes: 0, totalRoutes: 0 };
  const siteAvailability = feed?.siteAvailability ?? [];
  const siteTrend = feed?.siteTrend ?? [];
  const siteDistribution = feed?.siteDistribution ?? [];

  const totalAccountBalance = useMemo(
    () => siteDistribution.reduce((a, s) => a + (s.totalBalance ?? 0), 0),
    [siteDistribution],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control"
        title={t("ui.dash.dashboard")}
        description={t("ui.dash.dashboard_desc")}
        actions={
          <button type="button" onClick={() => { setLoading(true); load(); }}
            className="flex h-9 items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
            <RefreshCw size={13} /> REFRESH ALL
          </button>
        }
      />

      {loading && !feed ? (
        <div className="card flex items-center justify-center p-10 text-sm text-[color:var(--color-muted)]">{t("ui.dash.loading")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t("ui.dash.total_balance")} value={`$${(kpi.totalBalance ?? totalAccountBalance).toLocaleString()}`} trend={{ label: `+$${(kpi.todaySpend ?? 0).toFixed(2)} today`, tone: "lime" }} icon={<DollarSign size={16} />} />
            <StatCard label={t("ui.dash.active_routes")} value={kpi.activeRoutes ?? 0} trend={{ label: "routing", tone: "lime" }} icon={<Route size={16} />} />
            <StatCard label={t("ui.dash.avg_latency")} value={kpi.avgLatency ? `${kpi.avgLatency}ms` : "—"} trend={{ label: "across channels", tone: "cyan" }} icon={<Clock size={16} />} />
            <StatCard label={t("ui.dash.accounts_card")} value={`${kpi.activeAccounts ?? 0}/${kpi.totalAccounts ?? 0}`} trend={{ label: t("ui.dash.active_total"), tone: "lime" }} icon={<Activity size={16} />} />
          </div>

          {/* Site observability (real availability/latency from insights) */}
          <section className="space-y-4">
            <SectionTitle
              title={t("ui.dash.site_observability")}
              description={t("ui.dash.obs_desc")}
              eyebrow="Sites"
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
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">24H REQUESTS</th>
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
            <SectionTitle title={t("ui.dash.site_distribution")} description={t("ui.dash.dist_desc")} eyebrow="Sites" />
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
            <div className="card overflow-hidden">
              {modelAnalysis.length === 0 ? (
                <div className="p-6 text-sm text-[color:var(--color-muted)]">{t("ui.dash.no_model_data")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)]">
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.model")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.requests")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.spend")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.dash.tokens")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelAnalysis.map((m: any, i: number) => (
                        <tr key={`${m.model}-${i}`} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]">{m.model ?? "—"}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">{(m.calls ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">${(m.spend ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-muted)]">{(m.tokens ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Site trend */}
          <section className="space-y-4">
            <SectionTitle title={t("ui.dash.site_trend")} description={t("ui.dash.site_trend_desc")} eyebrow={t("ui.dash.trends_eyebrow")} />
            <div className="card p-4">
              {siteTrend.length === 0 ? (
                <div className="py-4 text-sm text-[color:var(--color-muted)]">{t("ui.dash.no_trend_data")}</div>
              ) : (
                <div className="flex items-end gap-2 overflow-x-auto pb-2">
                  {siteTrend.map((day, i) => (
                    <div key={i} className="flex min-w-[70px] flex-col items-center gap-1.5">
                      <span className="font-mono text-[9px] text-[color:var(--color-rose)]">↓{day.fail ?? 0}</span>
                      <div className="flex items-end gap-0.5">
                        <div className="w-6 rounded-t bg-[color:var(--color-lime)]/70" style={{ height: `${Math.min(48, ((day.ok ?? 0) / 60000) * 48)}px` }} />
                        <div className="w-2 rounded-t bg-[color:var(--color-rose)]/60" style={{ height: `${Math.min(48, ((day.fail ?? 0) / 500) * 48)}px` }} />
                      </div>
                      <span className="font-mono text-[8px] text-[color:var(--color-muted)]">{day.day ?? day.date ?? ""}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-4 border-t border-[color:var(--color-border)] pt-3 font-mono text-[10px] text-[color:var(--color-muted)]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[color:var(--color-lime)]/70" /> success</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[color:var(--color-rose)]/60" /> failures</span>
              </div>
            </div>
          </section>
          {/* Recent events */}
          <section className="space-y-4">
            <SectionTitle title={t("ui.dash.recent_events")} description={t("ui.dash.latest_events")} eyebrow="Events" />
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
