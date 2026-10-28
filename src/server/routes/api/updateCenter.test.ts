import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { waitForBackgroundTaskToReachTerminalState } from '../../test-fixtures/backgroundTaskTestUtils.js';

const {
  fetchLatestStableGitHubReleaseMock,
  fetchDockerHubTagCandidatesMock,
  performLocalUpgradeMock,
  rollbackToPreviousMock,
} = vi.hoisted(() => ({
  fetchLatestStableGitHubReleaseMock: vi.fn(),
  fetchDockerHubTagCandidatesMock: vi.fn(),
  performLocalUpgradeMock: vi.fn(),
  rollbackToPreviousMock: vi.fn(),
}));

vi.mock('../../services/updateCenterVersionService.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/updateCenterVersionService.js')>('../../services/updateCenterVersionService.js');
  return {
    ...actual,
    fetchLatestStableGitHubRelease: (...args: unknown[]) => fetchLatestStableGitHubReleaseMock(...args),
    fetchDockerHubTagCandidates: (...args: unknown[]) => fetchDockerHubTagCandidatesMock(...args),
  };
});

vi.mock('../../services/updateCenterLocalService.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/updateCenterLocalService.js')>('../../services/updateCenterLocalService.js');
  return {
    ...actual,
    performLocalUpgrade: (...args: unknown[]) => performLocalUpgradeMock(...args),
    rollbackToPrevious: (...args: unknown[]) => rollbackToPreviousMock(...args),
  };
});

type DbModule = typeof import('../../db/index.js');

function getNextPatchVersion(version: string) {
  const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return '999.0.0';
  return `${match[1]}.${match[2]}.${Number.parseInt(match[3], 10) + 1}`;
}

describe('update center routes', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let closeDbConnections: DbModule['closeDbConnections'];
  let dataDir = '';
  let resetBackgroundTasks: (() => void) | null = null;
  let getBackgroundTask: ((taskId: string) => { status: string; logs?: Array<{ message: string }> } | null) | null = null;

  async function saveEnabledConfig() {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/update-center/config',
      payload: {
        enabled: true,
        githubReleasesEnabled: true,
        dockerHubTagsEnabled: true,
        defaultDeploySource: 'github-release',
      },
    });
    expect(response.statusCode).toBe(200);
  }

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-update-center-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./updateCenter.js');
    const backgroundTaskModule = await import('../../services/backgroundTaskService.js');

    db = dbModule.db;
    schema = dbModule.schema;
    closeDbConnections = dbModule.closeDbConnections;
    resetBackgroundTasks = backgroundTaskModule.__resetBackgroundTasksForTests;
    getBackgroundTask = backgroundTaskModule.getBackgroundTask;

    app = Fastify();
    await app.register(routesModule.updateCenterRoutes);
  });

  beforeEach(async () => {
    fetchLatestStableGitHubReleaseMock.mockReset();
    fetchDockerHubTagCandidatesMock.mockReset();
    performLocalUpgradeMock.mockReset();
    rollbackToPreviousMock.mockReset();
    resetBackgroundTasks?.();
    await db.delete(schema.settings).run();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (typeof closeDbConnections === 'function') await closeDbConnections();
    if (dataDir) {
      try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    }
    delete process.env.DATA_DIR;
  });

  it('persists config under the new key and drops the Kubernetes fields', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/update-center/config',
      payload: {
        enabled: true,
        helperBaseUrl: 'http://old-helper:9850',
        namespace: 'ai',
        chartRef: 'oci://example/chart',
        githubReleasesEnabled: false,
        defaultDeploySource: 'docker-hub-tag',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config.enabled).toBe(true);
    expect(body.config.defaultDeploySource).toBe('docker-hub-tag');
    expect(body.config.helperBaseUrl).toBeUndefined();
    expect(body.config.chartRef).toBeUndefined();

    const saved = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, 'update_center_config_v2')).get();
    expect(saved?.value).toContain('"enabled":true');
  });

  it('rejects a payload that is not an object', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/update-center/config',
      payload: ['not', 'an', 'object'],
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects deploy requests when the update center is disabled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/update-center/deploy',
      payload: { source: 'github-release', targetTag: '1.5.0' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('disabled');
    expect(performLocalUpgradeMock).not.toHaveBeenCalled();
  });

  it('rejects deploy requests without a target tag', async () => {
    await saveEnabledConfig();
    const response = await app.inject({
      method: 'POST',
      url: '/api/update-center/deploy',
      payload: { source: 'github-release' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('targetTag');
  });

  it('starts a local upgrade task and reports when a restart is required', async () => {
    await saveEnabledConfig();
    performLocalUpgradeMock.mockResolvedValue({
      success: true,
      version: '1.5.0',
      requiresRestart: true,
      previousVersion: '1.4.2',
      state: { phase: 'health-checking', attempts: 1 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/update-center/deploy',
      payload: { source: 'github-release', targetTag: 'v1.5.0', targetDigest: 'sha256:' + 'a'.repeat(64) },
    });

    expect(response.statusCode).toBe(202);
    const taskId = response.json().task.id as string;
    await waitForBackgroundTaskToReachTerminalState((id) => getBackgroundTask?.(id) ?? null, taskId);

    const task = getBackgroundTask?.(taskId);
    expect(task?.status).toBe('succeeded');
    expect(performLocalUpgradeMock).toHaveBeenCalledWith(expect.objectContaining({
      source: 'github-release',
      candidate: expect.objectContaining({ normalizedVersion: '1.5.0' }),
    }));
  });

  it('marks the task failed when the local upgrade rejects the bundle', async () => {
    await saveEnabledConfig();
    performLocalUpgradeMock.mockResolvedValue({
      success: false,
      version: '1.5.0',
      requiresRestart: false,
      previousVersion: null,
      state: { phase: 'failed', attempts: 1, error: 'checksum mismatch for bundle' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/update-center/deploy',
      payload: { source: 'github-release', targetTag: '1.5.0' },
    });

    expect(response.statusCode).toBe(202);
    const taskId = response.json().task.id as string;
    await waitForBackgroundTaskToReachTerminalState((id) => getBackgroundTask?.(id) ?? null, taskId);

    const task = getBackgroundTask?.(taskId);
    expect(task?.status).toBe('failed');
  });

  it('starts a rollback task against the previous release', async () => {
    await saveEnabledConfig();
    rollbackToPreviousMock.mockResolvedValue('releases/1.4.2');

    const response = await app.inject({
      method: 'POST',
      url: '/api/update-center/rollback',
      payload: {},
    });

    expect(response.statusCode).toBe(202);
    const taskId = response.json().task.id as string;
    await waitForBackgroundTaskToReachTerminalState((id) => getBackgroundTask?.(id) ?? null, taskId);

    const task = getBackgroundTask?.(taskId);
    expect(task?.status).toBe('succeeded');
    expect(rollbackToPreviousMock).toHaveBeenCalledTimes(1);
  });

  it('returns status without contacting a deploy helper', async () => {
    fetchLatestStableGitHubReleaseMock.mockResolvedValue(null);
    fetchDockerHubTagCandidatesMock.mockResolvedValue({ primary: null, recentNonStable: [] });

    const response = await app.inject({ method: 'POST', url: '/api/update-center/check' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.currentVersion).toBeTypeOf('string');
    expect(body.helper?.ok).toBe(false);
    expect(body.helper?.history).toEqual([]);
  });

  it('streams task logs and rejects an unknown task id', async () => {
    await saveEnabledConfig();
    performLocalUpgradeMock.mockResolvedValue({
      success: true,
      version: '1.5.0',
      requiresRestart: true,
      previousVersion: null,
      state: { phase: 'health-checking', attempts: 1 },
    });

    const deployed = await app.inject({
      method: 'POST',
      url: '/api/update-center/deploy',
      payload: { source: 'github-release', targetTag: '1.5.0' },
    });
    const taskId = deployed.json().task.id as string;
    await waitForBackgroundTaskToReachTerminalState((id) => getBackgroundTask?.(id) ?? null, taskId);

    const stream = await app.inject({ method: 'GET', url: `/api/update-center/tasks/${taskId}/stream` });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: done');

    const missing = await app.inject({ method: 'GET', url: '/api/update-center/tasks/does-not-exist/stream' });
    expect(missing.statusCode).toBe(404);
  });

  it('reports the next patch version shape used by reminders', () => {
    expect(getNextPatchVersion('1.4.2')).toBe('1.4.3');
    expect(getNextPatchVersion('not-semver')).toBe('999.0.0');
  });
});
