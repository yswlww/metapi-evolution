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
export type SelfUpgrade = { supported: boolean; reason: string | null; arch: string };
export type UpdateStatus = {
  currentVersion?: string;
  config?: UpdateConfig;
  githubRelease?: UpdateCandidate | null;
  dockerHubTag?: UpdateCandidate | null;
  dockerHubRecentTags?: UpdateCandidate[] | null;
  selfUpgrade?: SelfUpgrade;
  runningTask?: { id?: string; status?: string } | null;
  lastFinishedTask?: { id?: string; status?: string } | null;
  runtime?: { lastCheckError?: string | null; lastCheckedAt?: string | null };
};

export function deployPayload(source: UpdateSource, candidate: UpdateCandidate) {
  const targetTag = candidate.tagName?.trim();
  if (!targetTag) throw new Error('No deployable tag');
  return { source, targetTag, ...(candidate.digest ? { targetDigest: candidate.digest } : {}) };
}

export function canRollback(status: UpdateStatus): boolean {
  return status.selfUpgrade?.supported === true && status.config?.enabled === true;
}
