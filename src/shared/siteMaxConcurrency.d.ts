export const SITE_MAX_CONCURRENCY_MAX: 10000;

export type SiteMaxConcurrencyResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export function normalizeSiteMaxConcurrency(value: unknown): SiteMaxConcurrencyResult;
