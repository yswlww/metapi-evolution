import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, constants, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fetch } from 'undici';
import * as tar from 'tar';
import { createUpdateState, isActiveUpdatePhase, normalizeLocalUpdateVersion, localUpdateBundleFilename, toLocalBundleArch, resolveSelfUpgradeSupport, type SelfUpgradeSupport, type UpdateSourceKind, type UpdateState } from '../../shared/localUpdateContract.js';
import {
  readCurrentVersion, readSymlinkIfPresent, readUpdateState, resolveLocalUpdatePaths,
  resolveRelease, sweepStagingDirs, switchSymlink, writeUpdateState, type LocalUpdatePaths,
} from '../../shared/localUpdateRuntime.js';
import type { UpdateCenterVersionCandidate } from './updateCenterVersionService.js';

export { readCurrentVersion, readSymlinkIfPresent, readUpdateState, resolveLocalUpdatePaths, sweepStagingDirs, switchSymlink, writeUpdateState };
export type { LocalUpdatePaths };
export type LocalUpdateLog = (message: string) => void | Promise<void>;
const execFileAsync = promisify(execFile);
const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
const CHECKSUM_FILENAME = 'checksums.txt';

export const normalizeBundleVersion = normalizeLocalUpdateVersion;
export const toBundleArchToken = toLocalBundleArch;
export const buildBundleFilename = localUpdateBundleFilename;
export function parseChecksums(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/i);
    if (!match) continue;
    if (result.has(match[2])) throw new Error(`Duplicate checksum for ${match[2]}`);
    result.set(match[2], match[1].toLowerCase());
  }
  return result;
}
export function verifyBundle(input: {
  actualSha256: string; expectedSha256?: string | null; filename: string;
  checksums: Map<string, string>; expectedArch: string; actualArch: string;
}): { ok: true } | { ok: false; reason: string } {
  const expected = input.expectedSha256 || input.checksums.get(input.filename);
  if (!expected) return { ok: false, reason: `no checksum published for ${input.filename}` };
  if (!/^[a-f0-9]{64}$/i.test(expected)) return { ok: false, reason: `malformed checksum for ${input.filename}` };
  if (expected.toLowerCase() !== input.actualSha256.toLowerCase()) return { ok: false, reason: `checksum mismatch for ${input.filename}` };
  if (input.expectedArch !== input.actualArch) return { ok: false, reason: `bundle arch ${input.expectedArch} does not match runtime arch ${input.actualArch}` };
  return { ok: true };
}

async function download(url: string, destination: string, fetchImpl: typeof fetch): Promise<{ sha256: string; bytes: number }> {
  const signal = AbortSignal.timeout(120_000);
  const response = await fetchImpl(url, { signal, headers: { 'user-agent': 'metapi-evolution-update-center' } });
  if (!response.ok || !response.body) throw new Error(`Bundle download failed (HTTP ${response.status})`);
  if (Number(response.headers.get('content-length')) > MAX_BUNDLE_BYTES) {
    await response.body.cancel();
    throw new Error('Bundle exceeds the maximum allowed size');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > MAX_BUNDLE_BYTES) return callback(new Error('Bundle exceeds the maximum allowed size'));
    hash.update(chunk);
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body as never), meter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
  return { sha256: hash.digest('hex'), bytes };
}

async function readChecksums(url: string, fetchImpl: typeof fetch): Promise<Map<string, string>> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Checksum download failed (HTTP ${response.status})`);
  // Do not allow a missing or oversized checksum response to weaken verification.
  let text = '';
  if (response.body) {
    for await (const chunk of response.body) {
      text += Buffer.from(chunk).toString('utf8');
      if (text.length > 64 * 1024) throw new Error('Checksum file is too large');
    }
  } else {
    text = await response.text();
    if (text.length > 64 * 1024) throw new Error('Checksum file is too large');
  }
  return parseChecksums(text);
}

export async function extractBundle(archive: string, destination: string): Promise<void> {
  let rejected: string | null = null;
  let total = 0;
  let count = 0;
  const allowed = new Set(['dist', 'node_modules', 'package.json', 'drizzle', 'runtime', 'runtime-manifest.json']);
  await tar.t({ file: archive, strict: true, onReadEntry(entry) {
    const path = entry.path.replace(/^\.\//, '');
    const target = entry.linkpath || '';
    total += entry.size;
    count++;
    if (isAbsolute(path) || path.includes('\\') || path.split('/').includes('..') || !allowed.has(path.split('/')[0]) ||
        !['File', 'Directory', 'SymbolicLink'].includes(entry.type) ||
        (entry.type === 'SymbolicLink' && (isAbsolute(target) || target.includes('\\') || posix.normalize(posix.join(posix.dirname(path), target)).startsWith('../'))) ||
        total > 2 * 1024 * 1024 * 1024 || count > 200_000) rejected = path;
  } });
  if (rejected) throw new Error(`Unsafe bundle entry: ${rejected}`);
  await tar.x({ file: archive, cwd: destination, strict: true, preservePaths: false, preserveOwner: false });
}

async function validateRelease(directory: string, version: string, arch: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'runtime-manifest.json'), 'utf8'));
  if (manifest.protocol !== 1 || manifest.platform !== 'linux' || manifest.arch !== arch || manifest.version !== version || manifest.libc !== 'glibc') {
    throw new Error('Bundle runtime manifest does not match version, architecture or supported runner protocol');
  }
  for (const name of ['dist/server/index.js', 'dist/server/db/migrate.js', 'dist/web/index.html', 'dist/web/legacy/index.html', 'package.json', 'runtime/node']) {
    const path = await realpath(join(directory, name));
    if (relative(directory, path).startsWith('..') || !(await lstat(path)).isFile()) throw new Error(`Invalid bundle file: ${name}`);
  }
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error('Bundle package version does not match requested version');
  const { stdout } = await execFileAsync(join(directory, 'runtime/node'), ['--input-type=commonjs', '-e',
    "const D=require('./node_modules/better-sqlite3');const db=new D(':memory:');db.prepare('select 1').get();db.close();process.stdout.write(process.versions.modules);"],
  { cwd: directory, timeout: 15_000, maxBuffer: 8192 });
  if (stdout !== manifest.nodeAbi) throw new Error('Bundled Node/native-module ABI does not match its manifest');
}

export type StageBundleOptions = {
  dataDir: string; candidate: UpdateCenterVersionCandidate; arch?: string;
  log?: LocalUpdateLog; fetchImpl?: typeof fetch;
};
export type LocalUpdateStaged = { version: string; releaseDir: string; releaseTarget: string; sha256: string; bundleUrl: string };
export async function stageBundle(options: StageBundleOptions): Promise<LocalUpdateStaged> {
  const log = options.log ?? (() => {});
  const arch = options.arch ?? process.arch;
  const paths = resolveLocalUpdatePaths(options.dataDir);
  const version = normalizeBundleVersion(options.candidate.normalizedVersion);
  const tag = options.candidate.tagName || `v${version}`;
  if (normalizeBundleVersion(tag) !== version) throw new Error('Release tag and version do not match');
  const filename = buildBundleFilename(version, arch);
  const base = `https://github.com/yswlww/metapi-evolution/releases/download/${encodeURIComponent(tag)}/`;
  const fetchImpl = options.fetchImpl ?? fetch;
  await mkdir(paths.releasesDir, { recursive: true });
  const stagingDir = join(paths.releasesDir, `${version}.staging`);
  const archive = join(paths.runtimeRoot, `${filename}.download`);
  if (await pathExists(stagingDir) || await pathExists(archive)) throw new Error('Stale download found; restart the supervisor to recover it');
  await mkdir(stagingDir);
  try {
    await log(`Downloading ${filename}`);
    const downloaded = await download(`${base}${filename}`, archive, fetchImpl);
    const checksums = await readChecksums(`${base}${CHECKSUM_FILENAME}`, fetchImpl);
    // A Docker image digest is NOT the digest of this tarball. Only the
    // release's checksum file authenticates the downloaded archive contents.
    const verdict = verifyBundle({ actualSha256: downloaded.sha256, checksums, filename, expectedArch: arch, actualArch: arch });
    if (!verdict.ok) throw new Error(verdict.reason);
    await log('Checksum verified; validating archive and native runtime');
    await extractBundle(archive, stagingDir);
    await validateRelease(stagingDir, version, arch);
    const releaseTarget = `releases/${version}-${downloaded.sha256.slice(0, 16)}`;
    const releaseDir = join(paths.runtimeRoot, releaseTarget);
    if (await pathExists(releaseDir)) {
      if (await readFile(join(releaseDir, '.bundle-sha256'), 'utf8') !== downloaded.sha256) throw new Error('Existing release does not match immutable bundle');
    } else {
      await writeFile(join(stagingDir, '.bundle-sha256'), downloaded.sha256, 'utf8');
      await rename(stagingDir, releaseDir);
    }
    return { version, releaseDir, releaseTarget, sha256: downloaded.sha256, bundleUrl: `${base}${filename}` };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
    await rm(archive, { force: true });
  }
}

export type PerformLocalUpgradeOptions = StageBundleOptions & { source: UpdateSourceKind; platform?: string; taskId?: string };
export type PerformLocalUpgradeResult = { success: boolean; version: string; requiresRestart: boolean; previousVersion: string | null; state: UpdateState };
export async function performLocalUpgrade(options: PerformLocalUpgradeOptions): Promise<PerformLocalUpgradeResult> {
  const version = normalizeBundleVersion(options.candidate.normalizedVersion);
  const paths = resolveLocalUpdatePaths(options.dataDir);
  const support = resolveSelfUpgradeSupport({ arch: options.arch ?? process.arch, platform: options.platform ?? process.platform });
  if (!support.supported) throw new Error(support.reason || 'Unsupported runtime');
  await mkdir(paths.runtimeRoot, { recursive: true });
  const lock = await open(paths.lockPath, 'wx').catch(() => { throw new Error('an upgrade is already in progress'); });
  let previousVersion: string | null = null;
  try {
    const existing = await readUpdateState(paths);
    if (isActiveUpdatePhase(existing.phase)) throw new Error(`an upgrade is already in progress (phase: ${existing.phase})`);
    if (existing.error?.startsWith('Upgrade state is unreadable')) throw new Error(existing.error);
    previousVersion = await readCurrentVersion(paths.currentLink);
    if (previousVersion === version) throw new Error('target version is already running');
    const previous = await readSymlinkIfPresent(paths.currentLink);
    // Stage can be tested without a runner, but activation cannot discard the
    // only known-good version if bootstrap has not run.
    if (!previous) throw new Error('No running release; launch with the runtime supervisor first');
    await resolveRelease(paths, previous);
    await writeUpdateState(paths, createUpdateState({ phase: 'downloading', targetVersion: version, previousVersion,
      source: options.source, attempts: 1, taskId: options.taskId, operation: 'deploy', previousRelease: previous,
      rollbackAttempted: false, startedAt: new Date().toISOString() }));
    try {
      const staged = await stageBundle(options);
      await switchSymlink(paths.previousLink, previous);
      const pending = await writeUpdateState(paths, { ...(await readUpdateState(paths)), phase: 'switching', targetRelease: staged.releaseTarget });
      await switchSymlink(paths.currentLink, staged.releaseTarget);
      const state = await writeUpdateState(paths, { ...pending, phase: 'health-checking' });
      return { success: true, version, previousVersion, requiresRestart: true, state };
    } catch (error) {
      await switchSymlink(paths.currentLink, previous);
      const message = error instanceof Error ? error.message : String(error);
      const state = await writeUpdateState(paths, { ...(await readUpdateState(paths)), phase: 'failed', error: message });
      await options.log?.(`Upgrade failed: ${message}`);
      return { success: false, version, previousVersion, requiresRestart: false, state };
    }
  } finally {
    await lock.close();
    await rm(paths.lockPath, { force: true });
  }
}

export async function rollbackToPrevious(paths: LocalUpdatePaths, taskId?: string): Promise<string> {
  await mkdir(paths.runtimeRoot, { recursive: true });
  const lock = await open(paths.lockPath, 'wx').catch(() => { throw new Error('an upgrade is already in progress'); });
  try {
    const state = await readUpdateState(paths);
    if (isActiveUpdatePhase(state.phase)) throw new Error('an upgrade is already in progress');
    const previous = await readSymlinkIfPresent(paths.previousLink);
    const current = await readSymlinkIfPresent(paths.currentLink);
    if (!previous || previous === current) throw new Error('no previous release to roll back to');
    const directory = await resolveRelease(paths, previous);
    if (taskId) {
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      await writeUpdateState(paths, createUpdateState({ phase: 'switching', attempts: 1, taskId, operation: 'rollback',
        targetVersion: pkg.version, previousRelease: current || undefined, targetRelease: previous,
        previousVersion: await readCurrentVersion(paths.currentLink), startedAt: new Date().toISOString(), rollbackAttempted: false }));
      if (current) await switchSymlink(paths.previousLink, current);
    }
    await switchSymlink(paths.currentLink, previous);
    return previous;
  } finally { await lock.close(); await rm(paths.lockPath, { force: true }); }
}

export async function getSelfUpgradeSupportForRuntime(dataDir: string): Promise<SelfUpgradeSupport> {
  const base = resolveSelfUpgradeSupport();
  if (!base.supported) return base;
  if (process.env.METAPI_LOCAL_UPDATE_RUNNER !== '1' || !process.send || !process.connected) {
    return { ...base, supported: false, reasonCode: 'runner-required', reason: 'Start the runtime supervisor (or update the Docker image) to enable in-app upgrades.' };
  }
  try { await access(resolveLocalUpdatePaths(dataDir).runtimeRoot, constants.W_OK); }
  catch { return { ...base, supported: false, reasonCode: 'read-only-runtime', reason: 'The runtime directory is not writable.' }; }
  return base;
}

export async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
