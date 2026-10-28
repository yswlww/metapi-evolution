import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  LEGACY_UPDATE_CENTER_CONFIG_SETTING_KEY as LegacyKey,
  UPDATE_CENTER_CONFIG_SETTING_KEY as CurrentKey,
} from './updateCenterConfigService.js';

type DbModule = typeof import('../db/index.js');
type ConfigModule = typeof import('./updateCenterConfigService.js');

describe('updateCenterConfigService', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let closeDbConnections: DbModule['closeDbConnections'];
  let dataDir = '';
  let config: ConfigModule;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-update-config-'));
    process.env.DATA_DIR = dataDir;
    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    db = dbModule.db;
    schema = dbModule.schema;
    closeDbConnections = dbModule.closeDbConnections;
    config = await import('./updateCenterConfigService.js');
  });

  beforeEach(async () => {
    await db.delete(schema.settings).run();
  });

  afterAll(async () => {
    if (typeof closeDbConnections === 'function') await closeDbConnections();
    if (dataDir) {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    }
    delete process.env.DATA_DIR;
  });

  it('returns defaults when nothing is stored', async () => {
    const loaded = await config.loadUpdateCenterConfig();
    expect(loaded).toEqual(config.getDefaultUpdateCenterConfig());
    expect(loaded.enabled).toBe(false);
    expect(loaded.githubReleasesEnabled).toBe(true);
  });

  it('drops the Kubernetes-only fields on normalisation', () => {
    const normalized = config.normalizeUpdateCenterConfig({
      enabled: true,
      helperBaseUrl: 'http://old-helper:9850',
      namespace: 'kube-system',
      releaseName: 'metapi',
      chartRef: 'oci://example/chart',
      imageRepository: 'example/repo',
      githubReleasesEnabled: false,
      defaultDeploySource: 'docker-hub-tag',
    });

    expect(normalized).toEqual({
      enabled: true,
      githubReleasesEnabled: false,
      dockerHubTagsEnabled: true,
      defaultDeploySource: 'docker-hub-tag',
    });
    expect('helperBaseUrl' in normalized).toBe(false);
    expect('chartRef' in normalized).toBe(false);
  });

  it('reads the legacy key once and rewrites it under the new key', async () => {
    await db.insert(schema.settings).values({
      key: config.LEGACY_UPDATE_CENTER_CONFIG_SETTING_KEY,
      value: JSON.stringify({
        enabled: true,
        helperBaseUrl: 'http://old-helper:9850',
        namespace: 'default',
        releaseName: 'metapi',
        chartRef: 'oci://example/chart',
        imageRepository: 'example/repo',
        githubReleasesEnabled: true,
        dockerHubTagsEnabled: false,
        defaultDeploySource: 'github-release',
      }),
    }).run();

    const loaded = await config.loadUpdateCenterConfig();

    expect(loaded.enabled).toBe(true);
    expect(loaded.dockerHubTagsEnabled).toBe(false);
    const migrated = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, config.UPDATE_CENTER_CONFIG_SETTING_KEY)).get();
    expect(migrated?.value).toContain('"enabled":true');
  });

  it('prefers the new key over the legacy key once both exist', async () => {
    await db.insert(schema.settings).values([
      {
        key: config.LEGACY_UPDATE_CENTER_CONFIG_SETTING_KEY,
        value: JSON.stringify({ enabled: true, githubReleasesEnabled: false }),
      },
      {
        key: config.UPDATE_CENTER_CONFIG_SETTING_KEY,
        value: JSON.stringify({ enabled: false, githubReleasesEnabled: true }),
      },
    ]).run();

    const loaded = await config.loadUpdateCenterConfig();
    expect(loaded.enabled).toBe(false);
    expect(loaded.githubReleasesEnabled).toBe(true);
  });

  it('persists under the new key and never rewrites the legacy key', async () => {
    await config.saveUpdateCenterConfig({ enabled: true, defaultDeploySource: 'docker-hub-tag' });

    const saved = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, config.UPDATE_CENTER_CONFIG_SETTING_KEY)).get();
    expect(saved?.value).toContain('"enabled":true');
    const legacy = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, config.LEGACY_UPDATE_CENTER_CONFIG_SETTING_KEY)).get();
    expect(legacy).toBeUndefined();
  });

  it('falls back to defaults when the stored value is corrupt', async () => {
    await db.insert(schema.settings).values({
      key: config.UPDATE_CENTER_CONFIG_SETTING_KEY,
      value: '{ not json',
    }).run();

    const loaded = await config.loadUpdateCenterConfig();
    expect(loaded).toEqual(config.getDefaultUpdateCenterConfig());
  });
});
