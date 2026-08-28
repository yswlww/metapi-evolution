import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.fn();
const decryptPasswordMock = vi.fn();
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

vi.mock('./platforms/index.js', () => ({
  getAdapter: () => ({ login: (...args: unknown[]) => loginMock(...args) }),
}));

vi.mock('./accountCredentialService.js', () => ({
  decryptAccountPassword: (...args: unknown[]) => decryptPasswordMock(...args),
}));

vi.mock('./siteProxy.js', () => ({
  withAccountProxyOverride: async (_proxy: string | null, callback: () => Promise<unknown>) => callback(),
}));

const initialAccount = {
  id: 1,
  username: 'demo-user_7659',
  status: 'expired',
  updatedAt: '2026-08-28T00:00:00.000Z',
  extraConfig: JSON.stringify({
    autoRelogin: { username: 'demo-user', passwordCipher: 'old-cipher', updatedAt: 'generation-1' },
    proxyUrl: 'http://old-proxy.example',
    custom: 'initial',
  }),
};

function currentAccount(extraConfig: Record<string, unknown>, updatedAt: string) {
  return {
    ...initialAccount,
    extraConfig: JSON.stringify(extraConfig),
    updatedAt,
  };
}

describe('accountAutoReloginService', () => {
  beforeEach(() => {
    loginMock.mockReset();
    decryptPasswordMock.mockReset();
    reloadAccountMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    updateRunMock.mockReset();

    decryptPasswordMock.mockReturnValue('plain-password');
    loginMock.mockResolvedValue({ success: true, accessToken: 'fresh-token', platformUserId: 80315 });
  });

  it('remerges an authoritative ID into the latest config after a conditional conflict', async () => {
    const firstCurrent = currentAccount({
      autoRelogin: { username: 'demo-user', passwordCipher: 'old-cipher', updatedAt: 'generation-1' },
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'concurrent-oauth' },
      custom: 'first-concurrent-change',
    }, '2026-08-28T00:00:01.000Z');
    const secondCurrent = currentAccount({
      autoRelogin: { username: 'demo-user', passwordCipher: 'old-cipher', updatedAt: 'generation-1' },
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'newer-concurrent-oauth' },
      custom: 'second-concurrent-change',
    }, '2026-08-28T00:00:02.000Z');
    reloadAccountMock
      .mockResolvedValueOnce(firstCurrent)
      .mockResolvedValueOnce(secondCurrent);
    updateRunMock
      .mockResolvedValueOnce({ changes: 0 })
      .mockResolvedValueOnce({ changes: 1 });

    const { autoReloginAccount } = await import('./accountAutoReloginService.js');
    const result = await autoReloginAccount(initialAccount, {
      platform: 'new-api',
      url: 'https://example.com',
    });

    expect(result).toEqual(expect.objectContaining({
      accessToken: 'fresh-token',
      platformUserId: 80315,
    }));
    expect(updateSetMock).toHaveBeenCalledTimes(2);
    expect(updateWhereMock).toHaveBeenCalledTimes(2);
    const firstPersisted = JSON.parse(String(updateSetMock.mock.calls[0]?.[0]?.extraConfig));
    const secondPersisted = JSON.parse(String(updateSetMock.mock.calls[1]?.[0]?.extraConfig));
    expect(firstPersisted).toEqual(expect.objectContaining({
      platformUserId: 80315,
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'concurrent-oauth' },
      custom: 'first-concurrent-change',
    }));
    expect(secondPersisted).toEqual(expect.objectContaining({
      platformUserId: 80315,
      proxyUrl: 'http://concurrent-proxy.example',
      oauth: { provider: 'newer-concurrent-oauth' },
      custom: 'second-concurrent-change',
    }));
  });

  it('discards a successful login when its auto-relogin credentials changed concurrently', async () => {
    reloadAccountMock.mockResolvedValue(currentAccount({
      autoRelogin: { username: 'demo-user', passwordCipher: 'old-cipher', updatedAt: 'generation-2' },
      custom: 'concurrent-credential-generation-change',
    }, '2026-08-28T00:00:01.000Z'));

    const { autoReloginAccount } = await import('./accountAutoReloginService.js');
    const result = await autoReloginAccount(initialAccount, {
      platform: 'new-api',
      url: 'https://example.com',
    });

    expect(result).toBeNull();
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it('stops after bounded conditional conflicts without an unconditional config overwrite', async () => {
    reloadAccountMock.mockResolvedValue(currentAccount({
      autoRelogin: { username: 'demo-user', passwordCipher: 'old-cipher', updatedAt: 'generation-1' },
      custom: 'latest-config',
    }, '2026-08-28T00:00:01.000Z'));
    updateRunMock.mockResolvedValue({ changes: 0 });

    const { autoReloginAccount } = await import('./accountAutoReloginService.js');
    const result = await autoReloginAccount(initialAccount, {
      platform: 'new-api',
      url: 'https://example.com',
    });

    expect(result).toBeNull();
    expect(updateSetMock).toHaveBeenCalledTimes(3);
    expect(updateWhereMock).toHaveBeenCalledTimes(3);
  });

  it('uses the safe username suffix fallback when a login adapter returns an invalid runtime ID', async () => {
    loginMock.mockResolvedValue({
      success: true,
      accessToken: 'fresh-token',
      platformUserId: '80315abc',
    });
    reloadAccountMock.mockResolvedValue(currentAccount({
      autoRelogin: { username: 'demo-user', passwordCipher: 'old-cipher', updatedAt: 'generation-1' },
    }, '2026-08-28T00:00:01.000Z'));
    updateRunMock.mockResolvedValue({ changes: 1 });

    const { autoReloginAccount } = await import('./accountAutoReloginService.js');
    const result = await autoReloginAccount(initialAccount, {
      platform: 'new-api',
      url: 'https://example.com',
    });

    expect(result).toEqual(expect.objectContaining({ platformUserId: 7659 }));
    expect(updateSetMock.mock.calls[0]?.[0]).not.toHaveProperty('extraConfig');
  });
});
