import type { Site } from "./prototype";

export const SITES: readonly Site[] = [
  { id: 1, slug: "new-api-hk", name: "New API · Hong Kong", adapter: "new-api", url: "https://api.newapi-hk.com", balance: 248.42, accounts: 4, enabled: true, status: "healthy", statusLabel: "Healthy", region: "hkg-1", note: "Primary route — lowest cost on GPT-5" },
  { id: 2, slug: "one-api-jp", name: "One API · Tokyo", adapter: "one-api", url: "https://one-jp.aihub.dev", balance: 89.1, accounts: 3, enabled: true, status: "healthy", statusLabel: "Healthy", region: "nrt-1", note: "Great fallback for Claude family" },
  { id: 3, slug: "onehub-sg", name: "OneHub · Singapore", adapter: "onehub", url: "https://sg.onehub.link", balance: 412.75, accounts: 5, enabled: true, status: "healthy", statusLabel: "Healthy", region: "sin-1", note: "" },
  { id: 4, slug: "donehub-us", name: "DoneHub · US-West", adapter: "done-hub", url: "https://us.donehub.io", balance: 63.3, accounts: 3, enabled: true, status: "degraded", statusLabel: "Degraded", region: "sfo-1", note: "Rate limits tighter after 22:00 UTC" },
  { id: 5, slug: "veloera-eu", name: "Veloera · EU", adapter: "veloera", url: "https://veloera-eu.gateway.dev", balance: 178.66, accounts: 4, enabled: true, status: "healthy", statusLabel: "Healthy", region: "fra-1", note: "" },
  { id: 6, slug: "anyrouter-cn", name: "AnyRouter · CN", adapter: "anyrouter", url: "https://any.cn.router.dev", balance: 45.2, accounts: 2, enabled: true, status: "degraded", statusLabel: "Degraded", region: "hkg-2", note: "Peak-hour throttling observed" },
  { id: 7, slug: "axonhub-us", name: "AxonHub · US-East", adapter: "axonhub", url: "https://axon.us.gateway.dev", balance: 221.5, accounts: 3, enabled: true, status: "healthy", statusLabel: "Healthy", region: "iad-1", note: "Prefers Responses protocol" },
  { id: 8, slug: "orcarouter-eu", name: "OrcaRouter · EU", adapter: "orcarouter", url: "https://eu.orca.router.dev", balance: 96.8, accounts: 2, enabled: true, status: "healthy", statusLabel: "Healthy", region: "ams-1", note: "" },
  { id: 9, slug: "sub2api-tw", name: "Sub2API · Taiwan", adapter: "sub2api", url: "https://tw.sub2api.dev", balance: 12.4, accounts: 2, enabled: false, status: "disabled", statusLabel: "Disabled", region: "tpe-1", note: "Subscriptions expired — re-enable after renewal" },
];
