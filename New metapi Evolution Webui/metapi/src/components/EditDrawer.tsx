"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";

const FieldLabelContext = createContext<string | undefined>(undefined);

export function EditDrawer({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  children,
  footer,
  width = "max-w-[520px]",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--color-ink)]/70 backdrop-blur-sm"
      />
      <aside
        className={`absolute top-0 right-0 h-full w-full ${width} bg-[color:var(--color-graphite)] border-l border-[color:var(--color-border)] shadow-[-24px_0_48px_-12px_rgba(0,0,0,0.6)] flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[color:var(--color-border)] flex items-start justify-between gap-4 sticky top-0 bg-[color:var(--color-graphite)] z-10">
          <div>
            {eyebrow && (
              <div className="font-mono text-[10px] tracking-[0.28em] text-[color:var(--color-lime)] mb-1.5">
                ── {eyebrow}
              </div>
            )}
            <h3 className="font-display text-2xl leading-tight tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[color:var(--color-border)] hover:border-[color:var(--color-border-bright)] flex items-center justify-center text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] shrink-0"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {children}
        </div>
        {footer && (
          <footer className="px-4 sm:px-6 py-3 sm:py-4 border-t border-[color:var(--color-border)] bg-[color:var(--color-graphite)] flex items-center justify-end gap-2 sticky bottom-0 flex-wrap">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <FieldLabelContext.Provider value={label}><label className="block mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label></FieldLabelContext.Provider>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-10 px-3 rounded-lg bg-[color:var(--color-panel-2)] border border-[color:var(--color-border)] text-sm text-[color:var(--color-fg)] placeholder-[color:var(--color-muted)] focus:outline-none focus:border-[color:var(--color-lime)]/50 focus:ring-1 focus:ring-[color:var(--color-lime)]/30 font-mono ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-[color:var(--color-panel-2)] border border-[color:var(--color-border)] text-sm text-[color:var(--color-fg)] placeholder-[color:var(--color-muted)] focus:outline-none focus:border-[color:var(--color-lime)]/50 focus:ring-1 focus:ring-[color:var(--color-lime)]/30 font-mono resize-none ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full h-10 px-3 rounded-lg bg-[color:var(--color-panel-2)] border border-[color:var(--color-border)] text-sm text-[color:var(--color-fg)] focus:outline-none focus:border-[color:var(--color-lime)]/50 focus:ring-1 focus:ring-[color:var(--color-lime)]/30 font-mono ${props.className ?? ""}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  const fieldLabel = useContext(FieldLabelContext);
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      {label && (
        <span className="font-mono text-[11px] tracking-widest text-[color:var(--color-muted)]">
          {label}
        </span>
      )}
      <span className="relative h-5 w-10 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          aria-label={label ?? fieldLabel}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span className={`pointer-events-none absolute inset-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--color-lime)] ${checked ? "bg-[color:var(--color-lime)]" : "bg-[color:var(--color-border-bright)]"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[color:var(--color-ink)] transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </span>
      </span>
    </label>
  );
}

export function Btn({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? "bg-[color:var(--color-lime)] text-[color:var(--color-ink)] font-bold hover:opacity-90"
      : variant === "danger"
        ? "border border-[color:var(--color-rose)]/40 text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10"
        : "border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]";
  return (
    <button
      {...props}
      className={`h-9 px-4 rounded-lg font-mono text-[11px] tracking-wider disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${props.className ?? ""}`}
    />
  );
}
