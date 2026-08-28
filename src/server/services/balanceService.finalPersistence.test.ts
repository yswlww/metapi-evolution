import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapterMock = { getBalance: vi.fn() };
const autoReloginMock = vi.fn();
const selectAllMock = vi.fn();
const selectGetMock = vi.fn();
const updateSetMock = vi.fn();
const updateWhereMock = vi.fn();
const updateRunMock = vi.fn();
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
  extractRuntimeHealth: vi.fn(() => null),
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

describe('balanceService final config persistence', () => {
  beforeEach(() => {
    adapterMock.getBalance.mockReset();
    autoReloginMock.mockReset();
    selectAllMock.mockReset();
    selectGetMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    updateRunMock.mockReset();
    setAccountRuntimeHealthMock.mockReset();
  });

  it('preserves a concurrent config edit after auto-relogin while merging balance-owned metadata', async () => {
    const initial = account({ custom: 'initial' });
    const concurrent = account({
      platformUserId: 80315,
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'concurrent-oauth' },
      autoRelogin: { username: 'demo-user', passwordCipher: 'new-cipher', updatedAt: 'generation-2' },
      custom: 'concurrent-edit',
    }, '2026-08-28T00:00:02.000Z');
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
    configureInitialRow(account({ custom: 'preserve-me' }));
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
});
