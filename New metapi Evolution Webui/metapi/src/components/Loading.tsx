"use client";

import { useLang } from "../contexts/LangContext";

export default function Loading({ label }: { label?: string }) {
  const { t } = useLang();
  const text = label ?? t("common.loading");
  return (
    <div className="flex items-center justify-center py-24 gap-3">
      <div className="relative w-6 h-6">
        <div className="absolute inset-0 rounded-full border-2 border-[color:var(--color-border)]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[color:var(--color-lime)] animate-spin" />
      </div>
      <span className="font-mono text-xs tracking-widest text-[color:var(--color-muted)]">
        {text.toUpperCase()}…
      </span>
    </div>
  );
}
