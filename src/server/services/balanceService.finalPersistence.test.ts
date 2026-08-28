import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapterMock = { getBalance: vi.fn() };
const autoReloginMock = vi.fn();
const selectAllMock = vi.fn();
const selectGetMock = vi.fn();
const updateSetMock = vi.fn();
const updateWhereMock = vi.fn();
const updateRunMock = vi.fn();
const extractRuntimeHealthMock = vi.fn();
const setAccountRuntimeHealthMock = vi.fn();

vi.mock('../db/index.js', () => {
  const selectChain = {
    all: () => selectAllMock(),
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    get: () => selectGetMock(),
  };
  const updateWhereChain = {
    run: () => updateRunMock(),
  };
  const updateSetChain = {
    where: (...args: unknown[]) => {
      updateWhereMock(...args);
      return updateWhereChain;
    },
  };

  return {
    db: {
      select: () => selectChain,
      update: () => ({
        set: (updates: Record<string, unknown>) => {
          updateSetMock(updates);
          return updateSetChain;
        },
      }),
    },
    schema: {
      accounts: {
        id: 'id',
        siteId: 'siteId',
        accessToken: 'accessToken',
        status: 'status',
        extraConfig: 'extraConfig',
        updatedAt: 'updatedAt',
      },
      sites: { id: 'id' },
    },
  };
});

vi.mock('./platforms/index.js', () => ({
  getAdapter: () => adapterMock,
}));

vi.mock('./accountAutoReloginService.js', () => ({
  autoReloginAccount: (...args: unknown[]) => autoReloginMock(...args),
}));

vi.mock('./accountHealthService.js', () => ({
  extractRuntimeHealth: (...args: unknown[]) => extractRuntimeHealthMock(...args),
  setAccountRuntimeHealth: (...args: unknown[]) => setAccountRuntimeHealthMock(...args),
}));

function account(extraConfig: Record<string, unknown>, updatedAt: string | null = '2026-08-28T00:00:00.000Z') {
  return {
    id: 1,
    username: 'demo-user_7659',
    accessToken: 'old-token',
    status: 'active',
    extraConfig: JSON.stringify(extraConfig),
    updatedAt,
  };
}

function site(platform = 'new-api') {
  return {
    id: 1,
    name: 'Demo',
    url: 'https://example.com',
    platform,
    status: 'active',
  };
}

function configureInitialRow(accountRow: ReturnType<typeof account>, siteRow = site()) {
  selectAllMock.mockReturnValue([{ accounts: accountRow, sites: siteRow }]);
}

function conditionContains(condition: unknown, expected: string): boolean {
  if (condition === expected) return true;
  if (!condition || typeof condition !== 'object') return false;
  const queryChunks = (condition as { queryChunks?: unknown }).queryChunks;
  if (!Array.isArray(queryChunks)) return false;
  return queryChunks.some((chunk) => conditionContains(chunk, expected));
}

describe('balanceService final config persistence', () => {
  beforeEach(() => {
    adapterMock.getBalance.mockReset();
    autoReloginMock.mockReset();
    selectAllMock.mockReset();
    selectGetMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    updateRunMock.mockReset();
    extractRuntimeHealthMock.mockReset();
    extractRuntimeHealthMock.mockReturnValue(null);
    setAccountRuntimeHealthMock.mockReset();
  });

  it('preserves a concurrent config edit after auto-relogin while merging balance-owned metadata', async () => {
    const initial = account({ custom: 'initial' });
    const concurrent = {
      ...account({
        platformUserId: 80315,
        proxyUrl: 'http://concurrent-proxy.example',
        oauth: { provider: 'concurrent-oauth' },
        autoRelogin: { username: 'demo-user', passwordCipher: 'new-cipher', updatedAt: 'generation-2' },
        custom: 'concurrent-edit',
      }, '2026-08-28T00:00:02.000Z'),
      accessToken: 'fresh-token',
    };
    configureInitialRow(initial, site('sub2api'));
    autoReloginMock.mockResolvedValue({
      accessToken: 'fresh-token',
      platformUserId: 80315,
      extraConfig: JSON.stringify({ custom: 'stale-auto-relogin-snapshot' }),
    });
    adapterMock.getBalance
      .mockRejectedValueOnce(new Error('access token expired'))
      .mockResolvedValueOnce({
        balance: 12,
        used: 1,
        quota: 13,
        todayIncome: 4.5,
        subscriptionSummary: { activeCount: 1, totalUsedUsd: 2, subscriptions: [] },
      });
    selectGetMock.mockResolvedValue(concurrent);
    updateRunMock.mockResolvedValue({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await expect(refreshBalance(1)).resolves.toEqual(expect.objectContaining({ balance: 12 }));

    expect(adapterMock.getBalance.mock.calls[1]?.[1]).toBe('fresh-token');
    const persistedConfig = JSON.parse(String(updateSetMock.mock.calls[0]?.[0]?.extraConfig));
    expect(persistedConfig).toEqual(expect.objectContaining({
      platformUserId: 80315,
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'concurrent-oauth' },
      autoRelogin: { username: 'demo-user', passwordCipher: 'new-cipher', updatedAt: 'generation-2' },
      custom: 'concurrent-edit',
    }));
    expect(persistedConfig.todayIncomeSnapshot?.latest).toBe(4.5);
    expect(persistedConfig.sub2apiSubscription?.activeCount).toBe(1);
  });

  it('remerges a balance patch after a final config compare-and-swap conflict', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    selectGetMock
      .mockResolvedValueOnce(account({ custom: 'first-concurrent-edit' }, '2026-08-28T00:00:01.000Z'))
      .mockResolvedValueOnce(account({ custom: 'second-concurrent-edit' }, '2026-08-28T00:00:02.000Z'));
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(updateSetMock).toHaveBeenCalledTimes(2);
    expect(updateWhereMock).toHaveBeenCalledTimes(2);
    const persistedConfig = JSON.parse(String(updateSetMock.mock.calls[1]?.[0]?.extraConfig));
    expect(persistedConfig.custom).toBe('second-concurrent-edit');
    expect(persistedConfig.todayIncomeSnapshot?.latest).toBe(4.5);
  });

  it('keeps concurrent credentials when balance config compare-and-swap retries exhaust', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    selectGetMock.mockResolvedValue(account({
      platformUserId: 80315,
      autoRelogin: { username: 'demo-user', passwordCipher: 'concurrent-cipher', updatedAt: 'generation-2' },
      custom: 'latest-concurrent-config',
    }, '2026-08-28T00:00:03.000Z'));
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(updateSetMock).toHaveBeenCalledTimes(4);
    for (const call of updateSetMock.mock.calls.slice(0, 3)) {
      expect(call[0]).toHaveProperty('extraConfig');
    }
    expect(updateSetMock.mock.calls[3]?.[0]).not.toHaveProperty('extraConfig');
    expect(String(updateSetMock.mock.calls[3]?.[0]?.accessToken || '')).not.toContain('concurrent-cipher');
  });

  it('does not write extraConfig when a successful balance has no metadata patch', async () => {
    const current = account({ custom: 'preserve-me' });
    configureInitialRow(current);
    selectGetMock.mockResolvedValue(current);
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13 });
    updateRunMock.mockResolvedValue({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(updateSetMock).toHaveBeenCalledTimes(1);
    expect(updateSetMock.mock.calls[0]?.[0]).not.toHaveProperty('extraConfig');
  });

  it('persists a balance patch when the current account updatedAt is null', async () => {
    configureInitialRow(account({ custom: 'initial' }, null));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    selectGetMock.mockResolvedValue(account({ custom: 'nullable-timestamp-config' }, null));
    updateRunMock.mockResolvedValue({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(updateSetMock.mock.calls[0]?.[0]).toHaveProperty('extraConfig');
    expect(updateWhereMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a concurrent disable after balance config CAS exhaustion', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    const active = account({ custom: 'active-at-cas-read' }, '2026-08-28T00:00:01.000Z');
    const disabled = { ...account({ custom: 'disabled-after-conflict' }, '2026-08-28T00:00:04.000Z'), status: 'disabled' };
    selectGetMock
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(disabled)
      .mockResolvedValueOnce(disabled);
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    const telemetryFallback = updateSetMock.mock.calls[3]?.[0] as Record<string, unknown>;
    expect(telemetryFallback).not.toHaveProperty('status');
    expect(telemetryFallback).not.toHaveProperty('extraConfig');
  });

  it('does not revert a concurrent status change on a no-metadata balance refresh', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13 });
    const active = account({ custom: 'active-at-cas-read' }, '2026-08-28T00:00:01.000Z');
    const expired = { ...account({ custom: 'expired-concurrently' }, '2026-08-28T00:00:02.000Z'), status: 'expired' };
    selectGetMock
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(expired);
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(updateSetMock).toHaveBeenCalledTimes(2);
    for (const [updates] of updateSetMock.mock.calls) {
      expect(updates).not.toHaveProperty('status');
      expect(updates).not.toHaveProperty('extraConfig');
    }
  });

  it('skips persistence when the access token changed during the balance request', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    selectGetMock.mockResolvedValue({
      ...account({ custom: 'replacement-credential-config' }, '2026-08-28T00:00:01.000Z'),
      accessToken: 'replacement-token',
    });

    const { refreshBalance } = await import('./balanceService.js');
    await expect(refreshBalance(1)).resolves.toEqual(expect.objectContaining({ balance: 12 }));

    expect(updateSetMock).not.toHaveBeenCalled();
    expect(setAccountRuntimeHealthMock).not.toHaveBeenCalled();
  });

  it('uses the actual reloaded config after exhaustion for the health decision', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    const active = account({ custom: 'active-at-cas-read' }, '2026-08-28T00:00:01.000Z');
    const finalConfig = account({
      custom: 'actual-final-config',
      runtimeHealth: { state: 'degraded', reason: 'checkin endpoint not found', source: 'checkin' },
    }, '2026-08-28T00:00:04.000Z');
    selectGetMock
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(finalConfig)
      .mockResolvedValueOnce(finalConfig);
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });
    extractRuntimeHealthMock.mockImplementation((extraConfig: string) => {
      return extraConfig.includes('actual-final-config')
        ? { state: 'degraded', reason: 'checkin endpoint not found', source: 'checkin' }
        : null;
    });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(setAccountRuntimeHealthMock).toHaveBeenCalledWith(1, expect.objectContaining({
      state: 'degraded',
      source: 'checkin',
    }));
  });

  it('skips atomic telemetry fallback and old-response health when the token changes after CAS reads', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    const current = account({ custom: 'still-current-at-read' }, '2026-08-28T00:00:01.000Z');
    selectGetMock
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    let currentToken = 'old-token';
    updateRunMock.mockImplementation(() => {
      if (updateSetMock.mock.calls.length <= 3) return { changes: 0 };

      currentToken = 'replacement-token';
      const condition = updateWhereMock.mock.calls.at(-1)?.[0];
      const requiresOldRequestToken = currentToken === 'replacement-token'
        && conditionContains(condition, 'accessToken')
        && conditionContains(condition, 'old-token');
      return { changes: requiresOldRequestToken ? 0 : 1 };
    });

    const { refreshBalance } = await import('./balanceService.js');
    await expect(refreshBalance(1)).resolves.toEqual(expect.objectContaining({ balance: 12 }));

    expect(updateSetMock).toHaveBeenCalledTimes(4);
    const atomicFallback = updateSetMock.mock.calls[3]?.[0] as Record<string, unknown>;
    expect(atomicFallback).not.toHaveProperty('status');
    expect(atomicFallback).not.toHaveProperty('extraConfig');
    expect(setAccountRuntimeHealthMock).not.toHaveBeenCalled();
  });

  it('persists ordinary exhaustion telemetry through the atomic fallback predicate', async () => {
    configureInitialRow(account({ custom: 'initial' }));
    adapterMock.getBalance.mockResolvedValue({ balance: 12, used: 1, quota: 13, todayIncome: 4.5 });
    const current = account({ custom: 'current' }, '2026-08-28T00:00:01.000Z');
    selectGetMock.mockResolvedValue(current);
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { refreshBalance } = await import('./balanceService.js');
    await refreshBalance(1);

    expect(updateSetMock).toHaveBeenCalledTimes(4);
    expect(setAccountRuntimeHealthMock).toHaveBeenCalledTimes(1);
  });
});
