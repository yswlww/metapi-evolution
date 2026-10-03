import type { PlaygroundModel } from "./prototype";

export const PLAYGROUND_MODELS: readonly PlaygroundModel[] = [
  { id: "pg1", name: "GPT-5", modes: ["text", "image"] },
  { id: "pg2", name: "Claude Sonnet", modes: ["text"] },
  { id: "pg3", name: "Gemini 2.5 Flash", modes: ["text", "image", "video"] },
  { id: "pg4", name: "GPT-4o mini", modes: ["text"] },
  { id: "pg5", name: "DeepSeek v3", modes: ["text"] },
  { id: "pg6", name: "Llama 3", modes: ["text"] },
];
