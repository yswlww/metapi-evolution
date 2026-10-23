import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

type DbModule = typeof import('../../db/index.js');

describe('/api/models/token-candidates excludes site-disabled models', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];

  beforeAll(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'metapi-stats-disabled-'));
    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./stats.js');
    db = dbModule.db;
    schema = dbModule.schema;
    app = Fastify();
    await app.register(routesModule.statsRoutes);
  });

  beforeEach(async () => {
    for (const table of ['routeChannels', 'tokenRoutes', 'tokenModelAvailability', 'modelAvailability', 'accountTokens', 'accounts', 'sites', 'siteDisabledModels'] as const) {
      await db.delete(schema[table]).run();
    }
  });

  afterAll(async () => { await app.close(); delete process.env.DATA_DIR; });

  it('omits a disabled model from candidates and pending-token lists while keeping its siblings', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'disabled-filter-site', url: 'https://disabled-filter.example.com', platform: 'new-api', status: 'active',
    }).returning().get();

    const account = await db.insert(schema.accounts).values({
      siteId: site.id, accessToken: 'session-token', status: 'active',
    }).returning().get();

    await db.insert(schema.modelAvailability).values([
      { accountId: account.id, modelName: 'kept-model', available: true },
      { accountId: account.id, modelName: 'disabled-model', available: true },
    ]).run();

    await db.insert(schema.siteDisabledModels).values({ siteId: site.id, modelName: 'disabled-model' }).run();

    const response = await app.inject({ method: 'GET', url: '/api/models/token-candidates' });
    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(Object.keys(body.modelsWithoutToken)).toContain('kept-model');
    expect(Object.keys(body.modelsWithoutToken)).not.toContain('disabled-model');
    expect(Object.keys(body.models)).not.toContain('disabled-model');
    expect(Object.keys(body.modelsMissingTokenGroups)).not.toContain('disabled-model');
  });

  it('ignores whitespace-padded disabled rows restored from a backup', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'padded-site', url: 'https://padded.example.com', platform: 'new-api', status: 'active',
    }).returning().get();

    const account = await db.insert(schema.accounts).values({
      siteId: site.id, accessToken: 'session-token', status: 'active',
    }).returning().get();

    await db.insert(schema.modelAvailability).values({ accountId: account.id, modelName: 'padded-model', available: true }).run();
    await db.insert(schema.siteDisabledModels).values({ siteId: site.id, modelName: '  Padded-Model  ' }).run();

    const body = (await app.inject({ method: 'GET', url: '/api/models/token-candidates' })).json();
    expect(Object.keys(body.modelsWithoutToken)).not.toContain('padded-model');
  });
});
