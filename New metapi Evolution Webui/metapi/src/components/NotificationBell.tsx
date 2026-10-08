import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, ChevronRight, Info, TriangleAlert, CircleX } from "lucide-react";
import { useUiText } from "../i18n/useUiText";
import { fetchEvents, markEventRead, markAllEventsRead } from "../lib/source";
import { fmtAgo } from "../lib/format";
import { apiGet } from "../lib/client";
import { useLang } from "../contexts/LangContext";

// Backend event row.
interface BackendEvent {
  id: number;
  type: string;
  level?: string;
  title: string;
  message?: string;
  read: boolean;
  createdAt?: string;
}

function LevelIcon({ level }: { level: string }) {
  switch (level) {
    case "error":
      return <CircleX size={13} className="text-[color:var(--color-rose)]" />;
    case "warn":
      return <TriangleAlert size={13} className="text-[color:var(--color-amber)]" />;
    case "success":
      return <Check size={13} className="text-[color:var(--color-lime)]" />;
    default:
      return <Info size={13} className="text-[color:var(--color-cyan)]" />;
  }
}

export default function NotificationBell() {
  const t = useUiText();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { lang } = useLang();
  const text = (en: string, hant: string, hans = hant) => lang === "en" ? en : lang === "zh-Hant" ? hant : hans;
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [data, count] = await Promise.all([fetchEvents(50), apiGet<{ count: number }>("/api/events/count")]);
      if (!mounted.current || request !== generation.current) return;
      setEvents(data as BackendEvent[]);
      setUnread(count.count);
      setError("");
    } catch (err) {
      if (mounted.current && request === generation.current) setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const interval = window.setInterval(() => { if (!document.hidden) void reload(); }, 30_000);
    window.addEventListener("focus", reload);
    window.addEventListener("metapi-events-changed", reload);
    return () => {
      mounted.current = false;
      ++generation.current;
      window.clearInterval(interval);
      window.removeEventListener("focus", reload);
      window.removeEventListener("metapi-events-changed", reload);
    };
  }, [reload]);

  useEffect(() => { if (open) void reload(); }, [open, reload]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const mark = async (id?: number) => {
    if (busy) return;
    setBusy(true);
    try {
      if (id === undefined) await markAllEventsRead(); else await markEventRead(id);
      await reload();
      window.dispatchEvent(new Event("metapi-events-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { if (mounted.current) setBusy(false); }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 hover:bg-[color:var(--color-panel)]"
        aria-label={text("Notifications", "通知")}
      >
        <Bell size={14} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[color:var(--color-coral)] px-1 font-mono text-[9px] font-bold text-[color:var(--color-ink)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-14 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-graphite)] shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3">
            <div>
              <div className="font-display text-lg leading-tight">{t("ui.events.title")}</div>
              <div className="mt-0.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
                {unread} {text("unread", "未讀", "未读")} · {events.length} {text("loaded", "已載入", "已加载")}
              </div>
            </div>
            {unread > 0 && (
              <button
                onClick={() => mark()}
                disabled={busy}
                className="h-7 rounded-md px-2 font-mono text-[10px] tracking-wider text-[color:var(--color-lime)] hover:bg-[color:var(--color-lime)]/10"
              >
                {t("ui.events.mark_all_read")}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {error && <div role="alert" className="p-3 text-xs text-[color:var(--color-rose)]">{error}</div>}
            {events.length === 0 && (
              <div className="p-8 text-center text-sm text-[color:var(--color-muted)]">
                {t("ui.events.empty_title")}
              </div>
            )}
            {events.map((ev) => {
              const isRead = ev.read;
              return (
                <button
                  key={ev.id}
                  onClick={() => mark(ev.id)}
                  disabled={busy}
                  className={`flex w-full items-start gap-3 border-b border-[color:var(--color-border)]/50 px-4 py-3 text-left transition last:border-0 hover:bg-white/[0.03] ${
                    isRead ? "opacity-70" : ""
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <LevelIcon level={ev.level ?? ev.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[9px] tracking-widest text-[color:var(--color-muted)]">
                        {ev.type}
                      </span>
                      {!isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-coral)]" />
                      )}
                    </div>
                    <div className="text-xs leading-relaxed text-[color:var(--color-fg)]">
                      {ev.title}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[color:var(--color-muted)]">
                      {fmtAgo(ev.createdAt)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { setOpen(false); navigate("/app/events"); }}
            className="flex items-center justify-between border-t border-[color:var(--color-border)] px-4 py-3 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:bg-white/[0.03] hover:text-[color:var(--color-lime)]"
          >
            <span>{text("View all", "檢視全部", "查看全部")}</span>
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
