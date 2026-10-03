import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { APP_ROUTES, type AppRoute, type AppRouteId } from "../app/routes";
import {
  Activity,
  Bell,
  Boxes,
  CalendarCheck,
  Key,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Moon,
  Route,
  ScrollText,
  Server,
  Settings2,
  Store,
  Sun,
  Tags,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import { useUiText } from "../i18n/useUiText";
import type { Lang } from "../i18n/dicts";
import NotificationBell from "./NotificationBell";
import { search } from "../lib/source";

const ROUTE_ICONS: Record<AppRouteId, LucideIcon> = {
  dashboard: LayoutDashboard,
  oauth: KeyRound,
  "downstream-keys": Tags,
  "site-announcements": Megaphone,
  events: ScrollText,
  "import-export": Boxes,
  notifications: Bell,
  models: Store,
  about: LifeBuoy,
  settings: Settings2,
  accounts: Users,
  sites: Server,
  routes: Route,
  playground: Terminal,
  "proxy-logs": ScrollText,
  monitor: Activity,
  checkins: CalendarCheck,
  marketplace: Store,
  landing: LayoutDashboard,
};

type NavItem = { to: string; labelKey: string; icon: LucideIcon; end?: boolean };
type NavSection = { sectionKey: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    sectionKey: "ui.shell.section.control",
    items: [
      { to: "/app/dashboard", labelKey: "ui.shell.nav.dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/routes", labelKey: "ui.shell.nav.routes", icon: Route },
      { to: "/app/models", labelKey: "ui.shell.nav.marketplace", icon: Store },
      { to: "/app/import-export", labelKey: "ui.shell.nav.import_export", icon: Boxes },
    ],
  },
  {
    sectionKey: "ui.shell.section.federation",
    items: [
      { to: "/app/oauth", labelKey: "ui.shell.nav.oauth", icon: KeyRound },
      { to: "/app/sites", labelKey: "ui.shell.nav.sites", icon: Server },
      { to: "/app/accounts", labelKey: "ui.shell.nav.accounts", icon: Users },
      { to: "/app/downstream-keys", labelKey: "ui.shell.nav.downstream_keys", icon: Tags },
      { to: "/app/site-announcements", labelKey: "ui.shell.nav.announcements", icon: Megaphone },
    ],
  },
  {
    sectionKey: "ui.shell.section.observe",
    items: [
      { to: "/app/events", labelKey: "ui.shell.nav.events", icon: ScrollText },
      { to: "/app/proxy-logs", labelKey: "ui.shell.nav.proxy_logs", icon: ScrollText },
      { to: "/app/notifications", labelKey: "ui.shell.nav.notifications", icon: Bell },
      { to: "/app/monitor", labelKey: "ui.shell.nav.monitor", icon: Activity },
      { to: "/app/checkins", labelKey: "ui.shell.nav.checkins", icon: CalendarCheck },
    ],
  },
  {
    sectionKey: "ui.shell.section.system",
    items: [
      { to: "/app/playground", labelKey: "ui.shell.nav.playground", icon: Terminal },
      { to: "/app/settings", labelKey: "ui.shell.nav.settings", icon: Settings2 },
      { to: "/app/about", labelKey: "ui.shell.nav.about", icon: LifeBuoy },
    ],
  },
];

const LANG_NEXT: Record<Lang, { next: Lang; label: string; aria: string }> = {
  en: { next: "zh-Hant", label: "繁", aria: "切換語言" },
  "zh-Hant": { next: "zh-Hans", label: "简", aria: "切換語言" },
  "zh-Hans": { next: "en", label: "EN", aria: "切換語言" },
};

function TopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useLang();
  const t = useUiText();
  const location = useLocation();
  const navigate = useNavigate();
  const current = APP_ROUTES.find((route) => location.pathname.startsWith(route.path));
  const langNext = LANG_NEXT[lang] ?? LANG_NEXT.en;
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-graphite)]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-6 lg:px-10">
        <span className="font-display text-xl tracking-tight">{t("ui.shell.brand")}</span>
        {current && (
          <span className="hidden font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] md:inline">
            / {current.title}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              aria-label="Open navigation"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] lg:hidden"
            >
              <MenuIcon size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            <SearchIcon size={14} />
          </button>
          <NotificationBell />
          <button
            type="button"
            onClick={() => setLang(langNext.next)}
            aria-label={langNext.aria}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[10px] font-mono font-semibold text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            {langNext.label}
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} navigate={navigate} />}
    </header>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function MenuIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function SearchModal({ onClose, navigate }: { onClose: () => void; navigate: (to: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{
    accounts: any[]; accountTokens: any[]; sites: any[]; checkinLogs: any[]; proxyLogs: any[]; models: any[];
  }>({ accounts: [], accountTokens: [], sites: [], checkinLogs: [], proxyLogs: [], models: [] });

  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults({ accounts: [], accountTokens: [], sites: [], checkinLogs: [], proxyLogs: [], models: [] }); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      search(q.trim())
        .then((data) => setResults({
          accounts: (data as any)?.accounts ?? [],
          accountTokens: (data as any)?.accountTokens ?? [],
          sites: (data as any)?.sites ?? [],
          checkinLogs: (data as any)?.checkinLogs ?? [],
          proxyLogs: (data as any)?.proxyLogs ?? [],
          models: (data as any)?.models ?? [],
        }))
        .catch(() => setResults({ accounts: [], accountTokens: [], sites: [], checkinLogs: [], proxyLogs: [], models: [] }))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const go = (to: string) => { navigate(to); onClose(); };
  const hasAny = results.sites.length || results.accounts.length || results.accountTokens.length || results.checkinLogs.length || results.proxyLogs.length || results.models.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20">
      <button type="button" className="absolute inset-0 bg-[color:var(--color-ink)]/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-graphite)] p-4 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)]">
        <div className="mb-3 flex items-center gap-2">
          <SearchIcon size={15} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sites, accounts, models…"
            className="flex-1 bg-transparent font-mono text-sm text-[color:var(--color-fg)] outline-none placeholder:text-[color:var(--color-muted)]"
          />
          <button type="button" onClick={onClose} className="text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">ESC</button>
        </div>
        {searching ? (
          <div className="py-6 text-center text-sm text-[color:var(--color-muted)]">Searching…</div>
        ) : q.trim() ? (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto">
            {results.sites.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">SITES</div>
                {results.sites.map((s: any) => (
                  <button key={s.id} type="button" onClick={() => go("/app/sites")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.04]">
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-muted)]">{s.url}</span>
                  </button>
                ))}
              </div>
            )}
            {results.accounts.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">ACCOUNTS</div>
                {results.accounts.map((a: any) => (
                  <button key={a.id} type="button" onClick={() => go("/app/accounts")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.04]">
                    <span className="font-medium">{a.username}</span>
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-muted)]">{a.siteName ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
            {results.accountTokens.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">ACCOUNT TOKENS</div>
                {results.accountTokens.map((a: any) => (
                  <button key={a.id} type="button" onClick={() => go("/app/accounts")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.04]">
                    <span className="font-medium">{a.name ?? a.tokenGroup ?? `token-${a.id}`}</span>
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-muted)]">{a.accountName ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
            {results.checkinLogs.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">CHECK-INS</div>
                {results.checkinLogs.map((c: any) => (
                  <button key={c.id} type="button" onClick={() => go("/app/checkins")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.04]">
                    <span className="font-medium">{c.status ?? "check-in"}</span>
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-muted)]">{c.createdAt ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
            {results.proxyLogs.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">PROXY LOGS</div>
                {results.proxyLogs.map((p: any) => (
                  <button key={p.id} type="button" onClick={() => go("/app/proxy-logs")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.04]">
                    <span className="font-medium">{p.modelRequested ?? p.downstreamPath ?? `log-${p.id}`}</span>
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-muted)]">{p.status ?? p.createdAt ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
            {results.models.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">MODELS</div>
                {results.models.map((m: any) => (
                  <button key={m.name} type="button" onClick={() => go("/app/models")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[color:var(--color-fg)] hover:bg-white/[0.04]">
                    <span className="font-medium">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!hasAny && (
              <div className="py-6 text-center text-sm text-[color:var(--color-muted)]">No results for "{q}"</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AppNavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const t = useUiText();

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-all ${
          isActive
            ? "border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
            : "border-transparent text-[color:var(--color-fg)]/75 hover:bg-white/[0.03] hover:text-[color:var(--color-fg)]"
        }`
      }
    >
      <item.icon size={16} strokeWidth={1.75} />
      <span className="flex-1">{t(item.labelKey)}</span>
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const t = useUiText();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [online, setOnline] = useState<boolean | null>(null);

  // Probe the real gateway: auth/info only succeeds with a valid token, so it
  // doubles as a connectivity + session check.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/auth/info", {
          headers: { Authorization: `Bearer ${localStorage.getItem("metapi-auth-token") ?? ""}` },
        });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <nav className="flex min-h-full w-64 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-graphite)]/70 backdrop-blur">
      <div className="mb-4 flex items-center gap-2 px-3 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--color-lime)]">
          <svg
            viewBox="0 0 32 32"
            className="h-5 w-5 text-[color:var(--color-ink)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 24 L10 8 L16 20 L22 8 L28 24" />
          </svg>
        </div>
        <div>
          <div className="font-display text-xl leading-none tracking-tight">{t("ui.shell.brand")}</div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.2em] text-[color:var(--color-muted)]">
            {t("ui.shell.tagline")}
          </div>
        </div>
      </div>
      {NAV.map((group) => (
        <div key={group.sectionKey} className="mb-1">
          <div className="px-3 pb-1.5 pt-3 font-mono text-[9px] tracking-[0.24em] text-[color:var(--color-muted)]">
            {t(group.sectionKey)}
          </div>
          {group.items.map((item) => (
            <AppNavLink key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
      <div className="mt-5 space-y-2 px-3">
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${online === false ? "bg-[color:var(--color-rose)]" : "bg-[color:var(--color-lime)]"} ${online === null ? "opacity-50" : ""}`} />
            <span className="font-mono text-[10px] tracking-wider uppercase text-[color:var(--color-fg)]">
              {online === false ? t("ui.shell.gateway_offline") : t("ui.shell.gateway_online")}
            </span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[9px] leading-relaxed text-[color:var(--color-muted)]">
            <div>Metapi Evolution backend</div>
            <div>{online === null ? "connecting…" : online === false ? "no response" : "connected"}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/", { replace: true });
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:border-[color:var(--color-rose)]/40 hover:text-[color:var(--color-rose)]"
        >
          <LogOutIcon size={12} /> {t("ui.shell.logout")}
        </button>
      </div>
    </nav>
  );
}

function LogOutIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close nav" onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-[color:var(--color-ink)]/70 backdrop-blur-sm" />
          <div className="relative z-10 h-full w-64 overflow-y-auto">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-3 py-6 sm:px-6 md:py-8 lg:px-10">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
