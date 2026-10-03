import type { ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { APP_ROUTES, type AppRouteId } from "./app/routes";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./contexts/AuthContext";
import About from "./pages/About";
import Accounts from "./pages/Accounts";
import Checkins from "./pages/Checkins";
import Dashboard from "./pages/Dashboard";
import DownstreamKeys from "./pages/DownstreamKeys";
import ImportExport from "./pages/ImportExport";
import Landing from "./pages/Landing";
import Marketplace from "./pages/Marketplace";
import Models from "./pages/Models";
import Monitor from "./pages/Monitor";
import NotificationSettings from "./pages/NotificationSettings";
import OAuthManagement from "./pages/OAuthManagement";
import Playground from "./pages/Playground";
import ProgramLogs from "./pages/ProgramLogs";
import ProxyLogs from "./pages/ProxyLogs";
import RoutesPage from "./pages/Routes";
import SettingsPage from "./pages/Settings";
import SiteAnnouncements from "./pages/SiteAnnouncements";
import SitesPage from "./pages/Sites";

const PAGE_COMPONENTS: Record<AppRouteId, ComponentType> = {
  dashboard: Dashboard,
  oauth: OAuthManagement,
  "downstream-keys": DownstreamKeys,
  "site-announcements": SiteAnnouncements,
  events: ProgramLogs,
  "import-export": ImportExport,
  notifications: NotificationSettings,
  models: Models,
  about: About,
  settings: SettingsPage,
  accounts: Accounts,
  sites: SitesPage,
  routes: RoutesPage,
  playground: Playground,
  "proxy-logs": ProxyLogs,
  monitor: Monitor,
  checkins: Checkins,
  marketplace: Marketplace,
  landing: Landing,
};

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <AppShell>{children}</AppShell>;
}

function LandingGate() {
  const { isAuthenticated } = useAuth();
  // Once authenticated, redirect into the dashboard automatically (declarative).
  if (isAuthenticated) return <Navigate to="/app/dashboard" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      {/* /app/marketplace redirects to the real model catalog. */}
      <Route path="/app/marketplace" element={<ProtectedRoute><Navigate to="/app/models" replace /></ProtectedRoute>} />
      {APP_ROUTES.map((route) => {
        const Page = PAGE_COMPONENTS[route.id];
        const isLanding = route.id === "landing";
        const isMarketplace = route.id === "marketplace";
        if (isMarketplace) return null;
        return (
          <Route
            key={route.path}
            path={route.path}
            element={
              isLanding ? (
                <LandingGate />
              ) : (
                <ProtectedRoute>
                  <Page />
                </ProtectedRoute>
              )
            }
          />
        );
      })}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
