import { beforeEach, describe, expect, it, vi } from 'vitest';

const reloadAccountMock = vi.fn();
const updateSetMock = vi.fn();
const updateWhereMock = vi.fn();
const updateRunMock = vi.fn();

vi.mock('../db/index.js', () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    get: () => reloadAccountMock(),
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
      accounts: { id: 'id', extraConfig: 'extraConfig', updatedAt: 'updatedAt' },
    },
  };
});

function account(extraConfig: Record<string, unknown>, updatedAt: string | null) {
  return {
    id: 1,
    extraConfig: JSON.stringify(extraConfig),
    updatedAt,
  };
}

describe('accountHealthService persistence', () => {
  beforeEach(() => {
    reloadAccountMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    updateRunMock.mockReset();
  });

  it('remerges runtime health into a concurrent config edit after a compare-and-swap conflict', async () => {
    reloadAccountMock
      .mockResolvedValueOnce(account({ custom: 'first-config' }, '2026-08-28T00:00:01.000Z'))
      .mockResolvedValueOnce(account({
        custom: 'concurrent-proxy-oauth-edit',
        proxyUrl: 'http://concurrent-proxy.example',
        oauth: { provider: 'concurrent-oauth' },
      }, '2026-08-28T00:00:02.000Z'));
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { setAccountRuntimeHealth } = await import('./accountHealthService.js');
    const health = await setAccountRuntimeHealth(1, {
      state: 'healthy',
      reason: 'balance refreshed',
      source: 'balance',
      checkedAt: '2026-08-28T00:01:00.000Z',
    });

    expect(health).toMatchObject({ state: 'healthy', source: 'balance' });
    expect(updateSetMock).toHaveBeenCalledTimes(2);
    const persistedConfig = JSON.parse(String(updateSetMock.mock.calls[1]?.[0]?.extraConfig));
    expect(persistedConfig).toEqual(expect.objectContaining({
      custom: 'concurrent-proxy-oauth-edit',
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'concurrent-oauth' },
      runtimeHealth: expect.objectContaining({ state: 'healthy', source: 'balance' }),
    }));
  });

  it('persists runtime health with a nullable updatedAt compare-and-swap predicate', async () => {
    reloadAccountMock.mockResolvedValue(account({ custom: 'nullable-timestamp' }, null));
    updateRunMock.mockResolvedValue({ changes: 1 });

    const { setAccountRuntimeHealth } = await import('./accountHealthService.js');
    await expect(setAccountRuntimeHealth(1, { state: 'healthy', source: 'balance' }))
      .resolves.toMatchObject({ state: 'healthy' });

    expect(updateWhereMock).toHaveBeenCalledTimes(1);
  });
});
