"use client";

import { useLang } from "../contexts/LangContext";

const COLORS: Record<string, string> = {
  healthy: "bg-[color:var(--color-lime)]",
  degraded: "bg-[color:var(--color-amber)]",
  unhealthy: "bg-[color:var(--color-rose)]",
  disabled: "bg-[color:var(--color-muted)]",
  unknown: "bg-[color:var(--color-muted)]",
};

export default function StatusDot({
  status,
  showLabel = true,
}: {
  status: string;
  showLabel?: boolean;
}) {
  const { t } = useLang();
  const key = status in COLORS ? status : "unknown";
  const label = key === "unknown" ? "\u2014" : t(`common.status.${key}`);
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`relative w-2 h-2 rounded-full ${COLORS[key]}`}>
        {key === "healthy" && (
          <span
            className={`absolute inset-0 rounded-full ${COLORS[key]} animate-ping opacity-40`}
          />
        )}
      </span>
      {showLabel && (
        <span className="font-mono text-[11px] tracking-wider uppercase text-[color:var(--color-fg)]/85">
          {label}
        </span>
      )}
    </span>
  );
}
