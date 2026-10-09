import type { Route } from "./prototype";

export const ROUTES: readonly Route[] = [
  { id: "r1", modelPattern: "gpt-*", displayName: "All GPT models", enabled: true, strategy: "weighted", priority: 0, channelCount: 3, avgLatency: 1420, avgCost: 0.85 },
  { id: "r2", modelPattern: "claude-*", displayName: "All Claude models", enabled: true, strategy: "weighted", priority: 0, channelCount: 2, avgLatency: 1870, avgCost: 1.25 },
  { id: "r3", modelPattern: "gemini-*", displayName: "All Gemini models", enabled: true, strategy: "round_robin", priority: 1, channelCount: 1, avgLatency: 980, avgCost: 0.40 },
  { id: "r4", modelPattern: "gpt-4o-mini", displayName: "GPT-4o mini fallback", enabled: false, strategy: "fallback", priority: 2, channelCount: 2, avgLatency: 820, avgCost: 0.18 },
  { id: "r5", modelPattern: "deepseek-*", displayName: "All DeepSeek models", enabled: true, strategy: "weighted", priority: 0, channelCount: 2, avgLatency: 650, avgCost: 0.12 },
  { id: "r6", modelPattern: "llama-*", displayName: "Llama models via router", enabled: true, strategy: "fallback", priority: 3, channelCount: 1, avgLatency: 1200, avgCost: 0.08 },
];
