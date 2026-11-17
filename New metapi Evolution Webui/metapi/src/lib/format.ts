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

// Stored datetimes are UTC. SQLite rows arrive as "YYYY-MM-DD HH:MM:SS" with
// no zone marker, which `new Date` would otherwise read as local time.
export function parseStoredUtcDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  let normalized = text.includes("T") ? text : text.replace(" ", "T");
  normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/([+-]\d{2})$/, "$1:00");
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(normalized)) normalized = `${normalized}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function fmtTime(iso: string | null | undefined, locale = "en-US", timeZone?: string): string {
  const parsed = parseStoredUtcDateTime(iso);
  if (!parsed) return "—";
  return parsed.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  const then = parseStoredUtcDateTime(iso)?.getTime();
  if (then == null) return "—";
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
