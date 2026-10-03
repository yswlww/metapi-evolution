import type { ProxyLogEntry } from "./prototype";

export const PROXY_LOGS: readonly ProxyLogEntry[] = Array.from({ length: 15 }, (_, i) => ({
  id: `pl${i + 1}`,
  status: i < 10 ? "success" : i < 13 ? "error" : ("pending" as const),
  model: ["GPT-5", "Claude Sonnet", "Gemini 2.5 Flash", "GPT-4o mini", "DeepSeek v3"][i % 5],
  channel: ["Production US", "Production EU", "Research", "Staging", "Lab"][i % 5],
  latencyMs: Math.round(800 + Math.random() * 1200),
  cost: +(Math.random() * 0.05).toFixed(4),
  createdAt: new Date(Date.now() - i * 3600000).toISOString(),
  requestTokens: Math.round(50 + Math.random() * 500),
  responseTokens: Math.round(100 + Math.random() * 2000),
}));
