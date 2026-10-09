"use client";

import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 md:mb-8">
      <div className="min-w-0">
        <div className="font-mono text-[10px] md:text-[11px] tracking-[0.28em] text-[color:var(--color-lime)] mb-2 md:mb-3">
          ── {eyebrow}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight leading-[0.95] break-words">
          {title}
        </h1>
        {description && (
          <p className="mt-2 md:mt-3 text-sm md:text-base text-[color:var(--color-muted)] max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
