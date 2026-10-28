import { FastifyInstance } from 'fastify';
import { config as runtimeConfig } from '../../config.js';

import {
  appendBackgroundTaskLog,
  getBackgroundTask,
  startBackgroundTask,
  subscribeToBackgroundTaskLogs,
} from '../../services/backgroundTaskService.js';
import { type UpdateCenterVersionSource } from '../../services/updateCenterVersionService.js';
import {
  loadUpdateCenterConfig,
  normalizeUpdateCenterConfig,
  saveUpdateCenterConfig,
  type UpdateCenterConfig,
} from '../../services/updateCenterConfigService.js';
import {
  performLocalUpgrade,
  readCurrentVersion,
  readUpdateState,
  resolveLocalUpdatePaths,
  rollbackToPrevious,
} from '../../services/updateCenterLocalService.js';
import { resolveSelfUpgradeSupport } from '../../../shared/localUpdateContract.js';
import {
  getUpdateCenterStatus,
  refreshUpdateCenterStatusCache,
} from '../../services/updateCenterStatusService.js';
import {
  UPDATE_CENTER_DEPLOY_DEDUPE_KEY,
  UPDATE_CENTER_DEPLOY_TASK_TYPE,
} from '../../services/updateCenterTaskConstants.js';
import {
  parseUpdateCenterConfigPayload,
  parseUpdateCenterDeployPayload,
  parseUpdateCenterRollbackPayload,
} from '../../contracts/supportRoutePayloads.js';

type DeployBody = {
  source?: UpdateCenterVersionSource;
  targetVersion?: string;
  targetTag?: string;
  targetDigest?: string;
};

type RollbackBody = {
  targetRevision?: string;
};

function summarizeError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'unknown error');
}

function assertUpgradable(config: UpdateCenterConfig) {
  if (!config.enabled) throw new Error('update center is disabled');
  const support = resolveSelfUpgradeSupport();
  if (!support.supported) {
    throw new Error(support.reason || 'self-upgrade is not supported on this runtime');
  }
}

function writeSseEvent(reply: { raw: NodeJS.WritableStream & { write: (chunk: string) => void } }, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function updateCenterRoutes(app: FastifyInstance) {
  app.get('/api/update-center/status', async () => {
    return await getUpdateCenterStatus();
  });

  app.post('/api/update-center/check', async () => {
    return (await refreshUpdateCenterStatusCache()).status;
  });

  app.put<{ Body: unknown }>('/api/update-center/config', async (request, reply) => {
    const parsedBody = parseUpdateCenterConfigPayload(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, message: parsedBody.error });
    }

    const next = normalizeUpdateCenterConfig(parsedBody.data || {});
    const saved = await saveUpdateCenterConfig(next);
    return {
      success: true,
      config: saved,
    };
  });

  app.post<{ Body: unknown }>('/api/update-center/deploy', async (request, reply) => {
    const parsedBody = parseUpdateCenterDeployPayload(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, message: parsedBody.error });
    }

    const body = parsedBody.data;
    const config = await loadUpdateCenterConfig();
    try {
      assertUpgradable(config);
    } catch (error) {
      return reply.code(400).send({ success: false, message: summarizeError(error) });
    }

    const source = body.source === 'docker-hub-tag'
      ? 'docker-hub-tag'
      : body.source === 'github-release'
        ? 'github-release'
        : config.defaultDeploySource;
    const targetTag = String(body.targetTag || body.targetVersion || '').trim();
    if (!targetTag) {
      return reply.code(400).send({ success: false, message: 'targetTag is required' });
    }

    const paths = resolveLocalUpdatePaths(runtimeConfig.dataDir);
    const runningVersion = await readCurrentVersion(paths.currentLink);
    if (runningVersion && runningVersion === targetTag.replace(/^v/, '')) {
      return reply.code(409).send({ success: false, message: 'target version is already running' });
    }

    let taskId = '';
    const { task, reused } = startBackgroundTask(
      {
        type: UPDATE_CENTER_DEPLOY_TASK_TYPE,
        title: '更新中心部署',
        dedupeKey: UPDATE_CENTER_DEPLOY_DEDUPE_KEY,
        successTitle: '更新中心部署已完成',
        failureTitle: '更新中心部署失败',
      },
      async () => {
        await Promise.resolve();
        appendBackgroundTaskLog(taskId, `Resolving target version: ${targetTag}`);

        const result = await performLocalUpgrade({
          dataDir: runtimeConfig.dataDir,
          candidate: {
            source,
            rawVersion: targetTag,
            normalizedVersion: targetTag.replace(/^v/, ''),
            url: null,
            tagName: targetTag,
            digest: body.targetDigest || null,
          },
          source,
          log: (message) => appendBackgroundTaskLog(taskId, message),
        });

        if (!result.success) {
          throw new Error(result.state.error || 'local upgrade failed');
        }
        appendBackgroundTaskLog(taskId, `Switched to ${result.version}; restart required to activate`);
        return result;
      },
    );
    taskId = task.id;

    return reply.code(202).send({ success: true, reused, task });
  });

  app.post<{ Body: unknown }>('/api/update-center/rollback', async (request, reply) => {
    const parsedBody = parseUpdateCenterRollbackPayload(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, message: parsedBody.error });
    }

    const config = await loadUpdateCenterConfig();
    try {
      assertUpgradable(config);
    } catch (error) {
      return reply.code(400).send({ success: false, message: summarizeError(error) });
    }

    const paths = resolveLocalUpdatePaths(runtimeConfig.dataDir);
    const state = await readUpdateState(paths);

    let taskId = '';
    const { task, reused } = startBackgroundTask(
      {
        type: UPDATE_CENTER_DEPLOY_TASK_TYPE,
        title: '更新中心回退',
        dedupeKey: UPDATE_CENTER_DEPLOY_DEDUPE_KEY,
        successTitle: '更新中心回退已完成',
        failureTitle: '更新中心回退失败',
      },
      async () => {
        await Promise.resolve();
        appendBackgroundTaskLog(taskId, `Rolling back from ${state.targetVersion || 'current'}`);
        const target = await rollbackToPrevious(paths);
        appendBackgroundTaskLog(taskId, `Rolled back to ${target}; restart required to activate`);
        return { success: true, target };
      },
    );
    taskId = task.id;

    return reply.code(202).send({ success: true, reused, task });
  });

  app.get<{ Params: { id: string } }>('/api/update-center/tasks/:id/stream', async (request, reply) => {
    const taskId = String(request.params.id || '').trim();
    const task = getBackgroundTask(taskId);
    if (!task) {
      return reply.code(404).send({
        success: false,
        message: 'task not found',
      });
    }

    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');

    const writeDone = () => {
      const latest = getBackgroundTask(taskId);
      writeSseEvent(reply, 'done', {
        status: latest?.status || 'unknown',
      });
      reply.raw.end();
    };

    for (const entry of task.logs) {
      writeSseEvent(reply, 'log', entry);
    }

    if (task.status !== 'pending' && task.status !== 'running') {
      writeDone();
      return;
    }

    const unsubscribe = subscribeToBackgroundTaskLogs(taskId, (entry) => {
      writeSseEvent(reply, 'log', entry);
    });

    const interval = setInterval(() => {
      const latest = getBackgroundTask(taskId);
      if (!latest) {
        clearInterval(interval);
        unsubscribe();
        writeDone();
        return;
      }
      if (latest.status !== 'pending' && latest.status !== 'running') {
        clearInterval(interval);
        unsubscribe();
        writeDone();
      }
    }, 25);
    interval.unref?.();

    request.raw.on('close', () => {
      clearInterval(interval);
      unsubscribe();
    });
  });
}
