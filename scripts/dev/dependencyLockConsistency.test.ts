import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const manifests = [
  ['package.json', 'package-lock.json'],
  ['New metapi Evolution Webui/metapi/package.json', 'New metapi Evolution Webui/metapi/package-lock.json'],
] as const;

/** The builder image the Dockerfile actually uses, so this test cannot drift from it. */
function dockerBuilderImage(): string {
  const dockerfile = readFileSync(join(repoRoot, 'docker/Dockerfile'), 'utf8');
  const match = dockerfile.match(/^FROM\s+(\S+)\s+AS\s+builder$/m);
  if (!match) throw new Error('Could not find the builder FROM line in docker/Dockerfile');
  return match[1];
}

/**
 * `docker/Dockerfile` and CI run `npm ci` on Node 22 / npm 10. npm 11 silently
 * repairs a lockfile that npm 10 rejects, so an install can pass locally and
 * fail only in the image build. This pins the real installer instead of
 * re-implementing npm's override resolution.
 */
describe('dependency lockfile consistency', () => {
  it('pins a Docker builder image that satisfies the declared engines floor', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };
    const floor = manifest.engines?.node?.match(/(\d+)\.(\d+)\.(\d+)/);
    expect(floor, 'package.json engines.node must carry an explicit x.y.z floor').not.toBeNull();

    const image = dockerBuilderImage();
    const imageVersion = image.match(/:(\d+)\.(\d+)\.(\d+)-/);
    // A floating tag (`node:22-bookworm-slim`) would drift onto whatever patch
    // the registry serves next, including a vulnerable one.
    expect(imageVersion, `Docker builder image must pin an exact patch: ${image}`).not.toBeNull();

    const [major, minor, patch] = imageVersion!.slice(1).map(Number);
    const [floorMajor, floorMinor, floorPatch] = floor!.slice(1).map(Number);
    const imageAtLeastFloor =
      major > floorMajor
      || (major === floorMajor && (minor > floorMinor || (minor === floorMinor && patch >= floorPatch)));
    expect(imageAtLeastFloor, `${image} is older than engines.node ${manifest.engines?.node}`).toBe(true);
  });

  it.skipIf(process.platform === 'win32' || !existsSync('/usr/bin/docker'))(
    'completes npm ci on the Docker builder Node/npm major',
    () => {
      for (const [manifestName, lockName] of manifests) {
        const manifestPath = join(repoRoot, manifestName);
        if (!existsSync(manifestPath)) continue;
        const dir = mkdtempSync(join(tmpdir(), 'metapi-npm-ci-'));
        // The container writes node_modules as root, which the host user cannot
        // delete. Run it as the invoking user and always remove the tree, or a
        // few runs fill /tmp with ~900MB of leaked npm installs.
        const hostUid = typeof process.getuid === 'function' ? process.getuid() : 0;
        const hostGid = typeof process.getgid === 'function' ? process.getgid() : 0;
        try {
          for (const file of [manifestName, lockName]) {
            const target = join(dir, file);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, readFileSync(join(repoRoot, file)));
          }
          const workdir = dirname(manifestName);
          const result = spawnSync(
            'docker',
            [
              'run', '--rm',
              '--user', `${hostUid}:${hostGid}`,
              '-e', 'HOME=/w',
              '-v', `${dir}:/w`,
              '-w', `/w/${workdir}`,
              dockerBuilderImage(),
              'npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
            ],
            { encoding: 'utf8', timeout: 9 * 60_000 },
          );
          const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
          expect(output, `${manifestName} install output`).not.toContain('from lock file');
          expect(result.status, `${manifestName}: ${output.slice(-500)}`).toBe(0);
        } finally {
          removeTempTree(dir);
        }
      }
    },
    15 * 60_000,
  );
});

function removeTempTree(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Leftovers from an older root-running version of this test can be owned by
    // root; sweep them with the same container rather than leaving them behind.
    spawnSync('docker', ['run', '--rm', '-v', `${dirname(dir)}:/t`, 'alpine', 'rm', '-rf', `/t/${basename(dir)}`], {
      encoding: 'utf8',
      timeout: 60_000,
    });
  }
}