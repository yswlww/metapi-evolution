import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { createUpdateState } from '../../../shared/localUpdateContract.js';
import { finishLocalUpdateTask, resolveLocalUpdatePaths, writeUpdateState } from '../../../shared/localUpdateRuntime.js';

const mocks = vi.hoisted(() => ({ github: vi.fn(), docker: vi.fn(), upgrade: vi.fn(), rollback: vi.fn(), support: vi.fn(), activate: vi.fn() }));
vi.mock('../../services/updateCenterVersionService.js', async () => ({
  ...await vi.importActual<typeof import('../../services/updateCenterVersionService.js')>('../../services/updateCenterVersionService.js'),
  fetchLatestStableGitHubRelease: mocks.github, fetchDockerHubTagCandidates: mocks.docker,
}));
vi.mock('../../services/updateCenterLocalService.js', async () => ({
  ...await vi.importActual<typeof import('../../services/updateCenterLocalService.js')>('../../services/updateCenterLocalService.js'),
  performLocalUpgrade: mocks.upgrade, rollbackToPrevious: mocks.rollback, getSelfUpgradeSupportForRuntime: mocks.support,
}));
type DbModule = typeof import('../../db/index.js');

describe('local update-center API', () => {
  let app: FastifyInstance;
  let dataDir: string;
  let database: DbModule;
  const sendDescriptor = Object.getOwnPropertyDescriptor(process, 'send');
  const connectedDescriptor = Object.getOwnPropertyDescriptor(process, 'connected');
  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'metapi-local-api-'));
    process.env.DATA_DIR = dataDir;
    Object.defineProperty(process, 'send', { value: mocks.activate, configurable: true });
    Object.defineProperty(process, 'connected', { value: true, configurable: true });
    await import('../../db/migrate.js');
    database = await import('../../db/index.js');
    app = Fastify();
    await app.register((await import('./updateCenter.js')).updateCenterRoutes);
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.github.mockResolvedValue(null);
    mocks.docker.mockResolvedValue({ primary: null, recentNonStable: [] });
    mocks.support.mockResolvedValue({ supported: true, reason: null, arch: 'x64' });
    await database.db.delete(database.schema.settings).run();
    await rm(join(dataDir, 'runtime'), { recursive: true, force: true });
    mocks.upgrade.mockImplementation(async options => {
      const state = await writeUpdateState(resolveLocalUpdatePaths(dataDir), createUpdateState({ phase: 'health-checking', taskId: options.taskId, targetVersion: '9.0.0', attempts: 1 }));
      await options.log('Checksum verified');
      return { success: true, version: '9.0.0', requiresRestart: true, state };
    });
    mocks.rollback.mockResolvedValue('releases/1.0.0');
  });
  afterAll(async () => {
    await app.close();
    await database.closeDbConnections();
    await rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    if (sendDescriptor) Object.defineProperty(process, 'send', sendDescriptor); else delete process.send;
    if (connectedDescriptor) Object.defineProperty(process, 'connected', connectedDescriptor); else delete (process as unknown as { connected?: boolean }).connected;
  });
  const inject = (method: 'POST' | 'PUT' | 'GET', url: string, payload?: unknown) => app.inject({ method, url, ...(payload === undefined ? {} : { payload }) });
  async function enable() {
    expect((await inject('PUT', '/api/update-center/config', { enabled: true })).statusCode).toBe(200);
  }
  async function wait(test: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 2000;
    while (!await test()) {
      if (Date.now() > deadline) throw new Error('Local task did not settle');
      await new Promise(r => setTimeout(r, 10));
    }
  }
  const start = () => inject('POST', '/api/update-center/deploy', { source: 'github-release', targetTag: 'v9.0.0', targetDigest: 'sha256:' + 'a'.repeat(64) });

  it('writes only the local config key, dropping old cluster settings', async () => {
    const response = await inject('PUT', '/api/update-center/config', { enabled: true, helperBaseUrl: 'https://old.test', chartRef: 'chart' });
    expect(response.json().config.helperBaseUrl).toBeUndefined();
    const saved = await database.db.select().from(database.schema.settings).where(eq(database.schema.settings.key, 'update_center_config_v2')).get();
    expect(saved?.value).toContain('"enabled":true');
  });
  it('rejects malformed bodies and invalid source enums', async () => {
    expect((await inject('PUT', '/api/update-center/config', [])).statusCode).toBe(400);
    expect((await inject('POST', '/api/update-center/deploy', { source: 'invalid' })).statusCode).toBe(400);
  });
  it('refuses disabled and unsupported deployments without starting work', async () => {
    expect((await start()).statusCode).toBe(400);
    await enable();
    mocks.support.mockResolvedValue({ supported: false, reason: 'No runtime supervisor', arch: 'x64' });
    expect((await start()).json().message).toContain('supervisor');
    expect(mocks.upgrade).not.toHaveBeenCalled();
  });
  it('rejects missing, unsafe and alias targets before any task is created', async () => {
    await enable();
    for (const tag of ['', '../../data', 'latest', 'dev']) expect((await inject('POST', '/api/update-center/deploy', { targetTag: tag })).statusCode).toBe(400);
    expect(mocks.upgrade).not.toHaveBeenCalled();
  });
  it('keeps the task running until the supervisor confirms health', async () => {
    await enable();
    const response = await start();
    expect(response.statusCode).toBe(202);
    const id = response.json().task.id;
    await wait(() => mocks.activate.mock.calls.length === 1);
    expect(mocks.activate).toHaveBeenCalledWith({ type: 'metapi:activate', taskId: id });
    expect(mocks.upgrade).toHaveBeenCalledWith(expect.objectContaining({ candidate: expect.not.objectContaining({ digest: expect.anything() }) }));
    expect((await inject('GET', `/api/update-center/tasks/${id}`)).json().task.status).toBe('running');
    const state = createUpdateState({ phase: 'completed', taskId: id, targetVersion: '9.0.0' });
    await finishLocalUpdateTask(resolveLocalUpdatePaths(dataDir), state);
    const task = (await inject('GET', `/api/update-center/tasks/${id}`)).json().task;
    expect(task.status).toBe('succeeded');
    expect(task.logs.some((line: {message: string}) => line.message.includes('Activated'))).toBe(true);
    const stream = await inject('GET', `/api/update-center/tasks/${id}/stream`);
    expect(stream.body).toContain('event: done');
    expect(stream.body).toContain('"status":"succeeded"');
  });
  it('deduplicates concurrent requests and preserves the task outcome after restart', async () => {
    await enable();
    const [a, b] = await Promise.all([start(), start()]);
    expect(a.json().task.id).toBe(b.json().task.id);
    await wait(() => mocks.activate.mock.calls.length === 1);
    await finishLocalUpdateTask(resolveLocalUpdatePaths(dataDir), createUpdateState({ phase: 'rolled-back', taskId: a.json().task.id, error: 'Migration failed; restored previous version' }));
    const recovered = (await inject('GET', '/api/update-center/status')).json();
    expect(recovered.lastFinishedTask.status).toBe('failed');
    expect(recovered.lastFinishedTask.error).toContain('Migration failed');
  });
  it('persists a checksum failure without requesting activation', async () => {
    await enable();
    mocks.upgrade.mockResolvedValue({ success: false, state: { error: 'checksum mismatch' } });
    const response = await start();
    const id = response.json().task.id;
    await wait(async () => (await inject('GET', `/api/update-center/tasks/${id}`)).json().task.status === 'failed');
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it('reports runtime capability and does not contact a cluster helper', async () => {
    const value = (await inject('POST', '/api/update-center/check')).json();
    expect(value.selfUpgrade).toMatchObject({ supported: true, arch: 'x64' });
    expect(value.helper.ok).toBe(false);
    expect(value.localUpdate.canRollback).toBe(false);
    expect((await inject('GET', '/api/update-center/tasks/no-such-task')).statusCode).toBe(404);
  });
});
