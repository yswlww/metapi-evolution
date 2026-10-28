import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBundle } from '../../../scripts/release/buildBundle.mjs';

describe('local updater architecture', () => {
  it('keeps route adapters free of persistence and process lifecycle ownership', () => {
    const source = readFileSync('src/server/routes/api/updateCenter.ts', 'utf8');
    expect(source).not.toMatch(/node:fs|switchSymlink|performLocalUpgrade|process\.exit|setInterval/);
    expect(source).toContain('startLocalUpdateTask');
  });
  it('uses the same contract and filesystem primitives in the app and stable supervisor', () => {
    for (const path of ['scripts/release/runtimeRunner.mjs', 'src/server/services/updateCenterLocalService.ts']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('shared/localUpdateContract.js');
      expect(source).toContain('shared/localUpdateRuntime.js');
    }
    expect(readFileSync('src/server/services/updateCenterTaskService.ts', 'utf8')).not.toContain('backgroundTaskService');
  });
  it('builds native bundles using the image environment, including Node and both frontends', () => {
    const dockerfile = readFileSync('docker/Dockerfile', 'utf8');
    expect(dockerfile).toContain('FROM builder AS bundle-builder');
    expect(dockerfile).toContain('AS server-bundle');
    expect(dockerfile).toContain('/app/scripts/release/runtimeRunner.mjs');
    expect(dockerfile).not.toContain('get.helm.sh');
    expect(dockerfile).not.toContain('dl.k8s.io');
    const bundle = readFileSync('scripts/release/buildBundle.mjs', 'utf8');
    expect(bundle).toContain('verbatimSymlinks: true');
    expect(bundle).toContain("'runtime/node'");
    expect(bundle).toContain("'dist/web/legacy/index.html'");
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(release).toContain('METAPI_BUNDLE_VERSION');
    expect(release).toContain('sha256sum -c checksums.txt');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('smokeRuntimeUpgrade.mjs');
  });
  it('never labels a cross-architecture bundle as native', async () => {
    await expect(buildBundle({ arch: process.arch === 'x64' ? 'arm64' : 'amd64' })).rejects.toThrow('natively');
  });
});
