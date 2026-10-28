import { config as runtimeConfig } from '../config.js';
import { formatUtcSqlDateTime } from './localTimeService.js';
import { listBackgroundTasks } from './backgroundTaskService.js';
import {
  fetchDockerHubTagCandidates,
  fetchLatestStableGitHubRelease,
  getCurrentRuntimeVersion,
  type UpdateCenterVersionCandidate,
} from './updateCenterVersionService.js';
import {
  type UpdateCenterConfig,
  loadUpdateCenterConfig,
} from './updateCenterConfigService.js';
import {
  loadUpdateCenterRuntimeState,
  saveUpdateCenterRuntimeState,
  type UpdateCenterHelperStatus,
  type UpdateCenterRuntimeState,
  type UpdateCenterStatusSnapshot,
} from './updateCenterRuntimeStateService.js';
import { UPDATE_CENTER_DEPLOY_TASK_TYPE } from './updateCenterTaskConstants.js';
import { resolveUpdateReminderCandidate, type UpdateReminderCandidate } from './updateCenterReminderService.js';

function summarizeError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'unknown error');
}

async function settleOptional<T>(enabled: boolean, loader: () => Promise<T>): Promise<{
  value: T | null;
  error: string | null;
}> {
  if (!enabled) {
    return {
      value: null,
      error: null,
    };
  }

  try {
    return {
      value: await loader(),
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: summarizeError(error),
    };
  }
}

function getDeployTasks() {
  return listBackgroundTasks(50).filter((task) => task.type === UPDATE_CENTER_DEPLOY_TASK_TYPE);
}

export type UpdateCenterStatusResult = {
  currentVersion: string;
  config: UpdateCenterConfig;
  githubRelease: UpdateCenterVersionCandidate | null;
  dockerHubTag: UpdateCenterVersionCandidate | null;
  dockerHubRecentTags: UpdateCenterVersionCandidate[];
  helper: UpdateCenterHelperStatus;
  runningTask: ReturnType<typeof getDeployTasks>[number] | null;
  lastFinishedTask: ReturnType<typeof getDeployTasks>[number] | null;
  runtime: UpdateCenterRuntimeState;
};

function buildUnavailableHelperStatus(error: string | null = null): UpdateCenterHelperStatus {
  return {
    ok: false,
    releaseName: null,
    namespace: null,
    revision: null,
    imageRepository: null,
    imageTag: null,
    imageDigest: null,
    healthy: false,
    error: error || undefined,
    history: [],
  };
}

function buildStatusSnapshot(status: Pick<UpdateCenterStatusResult, 'githubRelease' | 'dockerHubTag' | 'dockerHubRecentTags' | 'helper'>): UpdateCenterStatusSnapshot {
  return {
    githubRelease: status.githubRelease || null,
    dockerHubTag: status.dockerHubTag || null,
    dockerHubRecentTags: status.dockerHubRecentTags || [],
    helper: status.helper || null,
  };
}

function buildNextRuntimeState(
  status: Pick<UpdateCenterStatusResult, 'currentVersion' | 'githubRelease' | 'dockerHubTag' | 'dockerHubRecentTags' | 'helper'>,
  previousRuntime: UpdateCenterRuntimeState,
  checkedAt: string,
): { candidate: UpdateReminderCandidate | null; nextRuntime: UpdateCenterRuntimeState } {
  const candidate = resolveUpdateReminderCandidate({
    currentVersion: status.currentVersion,
    helper: status.helper,
    githubRelease: status.githubRelease,
    dockerHubTag: status.dockerHubTag,
  });

  return {
    candidate,
    nextRuntime: {
      ...previousRuntime,
      lastCheckedAt: checkedAt,
      lastCheckError: null,
      lastResolvedSource: candidate?.source || null,
      lastResolvedDisplayVersion: candidate?.displayVersion || null,
      lastResolvedCandidateKey: candidate?.candidateKey || null,
      statusSnapshot: buildStatusSnapshot(status),
    },
  };
}

function buildResponseFromState(config: UpdateCenterConfig, runtime: UpdateCenterRuntimeState): UpdateCenterStatusResult {
  const snapshot = runtime.statusSnapshot;
  const tasks = getDeployTasks();
  const runningTask = tasks.find((task) => task.status === 'pending' || task.status === 'running') || null;
  const lastFinishedTask = tasks.find((task) => task.status === 'succeeded' || task.status === 'failed') || null;

  return {
    currentVersion: getCurrentRuntimeVersion(),
    config,
    githubRelease: snapshot?.githubRelease || null,
    dockerHubTag: snapshot?.dockerHubTag || null,
    dockerHubRecentTags: snapshot?.dockerHubRecentTags || [],
    helper: snapshot?.helper || buildUnavailableHelperStatus(runtime.lastCheckError),
    runningTask,
    lastFinishedTask,
    runtime,
  };
}

export async function buildUpdateCenterStatus(): Promise<UpdateCenterStatusResult> {
  const config = await loadUpdateCenterConfig();

  const [githubLookup, dockerLookup, runtime] = await Promise.all([
    settleOptional(config.githubReleasesEnabled, async () => await fetchLatestStableGitHubRelease()),
    settleOptional(config.dockerHubTagsEnabled, async () => await fetchDockerHubTagCandidates()),
    loadUpdateCenterRuntimeState(),
  ]);

  const githubRelease = githubLookup.value;
  const dockerHubCandidates = dockerLookup.value;
  const dockerHubTag = dockerHubCandidates?.primary || null;
  const dockerHubRecentTags = dockerHubCandidates?.recentNonStable || [];
  const helper = buildUnavailableHelperStatus(null);

  const tasks = getDeployTasks();
  const runningTask = tasks.find((task) => task.status === 'pending' || task.status === 'running') || null;
  const lastFinishedTask = tasks.find((task) => task.status === 'succeeded' || task.status === 'failed') || null;

  return {
    currentVersion: getCurrentRuntimeVersion(),
    config,
    githubRelease,
    dockerHubTag,
    dockerHubRecentTags,
    helper,
    runningTask,
    lastFinishedTask,
    runtime,
  };
}

export async function buildCachedUpdateCenterStatus(): Promise<UpdateCenterStatusResult> {
  const [config, runtime] = await Promise.all([
    loadUpdateCenterConfig(),
    loadUpdateCenterRuntimeState(),
  ]);
  return buildResponseFromState(config, runtime);
}

export async function refreshUpdateCenterStatusCache(checkedAt = formatUtcSqlDateTime(new Date())): Promise<{
  status: UpdateCenterStatusResult;
  candidate: UpdateReminderCandidate | null;
  previousRuntime: UpdateCenterRuntimeState;
  runtime: UpdateCenterRuntimeState;
}> {
  const status = await buildUpdateCenterStatus();
  const previousRuntime = status.runtime || await loadUpdateCenterRuntimeState();
  const { candidate, nextRuntime } = buildNextRuntimeState(status, previousRuntime, checkedAt);
  const runtime = await saveUpdateCenterRuntimeState(nextRuntime);
  return {
    status: {
      ...status,
      runtime,
    },
    candidate,
    previousRuntime,
    runtime,
  };
}

export async function getUpdateCenterStatus(): Promise<UpdateCenterStatusResult> {
  const cached = await buildCachedUpdateCenterStatus();
  if (cached.runtime.statusSnapshot) {
    return cached;
  }
  return (await refreshUpdateCenterStatusCache()).status;
}
