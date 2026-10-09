import { Search } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export type PrototypeTone = "lime" | "amber" | "rose" | "cyan" | "coral" | "muted";

const TONE_TEXT_CLASSES: Record<PrototypeTone, string> = {
  lime: "text-[color:var(--color-lime)]",
  amber: "text-[color:var(--color-amber)]",
  rose: "text-[color:var(--color-rose)]",
  cyan: "text-[color:var(--color-cyan)]",
  coral: "text-[color:var(--color-coral)]",
  muted: "text-[color:var(--color-muted)]",
};

const TONE_FILL_CLASSES: Record<PrototypeTone, string> = {
  lime: "bg-[color:var(--color-lime)]",
  amber: "bg-[color:var(--color-amber)]",
  rose: "bg-[color:var(--color-rose)]",
  cyan: "bg-[color:var(--color-cyan)]",
  coral: "bg-[color:var(--color-coral)]",
  muted: "bg-[color:var(--color-muted)]",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  detail?: string;
  trend?: {
    label: string;
    tone?: PrototypeTone;
  };
  icon?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  detail,
  trend,
  icon,
  className = "",
}: StatCardProps) {
  const trendTone = trend?.tone ?? "muted";

  return (
    <section className={`card p-4 sm:p-5 min-w-0 ${className}`} aria-label={label}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--color-muted)]">
          {label}
        </span>
        {icon && <span className="text-[color:var(--color-muted)] shrink-0">{icon}</span>}
      </div>
      <div className="mt-3 font-display text-3xl leading-none tracking-tight text-[color:var(--color-fg)]">
        {value}
      </div>
      {(detail || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {trend && (
            <span className={`font-mono tracking-wide ${TONE_TEXT_CLASSES[trendTone]}`}>
              {trend.label}
            </span>
          )}
          {detail && <span className="text-[color:var(--color-muted)]">{detail}</span>}
        </div>
      )}
    </section>
  );
}

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: string;
  className?: string;
}

export function SearchField({
  label,
  placeholder = "Search",
  className = "",
  ...inputProps
}: SearchFieldProps) {
  return (
    <label className={`relative block min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]"
      />
      <input
        {...inputProps}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] py-2 pr-3 pl-9 font-mono text-xs text-[color:var(--color-fg)] placeholder:text-[color:var(--color-muted)] outline-none transition-colors focus:border-[color:var(--color-lime)]/60 focus:ring-1 focus:ring-[color:var(--color-lime)]/30"
      />
    </label>
  );
}

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  const titleId = useId();

  return (
    <section
      className={`card flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center ${className}`}
      aria-labelledby={titleId}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--color-border-bright)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]">
          {icon}
        </div>
      )}
      <h2 id={titleId} className="font-display text-2xl tracking-tight">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--color-muted)]">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}

export interface SectionTitleProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionTitle({
  title,
  description,
  eyebrow,
  actions,
  className = "",
}: SectionTitleProps) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 font-mono text-[10px] tracking-[0.18em] text-[color:var(--color-lime)] uppercase">
            ── {eyebrow}
          </div>
        )}
        <h2 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm text-[color:var(--color-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface ProgressBarProps {
  label: string;
  value: number;
  valueLabel: string;
  description?: string;
  tone?: PrototypeTone;
  className?: string;
}

export function ProgressBar({
  label,
  value,
  valueLabel,
  description,
  tone = "lime",
  className = "",
}: ProgressBarProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--color-muted)]">
          {label}
        </span>
        <span className={`font-mono text-xs ${TONE_TEXT_CLASSES[tone]}`}>{valueLabel}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${valueLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedValue}
        className="h-2 overflow-hidden rounded-full bg-[color:var(--color-panel-2)] ring-1 ring-inset ring-[color:var(--color-border)]"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${TONE_FILL_CLASSES[tone]}`}
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
      {description && (
        <p className="mt-2 text-xs leading-5 text-[color:var(--color-muted)]">{description}</p>
      )}
    </div>
  );
}
