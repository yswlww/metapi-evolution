import type { CheckinEntry } from "./prototype";

export const CHECKINS: readonly CheckinEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: `ck${i + 1}`,
  account: ["kenneth@primary", "kenneth@jp", "kenneth@sg", "kenneth@us", "kenneth@eu"][i % 5],
  site: ["New API · HK", "One API · JP", "OneHub · SG", "DoneHub · US", "Veloera · EU"][i % 5],
  status: i < 7 ? "success" : i < 9 ? "failure" : "skipped",
  note: i < 7 ? "" : i < 9 ? "Rate limited" : "Manual skip",
  reward: Math.round(Math.random() * 50),
  occurredAt: new Date(Date.now() - i * 86400000).toISOString(),
}));
