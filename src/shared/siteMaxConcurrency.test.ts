import { describe, expect, it } from 'vitest';
import { normalizeSiteMaxConcurrency } from './siteMaxConcurrency.js';

describe('normalizeSiteMaxConcurrency', () => {
  it.each([null, undefined, '', '   ', 0, '0'])(`normalizes %j to unlimited`, (value) => {
    expect(normalizeSiteMaxConcurrency(value)).toEqual({ ok: true, value: null });
  });

  it.each([1, '2', 10000])(`accepts %j`, (value) => {
    expect(normalizeSiteMaxConcurrency(value)).toEqual({ ok: true, value: Number(value) });
  });

  it.each([-1, 1.5, '1.5', 10001, Number.NaN, Number.POSITIVE_INFINITY, {}, []])(
    `rejects %j`,
    (value) => {
      expect(normalizeSiteMaxConcurrency(value)).toEqual({
        ok: false,
        error: 'Invalid maxConcurrency. Expected an integer from 0 to 10000.',
      });
    },
  );
});
