import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type DbModule = typeof import('../db/index.js');
type TokenRouterModule = typeof import('./tokenRouter.js');

/**
 * A downstream key may legitimately expose the same model name from two
 * routes: an aggregation group and a direct route. When every channel of the
 * first-matching route is blocked by that key's policy, the router must fall
 * back to another route exposing the same name instead of reporting no model.
 */
describe('duplicate model names across routes', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let TokenRouter: TokenRouterModule['TokenRouter'];
  let invalidateTokenRouterCache: TokenRouterModule['invalidateTokenRouterCache'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-token-router-duplicate-name-'));
    process.env.DATA_DIR = dataDir;
    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    const tokenRouterModule = await import('./tokenRouter.js');
    db = dbModule.db;
    schema = dbModule.schema;
    TokenRouter = tokenRouterModule.TokenRouter;
    invalidateTokenRouterCache = tokenRouterModule.invalidateTokenRouterCache;
  });

  beforeEach(async () => {
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
    invalidateTokenRouterCache();
  });

  afterAll(() => {
    invalidateTokenRouterCache();
    delete process.env.DATA_DIR;
  });

  async function seedSite(name: string) {
    return db.insert(schema.sites).values({
      name,
      url: `https://${name}.example.com`,
      platform: 'openai',
      status: 'active',
    }).returning().get();
  }

  it('falls back to a second route when the first matching route is fully excluded', async () => {
    const blockedSite = await seedSite('blocked-site');
    const allowedSite = await seedSite('allowed-site');

    const blockedAccount = await db.insert(schema.accounts).values({
      siteId: blockedSite.id,
      username: 'blocked-user',
      accessToken: 'access-blocked',
      apiToken: 'sk-blocked',
      status: 'active',
    }).returning().get();
    const allowedAccount = await db.insert(schema.accounts).values({
      siteId: allowedSite.id,
      username: 'allowed-user',
      accessToken: 'access-allowed',
      apiToken: 'sk-allowed',
      status: 'active',
    }).returning().get();

    const blockedRoute = await db.insert(schema.tokenRoutes).values({
      modelPattern: 'shared-model',
      displayName: 'shared-model',
      routeMode: 'explicit_group',
      enabled: true,
    }).returning().get();
    const allowedRoute = await db.insert(schema.tokenRoutes).values({
      modelPattern: 'shared-model',
      routeMode: 'pattern',
      enabled: true,
    }).returning().get();

    await db.insert(schema.routeChannels).values([
      { routeId: blockedRoute.id, accountId: blockedAccount.id, tokenId: null, priority: 0, weight: 10, enabled: true },
      { routeId: allowedRoute.id, accountId: allowedAccount.id, tokenId: null, priority: 0, weight: 10, enabled: true },
    ]).run();

    const router = new TokenRouter();
    const policy: any = {
      allowedRouteIds: [blockedRoute.id, allowedRoute.id],
      supportedModels: [],
      siteWeightMultipliers: {},
      excludedSiteIds: [blockedSite.id],
      excludedCredentialRefs: [],
    };

    const decision = await router.explainSelection('shared-model', [], policy);
    expect(decision.selectedChannelId).toBeTruthy();
    expect(decision.selectedAccountId).toBe(allowedAccount.id);
  });
});
