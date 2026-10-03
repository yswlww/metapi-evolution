import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, ChevronRight, Info, TriangleAlert, CircleX } from "lucide-react";
import { useUiText } from "../i18n/useUiText";
import { fetchEvents, markEventRead, markAllEventsRead } from "../lib/source";
import { fmtAgo } from "../lib/format";

const LS_KEY = "metapi.notif.readIds";

function loadRead(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveRead(ids: Set<number>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* ignore */ }
}

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
  const [read, setRead] = useState<Set<number>>(() => loadRead());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEvents(50)
      .then((data) => setEvents(data as BackendEvent[]))
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = events.filter((e) => !read.has(e.id) && !e.read).length;

  const markAll = async () => {
    const next = new Set(read);
    events.forEach((e) => next.add(e.id));
    setRead(next);
    saveRead(next);
    try { await markAllEventsRead(); } catch { /* ignore */ }
  };

  const markOne = async (id: number) => {
    const next = new Set(read);
    next.add(id);
    setRead(next);
    saveRead(next);
    try { await markEventRead(id); } catch { /* ignore */ }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 hover:bg-[color:var(--color-panel)]"
        aria-label="Notifications"
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
                {unread} unread · {events.length} total
              </div>
            </div>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="h-7 rounded-md px-2 font-mono text-[10px] tracking-wider text-[color:var(--color-lime)] hover:bg-[color:var(--color-lime)]/10"
              >
                {t("ui.events.mark_all_read")}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {events.length === 0 && (
              <div className="p-8 text-center text-sm text-[color:var(--color-muted)]">
                {t("ui.events.empty_title")}
              </div>
            )}
            {events.map((ev) => {
              const isRead = read.has(ev.id) || ev.read;
              return (
                <button
                  key={ev.id}
                  onClick={() => markOne(ev.id)}
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
            <span>VIEW ALL</span>
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
