import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleMock = vi.fn(() => ({ stop: vi.fn() }));
const allMock = vi.fn();

vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: unknown[]) => scheduleMock(...args),
    validate: () => true,
  },
}));

vi.mock('../db/index.js', () => {
  const queryChain = {
    where: () => queryChain,
    get: () => undefined,
    all: () => [],
    from: () => queryChain,
    innerJoin: () => queryChain,
  };
  return {
    db: { select: () => queryChain },
    schema: { settings: { key: 'key' }, accounts: {}, sites: { id: 'id' } },
  };
});

vi.mock('./checkinService.js', () => ({ checkinAll: (...args: unknown[]) => allMock(...args) }));

describe('check-in schedule jitter', () => {
  beforeEach(() => { allMock.mockReset(); });

  it('spreads accounts across the window instead of firing them together', async () => {
    const { computeCheckinJitterOffsetMs } = await import('./checkinScheduler.js');
    const windowMs = 2 * 60 * 60 * 1000;
    const offsets = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => computeCheckinJitterOffsetMs(id, windowMs));

    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(windowMs);
    }
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });

  it('returns a stable offset for the same account so restarts do not reshuffle it', async () => {
    const { computeCheckinJitterOffsetMs } = await import('./checkinScheduler.js');
    const windowMs = 60 * 60 * 1000;
    expect(computeCheckinJitterOffsetMs(42, windowMs)).toBe(computeCheckinJitterOffsetMs(42, windowMs));
  });

  it('defers a due account whose jittered slot has not arrived yet', async () => {
    const { selectDueIntervalCheckinAccountIds } = await import('./checkinScheduler.js');
    const now = new Date('2026-03-20T12:00:00.000Z');
    const rows = [{ id: 7, lastCheckinAt: '2026-03-20T05:00:00.000Z' }];
    const windowMs = 2 * 60 * 60 * 1000;
    const offset = (await import('./checkinScheduler.js')).computeCheckinJitterOffsetMs(7, windowMs);

    // Due exactly at the interval boundary, but its slot lands later in the window.
    if (offset > 0) {
      const justDue = new Date(new Date('2026-03-20T11:00:00.000Z').getTime() + 1000);
      expect(selectDueIntervalCheckinAccountIds(rows, 6, justDue, new Map(), windowMs)).toEqual([]);
    }

    const pastSlot = new Date(new Date('2026-03-20T11:00:00.000Z').getTime() + windowMs);
    expect(selectDueIntervalCheckinAccountIds(rows, 6, pastSlot, new Map(), windowMs)).toEqual([7]);
  });

  it('keeps the old behaviour when the jitter window is zero', async () => {
    const { selectDueIntervalCheckinAccountIds } = await import('./checkinScheduler.js');
    const now = new Date('2026-03-20T12:00:00.000Z');
    expect(selectDueIntervalCheckinAccountIds([
      { id: 2, lastCheckinAt: '2026-03-20T05:59:59.000Z' },
      { id: 3, lastCheckinAt: '2026-03-20T06:30:00.000Z' },
    ], 6, now, new Map(), 0)).toEqual([2]);
  });
});
