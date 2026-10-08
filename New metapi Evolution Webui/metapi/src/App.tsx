import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { APP_ROUTES, type AppRouteId } from "./app/routes";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./contexts/AuthContext";
import { useLang } from "./contexts/LangContext";
import Landing from "./pages/Landing";

const PAGE_COMPONENTS: Record<AppRouteId, ComponentType> = {
  dashboard: lazy(() => import("./pages/Dashboard")),
  oauth: lazy(() => import("./pages/OAuthManagement")),
  "downstream-keys": lazy(() => import("./pages/DownstreamKeys")),
  "site-announcements": lazy(() => import("./pages/SiteAnnouncements")),
  events: lazy(() => import("./pages/ProgramLogs")),
  "import-export": lazy(() => import("./pages/ImportExport")),
  notifications: lazy(() => import("./pages/NotificationSettings")),
  models: lazy(() => import("./pages/Models")),
  about: lazy(() => import("./pages/About")),
  settings: lazy(() => import("./pages/Settings")),
  accounts: lazy(() => import("./pages/Accounts")),
  sites: lazy(() => import("./pages/Sites")),
  routes: lazy(() => import("./pages/Routes")),
  playground: lazy(() => import("./pages/Playground")),
  "proxy-logs": lazy(() => import("./pages/ProxyLogs")),
  monitor: lazy(() => import("./pages/Monitor")),
  checkins: lazy(() => import("./pages/Checkins")),
  marketplace: lazy(() => import("./pages/Marketplace")),
  landing: Landing,
};

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { lang } = useLang();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <AppShell><Suspense fallback={<div role="status" className="py-12 text-center text-[color:var(--color-muted)]">{lang === "en" ? "Loading…" : lang === "zh-Hant" ? "載入中…" : "加载中…"}</div>}>{children}</Suspense></AppShell>;
}

function LandingGate() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/app/dashboard" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/app/marketplace" element={<ProtectedRoute><Navigate to="/app/models" replace /></ProtectedRoute>} />
      {APP_ROUTES.map((route) => {
        const Page = PAGE_COMPONENTS[route.id];
        if (route.id === "marketplace") return null;
        return <Route key={route.path} path={route.path} element={route.id === "landing" ? <LandingGate /> : <ProtectedRoute><Page /></ProtectedRoute>} />;
      })}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
