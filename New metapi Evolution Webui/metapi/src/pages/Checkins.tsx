import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, XCircle, Minus, Settings2 } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { CHECKINS } from "../data/checkins";
import type { CheckinEntry } from "../data/prototype";
import {
  DATA_MODE,
  fetchCheckins,
  triggerCheckinAll,
  updateCheckinSchedule,
} from "../lib/source";

type StatusFilter = "all" | CheckinEntry["status"];

// Backend checkin log row — the API returns a joined row with the log nested
// under `checkin_logs`, the account under `accounts`, the site under `sites`.
interface BackendCheckinLogRow {
  checkin_logs: {
    id: number;
    accountId: number;
    status: string;
    message: string | null;
    reward: string | null;
    createdAt: string;
  };
  accounts: {
    username?: string;
  };
  sites: {
    name?: string;
  } | null;
  failureReason?: string | null;
}

function mapBackendCheckin(row: BackendCheckinLogRow): CheckinEntry {
  const log = row?.checkin_logs ?? {};
  const status = log.status === "success" ? "success" as const
    : log.status === "failed" || log.status === "failure" ? "failure" as const
    : "skipped" as const;
  const accountName = row?.accounts?.username ?? `account-${log.accountId ?? ""}`;
  const siteName = row?.sites?.name ?? "";
  const reward = Number(log.reward ?? 0);
  // failureReason may be a structured object — reduce it to a string so the
  // table never feeds a non-string to React.
  const failureText = (() => {
    const fr = row?.failureReason;
    if (!fr) return "";
    if (typeof fr === "string") return fr;
    if (typeof fr === "object") {
      const t = (fr as any)?.title;
      const d = (fr as any)?.detailHint;
      return [t, d].filter((s) => typeof s === "string" && s).join(" — ");
    }
    return "";
  })();
  return {
    id: String(log.id),
    account: accountName,
    site: siteName,
    status,
    note: failureText || log.message || "",
    reward: Number.isFinite(reward) ? reward : 0,
    occurredAt: normalizeDatetime(log.createdAt ?? ""),
  };
}

// Backend timestamps are SQLite format ("2026-09-25 00:00:00"); normalize to
// ISO-local so `new Date()` parses deterministically across browsers.
function normalizeDatetime(raw: string): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) return raw.replace(" ", "T");
  return raw;
}

export default function Checkins() {
  const t = useUiText();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [triggered, setTriggered] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 8 * * *");
  const [checkins, setCheckins] = useState<CheckinEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (DATA_MODE === "prototype") {
      setCheckins([...CHECKINS]);
      return;
    }
    try {
      const data = await fetchCheckins();
      setCheckins((data as BackendCheckinLogRow[]).map(mapBackendCheckin));
    } catch (err) {
      setCheckins([]);
      showToast(err instanceof Error ? err.message : "Failed to load check-ins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return checkins.filter((c) => {
      const matchSearch = !q || c.account.toLowerCase().includes(q) || c.site.toLowerCase().includes(q) || c.note.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchDate =
        (!dateFrom || new Date(c.occurredAt) >= new Date(dateFrom)) &&
        (!dateTo || new Date(c.occurredAt) <= new Date(dateTo + "T23:59:59"));
      return matchSearch && matchStatus && matchDate;
    });
  }, [search, statusFilter, dateFrom, dateTo, checkins]);

  const successCount = checkins.filter((c) => c.status === "success").length;
  const totalReward = checkins.reduce((a, c) => a + c.reward, 0);

  const handleTriggerAll = async () => {
    setTriggered(true);
    try {
      await triggerCheckinAll();
      showToast("All check-ins triggered.");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Trigger failed.");
    } finally {
      setTriggered(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      await updateCheckinSchedule({ mode: "cron", cron: scheduleCron });
      setShowSchedule(false);
      showToast("Schedule saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save schedule failed.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observe"
        title={t("ui.checkin.title")}
        description={t("ui.checkin.desc")}
        actions={
          <button type="button" onClick={handleTriggerAll}
            disabled={triggered}
            className="flex h-9 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)] disabled:opacity-40">
            <Zap size={13} /> {triggered ? "TRIGGERING…" : "TRIGGER ALL"}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("ui.checkin.today")} value={successCount} icon={<CheckCircle2 size={16} />} />
        <StatCard label={t("ui.checkin.failed")} value={checkins.filter((c) => c.status === "failure").length} icon={<XCircle size={16} />} />
        <StatCard label={t("ui.checkin.reward")} value={`${totalReward}`} detail="points total" icon={<Calendar size={16} />} />
        <StatCard label={t("ui.checkin.success_rate")} value={checkins.length ? `${((successCount / checkins.length) * 100).toFixed(0)}%` : "—"} trend={{ label: successCount > 0 ? "on track" : "behind", tone: successCount > 0 ? "lime" : "amber" }} icon={<CheckCircle2 size={16} />} />
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchField label={t("ui.checkin.search_label")} placeholder={t("ui.checkin.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md flex-1" />
        <div className="flex gap-1.5">
          {(["all", "success", "failure", "skipped"] as StatusFilter[]).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                statusFilter === s
                  ? "border-[color:var(--color-border-bright)] bg-[color:var(--color-panel)] text-[color:var(--color-fg)]"
                  : "border-transparent text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              }`}>
              {s === "all" ? "ALL" : s === "success" ? "OK" : s === "failure" ? "FAILED" : "SKIPPED"}
            </button>
          ))}
        </div>
        {/* Date range + schedule */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            aria-label={t("ui.checkin.from_date")}
          />
          <span className="font-mono text-[10px] text-[color:var(--color-muted)]">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            aria-label={t("ui.checkin.to_date")}
          />
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 font-mono text-[10px] tracking-wider transition-colors ${
              showSchedule ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            }`}
          >
            <Settings2 size={12} /> SCHEDULE
          </button>
        </div>
      </div>

      {/* Schedule settings */}
      {showSchedule && (
        <div className="card p-4">
          <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-lime)]">{t("ui.checkin.schedule_settings")}</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="block flex-1">
              <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">CHECK-IN CRON (UTC+8)</span>
              <input
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveSchedule}
              className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
            >
              SAVE SCHEDULE
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title={t("ui.checkin.no_match")} description={t("ui.checkin.no_match_desc")} icon={<Calendar size={18} />} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.checkin.status")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.checkin.account")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.checkin.site")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.checkin.note")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.checkin.reward")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.checkin.time")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((checkin) => (
                  <tr key={checkin.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider ${
                        checkin.status === "success" ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" :
                        checkin.status === "failure" ? "bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]" :
                        "bg-[color:var(--color-muted)]/10 text-[color:var(--color-muted)]"
                      }`}>
                        {checkin.status === "success" ? <CheckCircle2 size={10} /> : checkin.status === "failure" ? <XCircle size={10} /> : <Minus size={10} />}
                        {checkin.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]">{checkin.account}</td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{checkin.site}</td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{checkin.note || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">{checkin.reward}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-muted)]">{new Date(checkin.occurredAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Zap({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
}
