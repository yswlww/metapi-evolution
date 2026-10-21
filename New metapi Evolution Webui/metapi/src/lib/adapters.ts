export const ADAPTER_COLORS: Record<string, string> = {
  "new-api": "#c8ff2e",
  "one-api": "#7de3d1",
  onehub: "#ff7a4d",
  "one-hub": "#ff7a4d",
  "done-hub": "#ffc857",
  veloera: "#a78bfa",
  anyrouter: "#60a5fa",
  axonhub: "#f472b6",
  orcarouter: "#34d399",
  sub2api: "#fb7185",
};

export const ADAPTER_NAMES: Record<string, string> = {
  "new-api": "New API",
  "one-api": "One API",
  "one-hub": "OneHub",
  "done-hub": "DoneHub",
  veloera: "Veloera",
  anyrouter: "AnyRouter",
  axonhub: "AxonHub",
  orcarouter: "OrcaRouter",
  sub2api: "Sub2API",
  openai: "OpenAI Compatible",
  claude: "Claude / Anthropic",
  gemini: "Gemini / Google AI",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  antigravity: "Antigravity",
  cliproxyapi: "CLIProxyAPI",
};

export const ADAPTER_FALLBACK_LIST = Object.entries(ADAPTER_NAMES).map(([platform, name]) => ({
  name,
  color: ADAPTER_COLORS[platform] || "#c8ff2e",
}));

export const PALETTE = [
  "#c8ff2e",
  "#ff7a4d",
  "#7de3d1",
  "#ffc857",
  "#ff5470",
  "#a78bfa",
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
];
