import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

// Only the upstream probe call is faked; everything else (DB, availability
// writes, site-disabled rows) stays real so the test exercises the behaviour.
const probeRuntimeModel = vi.hoisted(() => vi.fn());
vi.mock('./runtimeModelProbe.js', async () => {
  const actual = await vi.importActual<typeof import('./runtimeModelProbe.js')>('./runtimeModelProbe.js');
  return { ...actual, probeRuntimeModel };
});

type DbModule = typeof import('../db/index.js');
type ModelServiceModule = typeof import('./modelService.js');

describe('probe outcomes keep models but mark them', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let probeSiteModels: ModelServiceModule['probeSiteModels'];

  beforeAll(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'metapi-model-probe-outcomes-'));
    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    const modelService = await import('./modelService.js');
    db = dbModule.db;
    schema = dbModule.schema;
    probeSiteModels = modelService.probeSiteModels;
  });

  beforeEach(async () => {
    probeRuntimeModel.mockReset();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.siteDisabledModels).run();
    await db.delete(schema.tokenModelAvailability).run();
    await db.delete(schema.modelAvailability).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(() => {
    delete process.env.DATA_DIR;
  });

  async function seedModel(modelName: string) {
    const site = await db.insert(schema.sites).values({
      name: 'probe-outcome-site',
      url: 'https://probe-outcome.example.com',
      platform: 'openai',
      status: 'active',
      postRefreshProbeScope: 'all',
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      accessToken: 'probe-outcome-token',
      status: 'active',
    }).returning().get();
    await db.insert(schema.modelAvailability).values({
      accountId: account.id,
      modelName,
      available: true,
    }).run();
    return { site, account };
  }

  async function readModel(accountId: number, modelName: string) {
    return db.select().from(schema.modelAvailability)
      .where(eq(schema.modelAvailability.accountId, accountId))
      .all()
      .then((rows) => rows.find((row) => row.modelName === modelName));
  }

  it('keeps an inconclusive model available and does not disable the site', async () => {
    const { site, account } = await seedModel('flaky-model');
    probeRuntimeModel.mockResolvedValue({ status: 'inconclusive', latencyMs: null, reason: 'probe timed out' });

    await probeSiteModels(site.id, { scope: 'all' });

    const row = await readModel(account.id, 'flaky-model');
    expect(row?.available).toBe(true);

    const disabled = await db.select().from(schema.siteDisabledModels)
      .where(eq(schema.siteDisabledModels.siteId, site.id)).all();
    expect(disabled.map((r) => r.modelName)).not.toContain('flaky-model');
  });

  it('keeps a definitively unsupported model available but records a site warning row', async () => {
    const { site, account } = await seedModel('retired-model');
    probeRuntimeModel.mockResolvedValue({ status: 'unsupported', latencyMs: 120, reason: 'model_not_found' });

    await probeSiteModels(site.id, { scope: 'all' });

    const row = await readModel(account.id, 'retired-model');
    expect(row?.available).toBe(true);

    const disabled = await db.select().from(schema.siteDisabledModels)
      .where(eq(schema.siteDisabledModels.siteId, site.id)).all();
    expect(disabled.map((r) => r.modelName)).toContain('retired-model');
  });

  it('reports per-model outcomes so the caller can surface a warning', async () => {
    const { site } = await seedModel('reported-model');
    probeRuntimeModel.mockResolvedValue({ status: 'unsupported', latencyMs: 90, reason: 'model_not_found' });

    const result = await probeSiteModels(site.id, { scope: 'all' });

    const detail = result.details.find((d) => d.modelName === 'reported-model');
    expect(detail?.status).toBe('unsupported');
    expect(result.unsupported).toBe(1);
  });

  it('leaves a supported model available and unmarked', async () => {
    const { site, account } = await seedModel('healthy-model');
    probeRuntimeModel.mockResolvedValue({ status: 'supported', latencyMs: 200 });

    await probeSiteModels(site.id, { scope: 'all' });

    const row = await readModel(account.id, 'healthy-model');
    expect(row?.available).toBe(true);
    const disabled = await db.select().from(schema.siteDisabledModels)
      .where(eq(schema.siteDisabledModels.siteId, site.id)).all();
    expect(disabled.map((r) => r.modelName)).not.toContain('healthy-model');
  });
});
