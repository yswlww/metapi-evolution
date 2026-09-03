import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRequestRateLimitStore } from '../../middleware/requestRateLimit.js';

const loginMock = vi.fn();
const getApiTokenMock = vi.fn();
const getApiTokensMock = vi.fn();
const convergeAccountMutationMock = vi.fn();

vi.mock('../../services/platforms/index.js', () => ({
  getAdapter: () => ({
    login: (...args: unknown[]) => loginMock(...args),
    getApiToken: (...args: unknown[]) => getApiTokenMock(...args),
    getApiTokens: (...args: unknown[]) => getApiTokensMock(...args),
  }),
}));

vi.mock('../../services/accountMutationWorkflow.js', () => ({
  convergeAccountMutation: (...args: unknown[]) => convergeAccountMutationMock(...args),
  rebuildRoutesBestEffort: vi.fn(),
}));

type DbModule = typeof import('../../db/index.js');

describe('accounts password login user ID persistence', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-accounts-login-user-id-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./accounts.js');
    db = dbModule.db;
    schema = dbModule.schema;

    app = Fastify();
    await app.register(routesModule.accountsRoutes);
  });

  beforeEach(async () => {
    loginMock.mockReset();
    getApiTokenMock.mockReset();
    getApiTokensMock.mockReset();
    convergeAccountMutationMock.mockReset();
    resetRequestRateLimitStore();

    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();

    getApiTokenMock.mockResolvedValue(null);
    getApiTokensMock.mockResolvedValue([]);
    convergeAccountMutationMock.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('persists the authoritative password-login user ID instead of a username suffix guess', async () => {
    loginMock.mockResolvedValue({
      success: true,
      accessToken: 'session-token',
      platformUserId: 80312,
    });
    const site = await db.insert(schema.sites).values({
      name: 'Login Site',
      url: 'https://login.example.com',
      platform: 'new-api',
    }).returning().get();

    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      payload: { siteId: site.id, username: 'demo-user_7659', password: 'demo-password' },
    });

    expect(response.statusCode).toBe(200);
    const account = await db.select().from(schema.accounts).get();
    expect(JSON.parse(String(account?.extraConfig))).toEqual(expect.objectContaining({
      platformUserId: 80312,
    }));
  });

  it('retains the username-suffix fallback when password login returns no ID', async () => {
    loginMock.mockResolvedValue({ success: true, accessToken: 'session-token' });
    const site = await db.insert(schema.sites).values({
      name: 'Login Site',
      url: 'https://login.example.com',
      platform: 'new-api',
    }).returning().get();

    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      payload: { siteId: site.id, username: 'demo-user_7659', password: 'demo-password' },
    });

    expect(response.statusCode).toBe(200);
    const account = await db.select().from(schema.accounts).get();
    expect(JSON.parse(String(account?.extraConfig))).toEqual(expect.objectContaining({
      platformUserId: 7659,
    }));
  });

  it('falls back to a safe username suffix when an adapter returns an invalid runtime login ID', async () => {
    loginMock.mockResolvedValue({
      success: true,
      accessToken: 'session-token',
      platformUserId: '80312abc',
    });
    const site = await db.insert(schema.sites).values({
      name: 'Login Site',
      url: 'https://login.example.com',
      platform: 'new-api',
    }).returning().get();

    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      payload: { siteId: site.id, username: 'demo-user_7659', password: 'demo-password' },
    });

    expect(response.statusCode).toBe(200);
    const account = await db.select().from(schema.accounts).get();
    expect(JSON.parse(String(account?.extraConfig))).toEqual(expect.objectContaining({
      platformUserId: 7659,
    }));
    expect(getApiTokenMock).toHaveBeenCalledWith(site.url, 'session-token', 7659);
  });
});
