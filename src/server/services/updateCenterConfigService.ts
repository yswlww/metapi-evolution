import { eq } from 'drizzle-orm';

import { db, schema } from '../db/index.js';
import { upsertSetting } from '../db/upsertSetting.js';
import type { UpdateCenterVersionSource } from './updateCenterVersionService.js';

export type UpdateCenterConfig = {
  enabled: boolean;
  githubReleasesEnabled: boolean;
  dockerHubTagsEnabled: boolean;
  defaultDeploySource: UpdateCenterVersionSource;
};

/**
 * Current config key. The Kubernetes-era key is kept as a read-only source so
 * an existing install keeps its `enabled` and source preferences through the
 * migration; it is never written again.
 */
export const UPDATE_CENTER_CONFIG_SETTING_KEY = 'update_center_config_v2';
export const LEGACY_UPDATE_CENTER_CONFIG_SETTING_KEY = 'update_center_k3s_config_v1';

export function getDefaultUpdateCenterConfig(): UpdateCenterConfig {
  return {
    enabled: false,
    githubReleasesEnabled: true,
    dockerHubTagsEnabled: true,
    defaultDeploySource: 'github-release',
  };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Normalise a stored or incoming config.
 *
 * Kubernetes-only fields (helperBaseUrl, namespace, releaseName, chartRef,
 * imageRepository) are dropped: local upgrades do not talk to a cluster, so
 * keeping them would be a config that describes a mechanism that no longer
 * exists.
 */
export function normalizeUpdateCenterConfig(input: unknown): UpdateCenterConfig {
  const defaults = getDefaultUpdateCenterConfig();
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const defaultDeploySource = record.defaultDeploySource === 'docker-hub-tag'
    ? 'docker-hub-tag'
    : 'github-release';

  return {
    enabled: normalizeBoolean(record.enabled, defaults.enabled),
    githubReleasesEnabled: normalizeBoolean(record.githubReleasesEnabled, defaults.githubReleasesEnabled),
    dockerHubTagsEnabled: normalizeBoolean(record.dockerHubTagsEnabled, defaults.dockerHubTagsEnabled),
    defaultDeploySource,
  };
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? null;
}

function parseConfig(raw: string | null): UpdateCenterConfig | null {
  if (!raw) return null;
  try {
    return normalizeUpdateCenterConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Load the config, migrating the legacy key on first read.
 *
 * The legacy key is read but never deleted here: deleting a user's stored
 * setting from a read path is a side effect that is hard to reverse if the
 * migration turns out to be wrong. It simply stops being consulted once the
 * new key exists.
 */
export async function loadUpdateCenterConfig(): Promise<UpdateCenterConfig> {
  const current = parseConfig(await readSetting(UPDATE_CENTER_CONFIG_SETTING_KEY));
  if (current) return current;

  const legacy = parseConfig(await readSetting(LEGACY_UPDATE_CENTER_CONFIG_SETTING_KEY));
  if (legacy) {
    await upsertSetting(UPDATE_CENTER_CONFIG_SETTING_KEY, legacy);
    return legacy;
  }

  return getDefaultUpdateCenterConfig();
}

export async function saveUpdateCenterConfig(input: unknown): Promise<UpdateCenterConfig> {
  const next = normalizeUpdateCenterConfig(input);
  await upsertSetting(UPDATE_CENTER_CONFIG_SETTING_KEY, next);
  return next;
}
