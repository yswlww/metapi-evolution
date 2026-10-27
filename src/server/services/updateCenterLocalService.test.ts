import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildBundleFilename,
  parseChecksums,
  performLocalUpgrade,
  readCurrentVersion,
  readUpdateState,
  resolveLocalUpdatePaths,
  rollbackToPrevious,
  sweepStagingDirs,
  switchSymlink,
  toBundleArchToken,
  verifyBundle,
  writeUpdateState,
} from './updateCenterLocalService.js';
import { createUpdateState } from '../../shared/localUpdateContract.js';
import type { UpdateCenterVersionCandidate } from './updateCenterVersionService.js';

const SHA = (seed: string) => seed.repeat(64).slice(0, 64);

describe('bundle naming', () => {
  it('maps node arch tokens to release artifact arch tokens', () => {
    expect(toBundleArchToken('x64')).toBe('amd64');
    expect(toBundleArchToken('arm64')).toBe('arm64');
    expect(toBundleArchToken('arm')).toBe('arm');
  });

  it('builds the published bundle filename', () => {
    expect(buildBundleFilename('1.5.0', 'x64')).toBe('metapi-evolution-1.5.0-amd64.tar.gz');
    expect(buildBundleFilename('1.5.0', 'arm64')).toBe('metapi-evolution-1.5.0-arm64.tar.gz');
  });
});

describe('parseChecksums', () => {
  it('parses sha256sum output including the binary-mode marker', () => {
    const map = parseChecksums(
      [
        `${SHA('a')}  metapi-evolution-1.5.0-amd64.tar.gz`,
        `${SHA('b')} *metapi-evolution-1.5.0-arm64.tar.gz`,
        '',
      ].join('\n'),
    );
    expect(map.get('metapi-evolution-1.5.0-amd64.tar.gz')).toBe(SHA('a'));
    expect(map.get('metapi-evolution-1.5.0-arm64.tar.gz')).toBe(SHA('b'));
  });

  it('ignores lines that do not carry a real digest', () => {
    const map = parseChecksums('not-a-digest  file.tar.gz\nsha256:abc  other.tar.gz\n');
    expect(map.size).toBe(0);
  });
});

describe('verifyBundle', () => {
  const filename = 'metapi-evolution-1.5.0-amd64.tar.gz';
  const good = SHA('c');

  it('accepts a matching digest and arch', () => {
    expect(verifyBundle({
      actualSha256: good,
      expectedSha256: good,
      filename,
      checksums: new Map(),
      expectedArch: 'x64',
      actualArch: 'x64',
    })).toEqual({ ok: true });
  });

  it('rejects a bad digest', () => {
    const verdict = verifyBundle({
      actualSha256: SHA('d'),
      expectedSha256: good,
      filename,
      checksums: new Map(),
      expectedArch: 'x64',
      actualArch: 'x64',
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('checksum mismatch');
  });

  it('falls back to the checksums file when the candidate carries no digest', () => {
    expect(verifyBundle({
      actualSha256: good,
      expectedSha256: null,
      filename,
      checksums: new Map([[filename, good]]),
      expectedArch: 'x64',
      actualArch: 'x64',
    })).toEqual({ ok: true });
  });

  it('rejects when no checksum is published at all', () => {
    const verdict = verifyBundle({
      actualSha256: good,
      expectedSha256: null,
      filename,
      checksums: new Map(),
      expectedArch: 'x64',
      actualArch: 'x64',
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('no checksum published');
  });

  it('rejects a malformed checksum instead of trusting it', () => {
    const verdict = verifyBundle({
      actualSha256: good,
      expectedSha256: 'sha256:' + good,
      filename,
      checksums: new Map(),
      expectedArch: 'x64',
      actualArch: 'x64',
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('malformed checksum');
  });

  it('rejects a bundle built for a different architecture', () => {
    const verdict = verifyBundle({
      actualSha256: good,
      expectedSha256: good,
      filename: 'metapi-evolution-1.5.0-arm64.tar.gz',
      checksums: new Map(),
      expectedArch: 'arm64',
      actualArch: 'x64',
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('does not match runtime arch');
  });
});

describe('update state persistence', () => {
  let dataDir = '';

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-local-update-'));
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
  });

  it('returns an idle state when the file does not exist', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    const state = await readUpdateState(paths);
    expect(state.phase).toBe('idle');
    expect(state.attempts).toBe(0);
  });

  it('round-trips a state file and stamps updatedAt', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    const written = await writeUpdateState(paths, createUpdateState({
      phase: 'switching',
      targetVersion: '1.5.0',
      attempts: 1,
    }));
    expect(written.updatedAt).not.toBeNull();

    const reread = await readUpdateState(paths);
    expect(reread.phase).toBe('switching');
    expect(reread.targetVersion).toBe('1.5.0');
    expect(reread.attempts).toBe(1);
  });

  it('falls back to idle when the state file is corrupt', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    mkdirSync(paths.runtimeRoot, { recursive: true });
    writeFileSync(paths.statePath, '{ this is not json', 'utf8');
    const state = await readUpdateState(paths);
    expect(state.phase).toBe('idle');
  });

  it('sweeps interrupted staging directories but keeps complete releases', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    mkdirSync(join(paths.releasesDir, '1.4.2'), { recursive: true });
    mkdirSync(join(paths.releasesDir, '1.5.0.staging'), { recursive: true });
    writeFileSync(join(paths.releasesDir, '1.5.0.staging', 'partial.txt'), 'x', 'utf8');

    const removed = await sweepStagingDirs(paths);

    expect(removed).toEqual(['1.5.0.staging']);
    expect(existsSync(join(paths.releasesDir, '1.5.0.staging'))).toBe(false);
    expect(existsSync(join(paths.releasesDir, '1.4.2'))).toBe(true);
  });

  it('tolerates a missing releases directory when sweeping', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    expect(await sweepStagingDirs(paths)).toEqual([]);
  });
});

describe('contract alignment', () => {
  it('keeps the state filename shared with the runner contract', () => {
    const source = readFileSync(join(process.cwd(), 'src/shared/localUpdateContract.js'), 'utf8');
    expect(source).toContain("'update-state.json'");
  });
});

function candidate(version: string): UpdateCenterVersionCandidate {
  return {
    source: 'github-release',
    rawVersion: `v${version}`,
    normalizedVersion: version,
    url: null,
    tagName: `v${version}`,
    digest: null,
  };
}

describe('switchSymlink atomicity', () => {
  let dataDir = '';

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-symlink-'));
  });

  it('repoints the link and leaves no temp entry behind', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    mkdirSync(join(paths.releasesDir, '1.4.2'), { recursive: true });
    mkdirSync(join(paths.releasesDir, '1.5.0'), { recursive: true });

    await switchSymlink(paths.currentLink, join('releases', '1.4.2'));
    expect(await readCurrentVersion(paths.currentLink)).toBe('1.4.2');

    await switchSymlink(paths.currentLink, join('releases', '1.5.0'));
    expect(await readCurrentVersion(paths.currentLink)).toBe('1.5.0');
    expect(existsSync(`${paths.currentLink}.tmp`)).toBe(false);
  });

  it('rolls back to the previous target', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    mkdirSync(join(paths.releasesDir, '1.4.2'), { recursive: true });
    mkdirSync(join(paths.releasesDir, '1.5.0'), { recursive: true });
    await switchSymlink(paths.currentLink, join('releases', '1.4.2'));
    await switchSymlink(paths.previousLink, join('releases', '1.4.2'));
    await switchSymlink(paths.currentLink, join('releases', '1.5.0'));

    const target = await rollbackToPrevious(paths);

    expect(target).toBe(join('releases', '1.4.2'));
    expect(await readCurrentVersion(paths.currentLink)).toBe('1.4.2');
  });

  it('refuses to roll back when no previous release is recorded', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    await expect(rollbackToPrevious(paths)).rejects.toThrow('no previous release');
  });
});

describe('performLocalUpgrade guards', () => {
  let dataDir = '';

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-upgrade-guard-'));
  });

  it('refuses armv7 instead of attempting an impossible upgrade', async () => {
    await expect(
      performLocalUpgrade({ dataDir, candidate: candidate('1.5.0'), source: 'github-release', arch: 'arm', platform: 'linux' }),
    ).rejects.toThrow(/arm/);
  });

  it('refuses a non-Linux runtime', async () => {
    await expect(
      performLocalUpgrade({ dataDir, candidate: candidate('1.5.0'), source: 'github-release', arch: 'x64', platform: 'win32' }),
    ).rejects.toThrow(/win32/);
  });

  it('refuses to start a second upgrade while one is in flight', async () => {
    const paths = resolveLocalUpdatePaths(dataDir);
    await writeUpdateState(paths, createUpdateState({
      phase: 'downloading',
      targetVersion: '1.5.0',
      attempts: 1,
    }));

    await expect(
      performLocalUpgrade({ dataDir, candidate: candidate('1.5.0'), source: 'github-release', arch: 'x64', platform: 'linux' }),
    ).rejects.toThrow(/already in progress/);
  });

  it('records a failed state when verification rejects the bundle', async () => {
    const logs: string[] = [];
    const fakeFetch = (async (url: string | URL) => {
      if (String(url).endsWith('checksums.txt')) {
        return {
          ok: true,
          status: 200,
          text: async () => `${SHA('f')}  metapi-evolution-1.5.0-amd64.tar.gz\n`,
        } as never;
      }
      // Body deliberately hashes to something else than the published checksum.
      return {
        ok: true,
        status: 200,
        headers: { get: () => '4' },
        body: ReadableStream.from([new TextEncoder().encode('junk')]),
      } as never;
    }) as unknown as typeof fetch;

    const result = await performLocalUpgrade({
      dataDir,
      candidate: candidate('1.5.0'),
      source: 'github-release',
      arch: 'x64',
      platform: 'linux',
      log: (message) => logs.push(message),
      fetchImpl: fakeFetch,
    });

    expect(result.success).toBe(false);
    expect(result.requiresRestart).toBe(false);
    expect(result.state.phase).toBe('failed');
    expect(result.state.error).toContain('checksum mismatch');
    // The failed attempt must never leave a partial release or a moved pointer.
    expect(existsSync(join(resolveLocalUpdatePaths(dataDir).releasesDir, '1.5.0'))).toBe(false);
    expect(existsSync(resolveLocalUpdatePaths(dataDir).currentLink)).toBe(false);
    expect(logs.some((line) => line.includes('checksum mismatch'))).toBe(true);
  });
});

