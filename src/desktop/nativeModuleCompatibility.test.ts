import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  dependencies?: Record<string, string>;
};

type PackageLock = {
  packages?: {
    'node_modules/better-sqlite3'?: {
      version?: string;
    };
  };
};

describe('desktop native-module compatibility', () => {
  it('uses a better-sqlite3 release compatible with Electron 42', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest;
    const packageLock = JSON.parse(
      await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
    ) as PackageLock;

    expect(packageJson.dependencies?.['better-sqlite3']).toBe('^13.0.3');
    expect(packageLock.packages?.['node_modules/better-sqlite3']?.version).toMatch(/^13\./);
  });
});
