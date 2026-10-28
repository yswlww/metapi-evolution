import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as tar from 'tar';
import type { fetch as undiciFetch } from 'undici';
import { createUpdateState } from '../../shared/localUpdateContract.js';
import { buildBundleFilename, extractBundle, normalizeBundleVersion, parseChecksums, performLocalUpgrade, readUpdateState, resolveLocalUpdatePaths, rollbackToPrevious, stageBundle, sweepStagingDirs, verifyBundle, writeUpdateState } from './updateCenterLocalService.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function runtime() {
  const root = await mkdtemp(join(tmpdir(), 'metapi-update-safe-')); directories.push(root);
  const paths = resolveLocalUpdatePaths(root);
  await mkdir(join(paths.releasesDir, '1.0.0'), { recursive: true });
  await writeFile(join(paths.releasesDir, '1.0.0/package.json'), JSON.stringify({ version: '1.0.0' }));
  await symlink('releases/1.0.0', paths.currentLink);
  return { root, paths };
}
const candidate = { source: 'github-release' as const, rawVersion: 'v2.0.0', normalizedVersion: '2.0.0', tagName: 'v2.0.0', url: null, digest: `sha256:${'a'.repeat(64)}` };
function fakeDownload(archive: Buffer, checksum?: string) {
  const digest = checksum ?? createHash('sha256').update(archive).digest('hex');
  return (async (url: string | URL) => String(url).endsWith('checksums.txt')
    ? new Response(`${digest}  metapi-evolution-2.0.0-amd64.tar.gz\n`)
    : new Response(archive, { headers: { 'content-length': String(archive.length) } })) as unknown as typeof undiciFetch;
}
async function archiveFor(arch: string) {
  const root = await mkdtemp(join(tmpdir(), 'metapi-update-archive-')); directories.push(root);
  await writeFile(join(root, 'runtime-manifest.json'), JSON.stringify({ protocol: 1, platform: 'linux', libc: 'glibc', version: '2.0.0', arch }));
  const file = join(root, 'bundle.tgz');
  await tar.c({ cwd: root, file, gzip: true }, ['runtime-manifest.json']);
  return readFile(file);
}

describe('local release guards', () => {
  it.each(['../../data', '/etc', 'latest', 'dev', '1.0.0/..', '', '1.0.0\\other'])('rejects unsafe or non-release target %s', value => {
    expect(() => normalizeBundleVersion(value)).toThrow();
  });
  it('uses the release bundle filename convention', () => {
    expect(buildBundleFilename('v2.0.0', 'x64')).toBe('metapi-evolution-2.0.0-amd64.tar.gz');
    expect(buildBundleFilename('2.0.0', 'arm64')).toBe('metapi-evolution-2.0.0-arm64.tar.gz');
  });
  it('parses checksum manifests and rejects duplicate filenames', () => {
    const line = `${'b'.repeat(64)} *bundle.tar.gz`;
    expect(parseChecksums(line).get('bundle.tar.gz')).toBe('b'.repeat(64));
    expect(() => parseChecksums(`${line}\n${line}`)).toThrow('Duplicate');
    expect(parseChecksums('not-a-digest file').size).toBe(0);
  });
  it('requires a valid matching checksum and architecture', () => {
    const good = { actualSha256: 'a'.repeat(64), expectedSha256: 'a'.repeat(64), checksums: new Map<string, string>(), filename: 'bundle', expectedArch: 'x64', actualArch: 'x64' };
    expect(verifyBundle(good)).toEqual({ ok: true });
    expect(verifyBundle({ ...good, expectedSha256: null }).ok).toBe(false);
    expect(verifyBundle({ ...good, expectedSha256: 'sha256:abc' }).ok).toBe(false);
    expect(verifyBundle({ ...good, actualSha256: 'b'.repeat(64) }).ok).toBe(false);
    expect(verifyBundle({ ...good, actualArch: 'arm64' }).ok).toBe(false);
  });
  it('keeps unreadable persisted state failed instead of treating it as idle', async () => {
    const { paths } = await runtime();
    await writeFile(paths.statePath, '{ invalid json');
    expect((await readUpdateState(paths)).phase).toBe('failed');
  });
  it('persists state atomically and preserves activation metadata', async () => {
    const { paths } = await runtime();
    await writeUpdateState(paths, createUpdateState({ phase: 'switching', taskId: 'task-1', attempts: 1, previousRelease: 'releases/1.0.0' }));
    expect(await readUpdateState(paths)).toMatchObject({ phase: 'switching', attempts: 1, taskId: 'task-1', previousRelease: 'releases/1.0.0' });
  });
  it('refuses concurrent upgrades without touching the running pointer', async () => {
    const { root, paths } = await runtime();
    await writeUpdateState(paths, createUpdateState({ phase: 'downloading', attempts: 1 }));
    await expect(performLocalUpgrade({ dataDir: root, candidate, source: 'github-release' })).rejects.toThrow('already in progress');
    expect(await readlink(paths.currentLink)).toBe('releases/1.0.0');
  });
  it('refuses unsupported architectures before downloading', async () => {
    const { root } = await runtime();
    await expect(performLocalUpgrade({ dataDir: root, candidate, source: 'github-release', arch: 'arm' })).rejects.toThrow('arm');
  });
  it('rejects bad checksums, cleans partial downloads and never moves current', async () => {
    const { root, paths } = await runtime();
    const result = await performLocalUpgrade({ dataDir: root, candidate, source: 'github-release', fetchImpl: fakeDownload(Buffer.from('junk'), '0'.repeat(64)) });
    expect(result.state.error).toContain('checksum mismatch');
    expect(result.success).toBe(false);
    expect(await readlink(paths.currentLink)).toBe('releases/1.0.0');
    expect(await sweepStagingDirs(paths)).toEqual([]);
  });
  it('does not use a Docker image digest as the archive checksum', async () => {
    const { root } = await runtime();
    const result = await performLocalUpgrade({ dataDir: root, candidate, source: 'docker-hub-tag', fetchImpl: fakeDownload(Buffer.from('not-a-tar')) });
    expect(result.state.error).not.toContain('checksum mismatch');
    expect(result.success).toBe(false);
  });
  it('checks the archive runtime manifest instead of comparing the requested arch to itself', async () => {
    const { root, paths } = await runtime();
    const result = await performLocalUpgrade({ dataDir: root, candidate, source: 'github-release', fetchImpl: fakeDownload(await archiveFor('arm64')) });
    expect(result.state.error).toContain('manifest');
    expect(await readlink(paths.currentLink)).toBe('releases/1.0.0');
  });
  it('rejects a missing checksum file rather than falling back to an image digest', async () => {
    const { root } = await runtime();
    const fetchImpl = (async (url: string) => url.endsWith('checksums.txt') ? new Response('', { status: 404 }) : new Response('junk')) as unknown as typeof undiciFetch;
    await expect(stageBundle({ dataDir: root, candidate, fetchImpl })).rejects.toThrow('Checksum download failed');
  });
  it('rejects archive links outside the staging directory before extraction', async () => {
    const { root } = await runtime();
    const source = join(root, 'archive-source');
    const dest = join(root, 'stage');
    await mkdir(join(source, 'node_modules'), { recursive: true });
    await mkdir(dest);
    await symlink('../../../outside', join(source, 'node_modules/escape'));
    const archive = join(root, 'evil.tgz');
    await tar.c({ file: archive, cwd: source, gzip: true }, ['node_modules']);
    await expect(extractBundle(archive, dest)).rejects.toThrow('Unsafe bundle entry');
  });
  it('rejects rollback without a previous release', async () => {
    const { paths } = await runtime();
    await expect(rollbackToPrevious(paths)).rejects.toThrow('no previous release');
  });
});
