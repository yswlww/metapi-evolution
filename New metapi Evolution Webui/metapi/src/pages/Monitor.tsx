import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { fetchMonitorOverview } from "../lib/source";

import { refreshAccountHealth } from "./observability/api";
import { useObservationLabels } from "./observability/labels";
import type { MonitorOverview } from "./observability/monitor";

export default function Monitor() {
  const t = useUiText();
  const l = useObservationLabels();
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<MonitorOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (refresh = false) => {
    try {
      const data = await fetchMonitorOverview(refresh);
      setOverview(data as MonitorOverview);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(false).catch((err) => showToast(err instanceof Error ? err.message : t("ui.monitor.err_load"))); }, [reload]);

  const probeAll = async () => {
    setRefreshing(true);
    try {
      const result = await refreshAccountHealth();
      if (result.success === false) throw new Error(result.message || t("ui.monitor.probe_failed"));
      await reload(true);
      showToast(t("ui.monitor.probe_ok"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.monitor.probe_failed"));
    } finally {
      setRefreshing(false);
    }
  };

  const summary = useMemo(() => {
    const accounts = overview?.accounts ?? { total: 0, healthy: 0, unhealthy: 0, problemItems: [] };
    const sites = overview?.sites ?? { total: 0, active: 0, disabled: 0 };
    const traffic = overview?.traffic24h;
    return {
      sites: sites.total ?? 0,
      activeSites: sites.active ?? 0,
      disabledSites: sites.disabled ?? 0,
      healthyAccounts: accounts.healthy ?? 0,
      unhealthyAccounts: accounts.unhealthy ?? 0,
      totalAccounts: accounts.total ?? 0,
      problemAccounts: accounts.problemItems ?? [],
      problemRoutes: overview?.routes?.problemItems ?? [],
      successRate: traffic?.successRate ?? null,
    };
  }, [overview]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("ui.monitor.eyebrow")}
        title={t("ui.monitor.title")}
        description={t("ui.monitor.desc")}
        actions={
          <button type="button" onClick={probeAll}
            className="flex h-9 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]"
            disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> {refreshing ? t("ui.monitor.probing") : t("ui.monitor.probe")}
          </button>
        }
      />

      {loading && !overview ? (
        <div className="card flex items-center justify-center p-10 text-sm text-[color:var(--color-muted)]">{t("ui.monitor.loading")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("ui.monitor.sites")} value={summary.sites} detail={t("ui.monitor.active_count", { active: summary.activeSites, disabled: summary.disabledSites })} icon={<Activity size={16} />} />
            <StatCard label={t("ui.monitor.healthy_accounts")} value={summary.healthyAccounts} detail={`${t("ui.monitor.total_count", { n: summary.totalAccounts })} · ${l("Unknown", "未知")}: ${overview?.accounts?.unknown ?? 0} · ${l("Disabled", "停用")}: ${overview?.accounts?.disabled ?? 0} · ${l("Expired", "已過期", "已过期")}: ${overview?.accounts?.expired ?? 0}`} trend={{ label: t("ui.monitor.operational"), tone: "lime" }} icon={<CheckCircle2 size={16} />} />
            <StatCard label={t("ui.monitor.unhealthy")} value={summary.unhealthyAccounts} trend={{ label: summary.unhealthyAccounts > 0 ? t("ui.monitor.check_logs") : t("ui.monitor.none"), tone: summary.unhealthyAccounts > 0 ? "amber" : "lime" }} icon={<AlertTriangle size={16} />} />
            <StatCard label={t("ui.monitor.success_rate")} value={summary.successRate !== null ? `${summary.successRate.toFixed(1)}%` : "—"} trend={{ label: t("ui.monitor.traffic_24h"), tone: summary.successRate !== null && summary.successRate >= 95 ? "lime" : "amber" }} icon={<XCircle size={16} />} />
          </div>

          <section className="space-y-4">
            <SectionTitle title={t("ui.monitor.problems_title")} description={t("ui.monitor.problems_desc")} eyebrow={t("ui.monitor.problems_eyebrow")} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Abnormal accounts */}
              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-[color:var(--color-amber)]" />
                  <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.monitor.abnormal_accounts")}</span>
                </div>
                <div className="space-y-2">
                  {summary.problemAccounts.length === 0 ? (
                    <div className="py-4 text-sm text-[color:var(--color-muted)]">{t("ui.monitor.no_abnormal")}</div>
                  ) : (
                    summary.problemAccounts.map((acct) => (
                      <div key={acct.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 p-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-[color:var(--color-fg)]">{acct.username}</div>
                          <div className="truncate font-mono text-[10px] text-[color:var(--color-muted)]">{acct.siteName ?? ""}</div>
                        </div>
                        <span className="ml-2 shrink-0 rounded bg-[color:var(--color-amber)]/10 px-2 py-0.5 font-mono text-[9px] text-[color:var(--color-amber)]">
                          {acct.runtimeHealth?.reason ?? acct.runtimeHealth?.state ?? acct.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Risky routes */}
              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-[color:var(--color-coral)]" />
                  <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.monitor.risky_routes")}</span>
                </div>
                <div className="space-y-2">
                  {summary.problemRoutes.length === 0 ? (
                    <div className="py-4 text-sm text-[color:var(--color-muted)]">{t("ui.monitor.no_risky")}</div>
                  ) : (
                    summary.problemRoutes.map((route) => (
                      <div key={route.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/40 p-2.5">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs text-[color:var(--color-fg)]">{route.title || route.modelPattern || `route-${route.id}`}</div>
                          <div className="truncate font-mono text-[10px] text-[color:var(--color-muted)]">{l("Channels", "頻道", "频道")}: {route.channelCount} · {l("Enabled", "啟用", "启用")}: {route.enabledChannelCount} · {l("Cooldown", "冷卻", "冷却")}: {route.cooldownChannelCount} · {l("Failed", "失敗", "失败")}: {route.failedChannelCount}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="card space-y-3 p-4">
            <SectionTitle title={l("Recent failed requests", "近期失敗請求", "近期失败请求")} description={l("Latest 10 failures in the past 24 hours", "過去 24 小時最新 10 筆失敗", "过去 24 小时最新 10 条失败")} />
            <p className="text-xs">{l("Routes", "路由")}: {overview?.routes?.enabled ?? 0} / {overview?.routes?.total ?? 0} · {l("No enabled channels", "無啟用頻道", "无启用频道")}: {overview?.routes?.zeroEnabledChannels ?? 0} · {l("Cooldown channels", "冷卻頻道", "冷却频道")}: {overview?.routes?.cooldownChannels ?? 0}</p>
            {(overview?.traffic24h?.recentFailures ?? []).length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{l("No recent failures", "沒有近期失敗", "没有近期失败")}</p> : overview?.traffic24h?.recentFailures.map((failure) => <article key={failure.id} className="rounded border border-[color:var(--color-border)] p-3 text-xs">
              <p>{failure.modelRequested ?? failure.modelActual ?? "—"} · {failure.siteName ?? "—"} · {failure.accountUsername ?? "—"} · HTTP {failure.httpStatus ?? "—"}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{failure.errorMessage || "—"}</p><time>{failure.createdAt || "—"}</time>
            </article>)}
          </section>
        </>
      )}
    </div>
  );
}
