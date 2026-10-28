import type { SelfUpgradeSupport, UpdateState } from '../../../../../src/shared/localUpdateContract.js';
import { isLocalUpdateReleaseTag } from '../../../../../src/shared/localUpdateContract.js';

export type UpdateSource = 'github-release' | 'docker-hub-tag';
export type UpdateConfig = {
  enabled: boolean;
  githubReleasesEnabled: boolean;
  dockerHubTagsEnabled: boolean;
  defaultDeploySource: UpdateSource;
};
export type UpdateCandidate = {
  tagName?: string;
  displayVersion?: string;
  normalizedVersion?: string;
  digest?: string | null;
  url?: string | null;
  publishedAt?: string | null;
};
export type SelfUpgrade = SelfUpgradeSupport;
export type UpdateStatus = {
  currentVersion?: string;
  config?: UpdateConfig;
  githubRelease?: UpdateCandidate | null;
  dockerHubTag?: UpdateCandidate | null;
  dockerHubRecentTags?: UpdateCandidate[] | null;
  selfUpgrade?: SelfUpgrade;
  localUpdate?: { state: UpdateState; previousVersion: string | null; canRollback: boolean };
  runningTask?: { id?: string; status?: string } | null;
  lastFinishedTask?: { id?: string; status?: string } | null;
  runtime?: { lastCheckError?: string | null; lastCheckedAt?: string | null };
};

export function deployPayload(source: UpdateSource, candidate: UpdateCandidate) {
  const targetTag = candidate.tagName?.trim();
  if (!targetTag || !isLocalUpdateReleaseTag(targetTag)) throw new Error('No deployable release tag');
  return { source, targetTag, ...(candidate.digest ? { targetDigest: candidate.digest } : {}) };
}

export function canRollback(status: UpdateStatus): boolean {
  return status.selfUpgrade?.supported === true && status.config?.enabled === true && status.localUpdate?.canRollback === true;
}
