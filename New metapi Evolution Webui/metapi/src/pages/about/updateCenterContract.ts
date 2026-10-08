export type UpdateSource = 'github-release' | 'docker-hub-tag';
export type UpdateConfig = {enabled: boolean; helperBaseUrl: string; namespace: string; releaseName: string; chartRef: string; imageRepository: string; githubReleasesEnabled: boolean; dockerHubTagsEnabled: boolean; defaultDeploySource: UpdateSource};
export type UpdateCandidate = {tagName?: string; displayVersion?: string; normalizedVersion?: string; digest?: string | null; url?: string | null; publishedAt?: string | null};
export type UpdateHistory = {revision?: string; updatedAt?: string | null; status?: string | null; description?: string | null; imageTag?: string | null; imageRepository?: string | null; imageDigest?: string | null};
export type UpdateStatus = {currentVersion?: string; config?: UpdateConfig; githubRelease?: UpdateCandidate | null; dockerHubTag?: UpdateCandidate | null; dockerHubRecentTags?: UpdateCandidate[] | null; helper?: {ok?: boolean; healthy?: boolean; error?: string | null; revision?: string | null; imageTag?: string | null; imageDigest?: string | null; history?: UpdateHistory[]}; runningTask?: {id?: string; status?: string} | null; lastFinishedTask?: {id?: string; status?: string} | null; runtime?: {lastCheckError?: string | null; lastCheckedAt?: string | null}};
export function deployPayload(source: UpdateSource, candidate: UpdateCandidate) {
  const targetTag = candidate.tagName?.trim();
  if (!targetTag) throw new Error('No deployable tag');
  return {source, targetTag, ...(candidate.digest ? {targetDigest: candidate.digest} : {})};
}
export function rollbackPayload(status: UpdateStatus, revision: string) {
  if (!revision || revision === status.helper?.revision || !status.helper?.history?.some(entry => entry.revision === revision)) throw new Error('Select a historical revision');
  return {targetRevision: revision};
}
