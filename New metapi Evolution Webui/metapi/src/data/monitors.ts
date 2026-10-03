import type { MonitorEntry } from "./prototype";

export const MONITORS: readonly MonitorEntry[] = [
  { id: "m1", name: "New API · Hong Kong", status: "healthy", uptimePercent: 99.95, latencyMs: 1420, lastCheck: new Date().toISOString() },
  { id: "m2", name: "One API · Tokyo", status: "healthy", uptimePercent: 99.88, latencyMs: 1650, lastCheck: new Date().toISOString() },
  { id: "m3", name: "OneHub · Singapore", status: "degraded", uptimePercent: 98.72, latencyMs: 2100, lastCheck: new Date().toISOString() },
  { id: "m4", name: "DoneHub · US-West", status: "down", uptimePercent: 95.41, latencyMs: 3500, lastCheck: new Date().toISOString() },
  { id: "m5", name: "Veloera · EU", status: "healthy", uptimePercent: 99.99, latencyMs: 1100, lastCheck: new Date().toISOString() },
];
