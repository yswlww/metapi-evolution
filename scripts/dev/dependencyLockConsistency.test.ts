import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const manifests = [
  ['package.json', 'package-lock.json'],
  ['New metapi Evolution Webui/metapi/package.json', 'New metapi Evolution Webui/metapi/package-lock.json'],
] as const;

/**
 * `docker/Dockerfile` and CI run `npm ci` on Node 22 / npm 10. npm 11 silently
 * repairs a lockfile that npm 10 rejects, so an install can pass locally and
 * fail only in the image build. This pins the real installer instead of
 * re-implementing npm's override resolution.
 */
describe('dependency lockfile consistency', () => {
  it.skipIf(process.platform === 'win32' || !existsSync('/usr/bin/docker'))(
    'completes npm ci on the Docker builder Node/npm major',
    () => {
      for (const [manifestName, lockName] of manifests) {
        const manifestPath = join(repoRoot, manifestName);
        if (!existsSync(manifestPath)) continue;
        const dir = mkdtempSync(join(tmpdir(), 'metapi-npm-ci-'));
        for (const file of [manifestName, lockName]) {
          const target = join(dir, file);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, readFileSync(join(repoRoot, file)));
        }
        const workdir = dirname(manifestName);
        const result = spawnSync(
          'docker',
          ['run', '--rm', '-v', `${dir}:/w`, '-w', `/w/${workdir}`, 'node:22-bookworm-slim', 'npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
          { encoding: 'utf8', timeout: 9 * 60_000 },
        );
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
        expect(output, `${manifestName} install output`).not.toContain('from lock file');
        expect(result.status, `${manifestName}: ${output.slice(-500)}`).toBe(0);
      }
    },
    15 * 60_000,
  );
});