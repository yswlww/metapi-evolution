import type { Token } from "./prototype";

export const TOKENS: readonly Token[] = [
  { id: "atk1", name: "Primary Session", tokenPrefix: "sk-7K3A", account: "kenneth@primary", site: "New API · HK", status: "active", statusLabel: "Active", scope: "session:full", group: "Production", isDefault: true, expiresAt: null, createdAt: "2026-07-28T10:00:00Z", lastUsedAt: "2026-09-10T08:44:00Z", usageCount: 53600 },
  { id: "atk2", name: "Dev API Key", tokenPrefix: "sk-F91Q", account: "kenneth+dev", site: "New API · HK", status: "active", statusLabel: "Active", scope: "models:read,requests:write", group: "Delivery", isDefault: false, expiresAt: "2026-12-31T23:59:59Z", createdAt: "2026-08-12T16:20:00Z", lastUsedAt: "2026-09-10T07:16:00Z", usageCount: 9200 },
  { id: "atk3", name: "Analytics Read-only", tokenPrefix: "sk-4XP8", account: "team-analytics", site: "Veloera · EU", status: "active", statusLabel: "Active", scope: "usage:read", group: "Analytics", isDefault: false, expiresAt: null, createdAt: "2026-08-30T09:45:00Z", lastUsedAt: "2026-09-08T17:04:00Z", usageCount: 180 },
  { id: "atk4", name: "Expired CI Token", tokenPrefix: "sk-C2M7", account: "team-de", site: "New API · Frankfurt", status: "expired", statusLabel: "Expired", scope: "models:read,requests:write", group: "Delivery", isDefault: false, expiresAt: "2026-09-01T23:59:59Z", createdAt: "2026-08-01T12:00:00Z", lastUsedAt: null, usageCount: 0 },
];
