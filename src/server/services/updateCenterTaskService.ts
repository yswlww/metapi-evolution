import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { loadUpdateCenterConfig } from './updateCenterConfigService.js';
import { UPDATE_CENTER_DEPLOY_TASK_TYPE } from './updateCenterTaskConstants.js';
import { getCurrentRuntimeVersion, type UpdateCenterVersionSource } from './updateCenterVersionService.js';
import { getSelfUpgradeSupportForRuntime, normalizeBundleVersion, performLocalUpgrade, rollbackToPrevious } from './updateCenterLocalService.js';
import {
  atomicWriteJson, readLocalUpdateTask, resolveLocalUpdatePaths,
  writeLocalUpdateTask, type LocalUpdateTask,
} from '../../shared/localUpdateRuntime.js';

export class LocalUpdateRequestError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

const paths = () => resolveLocalUpdatePaths(config.dataDir);
let pendingTask: LocalUpdateTask | null = null;

export async function getLocalUpdateTask(id: string): Promise<LocalUpdateTask | null> {
  return readLocalUpdateTask(paths(), id);
}
export async function getLatestLocalUpdateTask(): Promise<LocalUpdateTask | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(paths().runtimeRoot, 'latest-task.json'), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { id?: unknown }).id !== 'string') return null;
    return await getLocalUpdateTask((parsed as { id: string }).id);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

async function appendLog(task: LocalUpdateTask, message: string) {
  task.logs.push({ seq: (task.logs.at(-1)?.seq || 0) + 1, message, createdAt: new Date().toISOString() });
  task.logs = task.logs.slice(-200);
  task.updatedAt = new Date().toISOString();
  await writeLocalUpdateTask(paths(), task);
}

function requestActivation(taskId: string) {
  if (!process.send || !process.connected) throw new Error('Runtime supervisor disconnected before activation');
  process.send({ type: 'metapi:activate', taskId });
}

export async function startLocalUpdateTask(input: {
  operation: 'deploy' | 'rollback'; source?: UpdateCenterVersionSource;
  targetTag?: string; targetVersion?: string; targetDigest?: string;
}): Promise<{ success: true; reused: boolean; task: LocalUpdateTask }> {
  const stored = await loadUpdateCenterConfig();
  if (!stored.enabled) throw new LocalUpdateRequestError('update center is disabled');
  const support = await getSelfUpgradeSupportForRuntime(config.dataDir);
  if (!support.supported) throw new LocalUpdateRequestError(support.reason || 'Unsupported runtime');
  let version = '';
  const tag = String(input.targetTag || input.targetVersion || '').trim();
  if (input.operation === 'deploy') {
    if (!tag) throw new LocalUpdateRequestError('targetTag is required');
    try { version = normalizeBundleVersion(tag); }
    catch (error) { throw new LocalUpdateRequestError((error as Error).message); }
    if (version === getCurrentRuntimeVersion()) throw new LocalUpdateRequestError('target version is already running', 409);
  }
  const latestTask = await getLatestLocalUpdateTask();
  const existing = pendingTask || latestTask;
  if (existing && (existing.status === 'pending' || existing.status === 'running')) return { success: true, reused: true, task: existing };
  const task: LocalUpdateTask = {
    id: randomUUID(), type: UPDATE_CENTER_DEPLOY_TASK_TYPE, title: input.operation === 'deploy' ? 'Runtime upgrade' : 'Runtime rollback',
    status: 'running', message: 'Preparing runtime update', error: null, result: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, logs: [],
  };
  pendingTask = task;
  try {
    await writeLocalUpdateTask(paths(), task);
    await atomicWriteJson(join(paths().runtimeRoot, 'latest-task.json'), { id: task.id });
  } catch (error) { pendingTask = null; throw error; }
  // Let Fastify send the accepted response before an exceptionally fast
  // download or rollback can request a supervisor restart.
  setImmediate(() => {
    void (async () => {
      try {
        const source = input.source || stored.defaultDeploySource;
        if (input.operation === 'deploy') {
          const result = await performLocalUpgrade({
            dataDir: config.dataDir, taskId: task.id, source,
            candidate: { source, rawVersion: tag, normalizedVersion: version, tagName: tag, url: null },
            log: message => appendLog(task, message),
          });
          if (!result.success) throw new Error(result.state.error || 'Local upgrade failed');
        } else {
          await rollbackToPrevious(paths(), task.id);
        }
        task.message = 'Activating release; waiting for supervisor health confirmation';
        await appendLog(task, task.message);
        requestActivation(task.id);
        // Only the supervisor may finish this task after the new process is
        // healthy. A successful download/symlink is not a successful upgrade.
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
        task.message = task.error;
        task.finishedAt = new Date().toISOString();
        await appendLog(task, task.error);
      } finally { pendingTask = null; }
    })();
  });
  return { success: true, reused: false, task };
}
