export function fmtUsd(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "$0.00";
  return Math.abs(v) >= 1000
    ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(digits)}`;
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null) return "0";
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toString();
}

export function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const secs = Math.floor((now - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function maskToken(token: string | null | undefined): string {
  if (!token) return "";
  return token.length <= 12
    ? token
    : `${token.slice(0, 6)}••••••••${token.slice(-4)}`;
}
