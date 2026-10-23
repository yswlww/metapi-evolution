import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const verifyTokenMock = vi.fn();
const getApiTokensMock = vi.fn();

vi.mock('../../services/platforms/index.js', () => ({
  getAdapter: () => ({
    verifyToken: (...args: unknown[]) => verifyTokenMock(...args),
    getApiTokens: (...args: unknown[]) => getApiTokensMock(...args),
  }),
}));

type DbModule = typeof import('../../db/index.js');

describe('accounts add requires token verification success', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-accounts-add-requires-verify-'));
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
    verifyTokenMock.mockReset();
    getApiTokensMock.mockReset();
    getApiTokensMock.mockResolvedValue([]);

    await db.delete(schema.proxyLogs).run();
    await db.delete(schema.checkinLogs).run();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.tokenModelAvailability).run();
    await db.delete(schema.modelAvailability).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATA_DIR;
  });

  it('keeps the browser-verification diagnostic when creating a session connection', async () => {
    const message = '站点返回了阿里云 ESA 浏览器验证页面，需要真实浏览器执行 JavaScript';
    verifyTokenMock.mockResolvedValueOnce({ tokenType: 'unknown', message });
    const site = await db.insert(schema.sites).values({ name: 'ESA', url: 'https://esa.example.com', platform: 'new-api' }).returning().get();
    const response = await app.inject({ method: 'POST', url: '/api/accounts', payload: { siteId: site.id, accessToken: 'fixture', credentialMode: 'session' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, message: expect.stringContaining(message) });
    expect(await db.select().from(schema.accounts).all()).toHaveLength(0);
  });

  it('rejects binding when token verification is not successful', async () => {
    verifyTokenMock.mockResolvedValueOnce({ tokenType: 'unknown' });

    const site = await db.insert(schema.sites).values({
      name: 'Verify Site',
      url: 'https://verify.example.com',
      platform: 'new-api',
    }).returning().get();

    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: {
        siteId: site.id,
        accessToken: 'invalid-token',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
    });
    expect(await db.select().from(schema.accounts).all()).toHaveLength(0);
  });

  it('returns rebind hint when token verify reports invalid access token', async () => {
    verifyTokenMock.mockRejectedValueOnce(new Error('无权进行此操作，access token 无效'));

    const site = await db.insert(schema.sites).values({
      name: 'Verify Site',
      url: 'https://verify.example.com',
      platform: 'new-api',
    }).returning().get();

    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: {
        siteId: site.id,
        accessToken: 'invalid-token',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      message: '无权进行此操作，access token 无效，请在中转站重新生成系统访问令牌后重新绑定账号',
    });
    expect(await db.select().from(schema.accounts).all()).toHaveLength(0);
  });

  it('allows binding when token verification succeeds as api key', async () => {
    verifyTokenMock.mockResolvedValueOnce({
      tokenType: 'apikey',
      models: ['gpt-4o-mini'],
    });

    const site = await db.insert(schema.sites).values({
      name: 'API Key Site',
      url: 'https://apikey.example.com',
      platform: 'new-api',
    }).returning().get();

    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: {
        siteId: site.id,
        accessToken: 'sk-valid-key',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { tokenType?: string; apiTokenFound?: boolean };
    expect(body.tokenType).toBe('apikey');
    expect(body.apiTokenFound).toBe(true);

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(1);
    expect((accounts[0]?.apiToken || '').startsWith('sk-')).toBe(true);
  });
});
