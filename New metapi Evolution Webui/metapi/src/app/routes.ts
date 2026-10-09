export type AppRouteId =
  | "oauth"
  | "downstream-keys"
  | "site-announcements"
  | "events"
  | "import-export"
  | "notifications"
  | "models"
  | "about"
  | "settings"
  | "accounts"
  | "sites"
  | "routes"
  | "playground"
  | "proxy-logs"
  | "monitor"
  | "checkins"
  | "marketplace"
  | "dashboard"
  | "landing";

export interface AppRoute {
  id: AppRouteId;
  path: string;
  title: string;
}

export const APP_ROUTES: AppRoute[] = [
  { id: "dashboard", path: "/app/dashboard", title: "Dashboard" },
  { id: "oauth", path: "/app/oauth", title: "OAuth Management" },
  { id: "downstream-keys", path: "/app/downstream-keys", title: "Downstream Keys" },
  { id: "site-announcements", path: "/app/site-announcements", title: "Site Announcements" },
  { id: "events", path: "/app/events", title: "Program Logs" },
  { id: "import-export", path: "/app/import-export", title: "Import / Export" },
  { id: "notifications", path: "/app/notifications", title: "Notifications" },
  { id: "models", path: "/app/models", title: "Model Marketplace" },
  { id: "about", path: "/app/about", title: "About" },
  { id: "settings", path: "/app/settings", title: "Settings" },
  { id: "accounts", path: "/app/accounts", title: "Accounts" },
  { id: "sites", path: "/app/sites", title: "Sites" },
  { id: "routes", path: "/app/routes", title: "Smart Routes" },
  { id: "playground", path: "/app/playground", title: "Playground" },
  { id: "proxy-logs", path: "/app/proxy-logs", title: "Proxy Logs" },
  { id: "monitor", path: "/app/monitor", title: "Uptime Monitor" },
  { id: "checkins", path: "/app/checkins", title: "Check-ins" },
  { id: "marketplace", path: "/app/marketplace", title: "Marketplace" },
  { id: "landing", path: "/", title: "Landing" },
];
