export const SITE_MAX_CONCURRENCY_MAX = 10000;

export function normalizeSiteMaxConcurrency(value) {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === 'string' && !value.trim()) return { ok: true, value: null };
  if (typeof value !== 'number' && typeof value !== 'string') {
    return {
      ok: false,
      error: 'Invalid maxConcurrency. Expected an integer from 0 to 10000.',
    };
  }

  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > SITE_MAX_CONCURRENCY_MAX) {
    return {
      ok: false,
      error: 'Invalid maxConcurrency. Expected an integer from 0 to 10000.',
    };
  }

  return { ok: true, value: parsed === 0 ? null : parsed };
}
