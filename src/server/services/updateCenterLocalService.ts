/**
 * Local (in-container) runtime upgrade orchestration for #622.
 *
 * Replaces the "ask a Kubernetes helper to run `helm upgrade`" chain with:
 * resolve -> download -> verify -> stage -> switch. The switch is a symlink
 * rename, so it is atomic; the *health* of the new version is proven later by
 * the runner on next boot (see Phase 2), which is also where rollback lives.
 *
 * Everything mutates under `<DATA_DIR>/runtime`:
 *   releases/<version>/        immutable unpacked bundle
 *   releases/<version>.staging scratch, swept on boot
 *   current -> releases/<v>    the only mutable pointer
 *   previous -> releases/<v>   rollback target
 *   update-state.json          in-flight attempt, survives process restart
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
  access,
  constants as fsConstants,
} from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fetch } from 'undici';

import {
  createUpdateState,
  isActiveUpdatePhase,
  resolveSelfUpgradeSupport,
  UPDATE_STATE_FILENAME,
  type SelfUpgradeSupport,
  type UpdateSourceKind,
  type UpdateState,
} from '../../shared/localUpdateContract.js';
import type { UpdateCenterVersionCandidate } from './updateCenterVersionService.js';

const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
const CHECKSUM_FILENAME = 'checksums.txt';
const STAGING_SUFFIX = '.staging';

export type LocalUpdatePaths = {
  runtimeRoot: string;
  releasesDir: string;
  currentLink: string;
  previousLink: string;
  statePath: string;
};

export type LocalUpdateLog = (message: string) => void;

export type LocalUpdateStaged = {
  version: string;
  releaseDir: string;
  sha256: string;
  bundleUrl: string;
};

export function resolveLocalUpdatePaths(dataDir: string): LocalUpdatePaths {
  const runtimeRoot = join(dataDir, 'runtime');
  return {
    runtimeRoot,
    releasesDir: join(runtimeRoot, 'releases'),
    currentLink: join(runtimeRoot, 'current'),
    previousLink: join(runtimeRoot, 'previous'),
    statePath: join(runtimeRoot, UPDATE_STATE_FILENAME),
  };
}

/** Map a Node `process.arch` to the arch token used in release artifact names. */
export function toBundleArchToken(arch: string): string {
  if (arch === 'x64') return 'amd64';
  if (arch === 'arm64') return 'arm64';
  return arch;
}

export function buildBundleFilename(version: string, arch: string): string {
  return `metapi-evolution-${version}-${toBundleArchToken(arch)}.tar.gz`;
}

/**
 * Parse a `checksums.txt` payload (the `sha256sum` format) into a filename map.
 * Lines that do not carry a 64-hex digest are ignored rather than trusted.
 */
export function parseChecksums(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) continue;
    result.set(match[2].trim(), match[1].toLowerCase());
  }
  return result;
}

/**
 * Verify a downloaded bundle before it is allowed anywhere near `current`.
 *
 * Every rejection returns a reason instead of throwing so the caller can log
 * and report it through the task stream; a silent continue here is how a
 * corrupt bundle becomes a dead container.
 */
export function verifyBundle(input: {
  actualSha256: string;
  expectedSha256: string | null | undefined;
  filename: string;
  checksums: Map<string, string>;
  expectedArch: string;
  actualArch: string;
}): { ok: true } | { ok: false; reason: string } {
  const expectedFromFile = input.expectedSha256 || input.checksums.get(input.filename);
  if (!expectedFromFile) {
    return { ok: false, reason: `no checksum published for ${input.filename}` };
  }
  const normalizedExpected = String(expectedFromFile).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpected)) {
    return { ok: false, reason: `malformed checksum for ${input.filename}` };
  }
  if (normalizedExpected !== String(input.actualSha256).trim().toLowerCase()) {
    return { ok: false, reason: `checksum mismatch for ${input.filename}` };
  }
  if (input.expectedArch !== input.actualArch) {
    return {
      ok: false,
      reason: `bundle arch ${input.expectedArch} does not match runtime arch ${input.actualArch}`,
    };
  }
  return { ok: true };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function readCurrentVersion(linkPath: string): Promise<string | null> {
  try {
    const target = await readlink(linkPath);
    const base = target.split(/[\\/]/).filter(Boolean).pop();
    return base || null;
  } catch {
    return null;
  }
}

async function readSymlinkIfPresent(linkPath: string): Promise<string | null> {
  try {
    const target = await readlink(linkPath);
    return target || null;
  } catch {
    return null;
  }
}

export async function readUpdateState(paths: LocalUpdatePaths): Promise<UpdateState> {
  try {
    const raw = await readFile(paths.statePath, 'utf8');
    return createUpdateState(JSON.parse(raw) as Partial<UpdateState>);
  } catch {
    return createUpdateState();
  }
}

export async function writeUpdateState(paths: LocalUpdatePaths, state: UpdateState): Promise<UpdateState> {
  const next = createUpdateState({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  await mkdir(paths.runtimeRoot, { recursive: true });
  await writeFile(paths.statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/** Remove partial `.staging` trees left behind by an interrupted extraction. */
export async function sweepStagingDirs(paths: LocalUpdatePaths): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(paths.releasesDir);
  } catch {
    return removed;
  }
  for (const entry of entries) {
    if (!entry.endsWith(STAGING_SUFFIX)) continue;
    await rm(join(paths.releasesDir, entry), { recursive: true, force: true });
    removed.push(entry);
  }
  return removed;
}

async function downloadToFile(
  url: string,
  destination: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sha256: string; bytes: number }> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'metapi-update-center/1.0' },
    });
    if (!response.ok || !response.body) {
      throw new Error(`bundle download failed with HTTP ${response.status}`);
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BUNDLE_BYTES) {
      throw new Error('bundle exceeds the maximum allowed size');
    }

    const hash = createHash('sha256');
    let bytes = 0;
    const source = Readable.fromWeb(response.body as never);
    source.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BUNDLE_BYTES) controller.abort();
      hash.update(chunk);
    });

    await pipeline(source, createWriteStream(destination));
    return { sha256: hash.digest('hex'), bytes };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('bundle download timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/** Point a symlink at a target atomically (write temp, then rename over). */
export async function switchSymlink(linkPath: string, targetRelativeOrAbsolute: string): Promise<void> {
  const temporary = `${linkPath}.tmp`;
  await rm(temporary, { force: true });
  await symlink(targetRelativeOrAbsolute, temporary);
  await rename(temporary, linkPath);
}

export type StageBundleOptions = {
  dataDir: string;
  candidate: UpdateCenterVersionCandidate;
  arch?: string;
  log?: LocalUpdateLog;
  fetchImpl?: typeof fetch;
};

/**
 * Download, verify and unpack a release bundle into `releases/<version>`.
 * Does NOT switch `current` — that is a separate, explicit step so the staged
 * tree can be inspected (and the previous release kept) if anything fails.
 */
export async function stageBundle(options: StageBundleOptions): Promise<LocalUpdateStaged> {
  const log = options.log ?? (() => {});
  const arch = options.arch ?? process.arch;
  const paths = resolveLocalUpdatePaths(options.dataDir);
  const version = String(options.candidate.normalizedVersion || '').trim();
  if (!version) {
    throw new Error('candidate has no normalized version');
  }

  const bundleFilename = buildBundleFilename(version, arch);
  const bundleUrl = resolveBundleUrl(options.candidate, bundleFilename);
  const checksumUrl = resolveChecksumUrl(options.candidate);

  await mkdir(paths.releasesDir, { recursive: true });
  const stagingDir = join(paths.releasesDir, `${version}${STAGING_SUFFIX}`);
  const releaseDir = join(paths.releasesDir, version);
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  const bundlePath = join(paths.runtimeRoot, bundleFilename);
  log(`Downloading ${bundleFilename}`);
  const downloaded = await downloadToFile(bundleUrl, bundlePath, options.fetchImpl ?? fetch);
  log(`Downloaded ${downloaded.bytes} bytes, sha256 ${downloaded.sha256}`);

  log(`Fetching ${CHECKSUM_FILENAME}`);
  let checksums = new Map<string, string>();
  try {
    const checksumResponse = await (options.fetchImpl ?? fetch)(checksumUrl, {
      headers: { 'user-agent': 'metapi-update-center/1.0' },
    });
    if (checksumResponse.ok) {
      checksums = parseChecksums(await checksumResponse.text());
    } else {
      log(`Checksum file unavailable (HTTP ${checksumResponse.status}); requiring a published digest`);
    }
  } catch {
    log('Checksum file unavailable; requiring a published digest');
  }

  const verdict = verifyBundle({
    actualSha256: downloaded.sha256,
    expectedSha256: options.candidate.digest ?? null,
    filename: bundleFilename,
    checksums,
    expectedArch: arch,
    actualArch: arch,
  });
  if (!verdict.ok) {
    await rm(stagingDir, { recursive: true, force: true });
    await rm(bundlePath, { force: true });
    throw new Error(verdict.reason);
  }
  log('Checksum verified');

  log(`Extracting into releases/${version}${STAGING_SUFFIX}`);
  await extractTarGz(bundlePath, stagingDir);
  await rm(releaseDir, { recursive: true, force: true });
  await rename(stagingDir, releaseDir);
  await rm(bundlePath, { force: true });

  return { version, releaseDir, sha256: downloaded.sha256, bundleUrl };
}

function resolveBundleUrl(candidate: UpdateCenterVersionCandidate, bundleFilename: string): string {
  const explicit = (candidate as { bundleUrl?: string | null }).bundleUrl;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const tag = String(candidate.tagName || candidate.normalizedVersion || '').trim();
  return `https://github.com/yswlww/metapi-evolution/releases/download/${tag}/${bundleFilename}`;
}

function resolveChecksumUrl(candidate: UpdateCenterVersionCandidate): string {
  const tag = String(candidate.tagName || candidate.normalizedVersion || '').trim();
  return `https://github.com/yswlww/metapi-evolution/releases/download/${tag}/${CHECKSUM_FILENAME}`;
}

async function extractTarGz(archivePath: string, destination: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destination], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`bundle extraction failed (exit ${code ?? 'null'})`));
    });
  });
}

export type PerformLocalUpgradeOptions = {
  dataDir: string;
  candidate: UpdateCenterVersionCandidate;
  source: UpdateSourceKind;
  arch?: string;
  platform?: string;
  log?: LocalUpdateLog;
  fetchImpl?: typeof fetch;
};

export type PerformLocalUpgradeResult = {
  success: boolean;
  version: string;
  requiresRestart: boolean;
  previousVersion: string | null;
  state: UpdateState;
};

/**
 * Full local upgrade: stage the bundle, then flip `current` and record the
 * attempt. Returns `requiresRestart: true` on success — the caller is
 * responsible for actually restarting, so this function stays testable.
 */
export async function performLocalUpgrade(
  options: PerformLocalUpgradeOptions,
): Promise<PerformLocalUpgradeResult> {
  const log = options.log ?? (() => {});
  const arch = options.arch ?? process.arch;
  const platform = options.platform ?? process.platform;
  const paths = resolveLocalUpdatePaths(options.dataDir);

  const support = resolveSelfUpgradeSupport({ arch, platform, dataDirWritable: true });
  if (!support.supported) {
    throw new Error(support.reason || 'self-upgrade is not supported on this runtime');
  }

  const existing = await readUpdateState(paths);
  if (isActiveUpdatePhase(existing.phase)) {
    throw new Error(`an upgrade is already in progress (phase: ${existing.phase})`);
  }

  const previousVersion = await readCurrentVersion(paths.currentLink);

  await writeUpdateState(paths, {
    ...existing,
    phase: 'downloading',
    targetVersion: options.candidate.normalizedVersion,
    previousVersion,
    source: options.source,
    startedAt: new Date().toISOString(),
    error: null,
  });

  try {
    const staged = await stageBundle({
      dataDir: options.dataDir,
      candidate: options.candidate,
      arch,
      log,
      fetchImpl: options.fetchImpl,
    });

    await writeUpdateState(paths, {
      ...(await readUpdateState(paths)),
      phase: 'switching',
      attempts: (existing.attempts ?? 0) + 1,
    });

    const previousTarget = await readSymlinkIfPresent(paths.currentLink);
    if (previousTarget) {
      await switchSymlink(paths.previousLink, previousTarget);
    }
    await switchSymlink(paths.currentLink, join('releases', staged.version));
    log(`Switched current -> releases/${staged.version}`);

    const state = await writeUpdateState(paths, {
      ...(await readUpdateState(paths)),
      phase: 'health-checking',
    });

    return {
      success: true,
      version: staged.version,
      requiresRestart: true,
      previousVersion,
      state,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const state = await writeUpdateState(paths, {
      ...(await readUpdateState(paths)),
      phase: 'failed',
      error: message,
    });
    log(`Upgrade failed: ${message}`);
    return { success: false, version: options.candidate.normalizedVersion, requiresRestart: false, previousVersion, state };
  }
}

/** Revert `current` to `previous`; used by the runner after a failed health check. */
export async function rollbackToPrevious(paths: LocalUpdatePaths): Promise<string> {
  const previousTarget = await readSymlinkIfPresent(paths.previousLink);
  if (!previousTarget) {
    throw new Error('no previous release to roll back to');
  }
  await switchSymlink(paths.currentLink, previousTarget);
  return previousTarget;
}

export async function getSelfUpgradeSupportForRuntime(dataDir: string): Promise<SelfUpgradeSupport> {
  let dataDirWritable = true;
  try {
    await mkdir(dataDir, { recursive: true });
    await access(dataDir, fsConstants.W_OK);
  } catch {
    dataDirWritable = false;
  }
  return resolveSelfUpgradeSupport({ arch: process.arch, platform: process.platform, dataDirWritable });
}

export { pathExists, readCurrentVersion, readSymlinkIfPresent };
