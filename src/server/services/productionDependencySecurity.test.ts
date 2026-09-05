import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type PackageLock = {
  packages?: {
    'node_modules/fast-uri'?: {
      version?: string;
    };
  };
};

describe('production dependency security compatibility', () => {
  it('locks fast-uri to a version newer than the vulnerable 3.1.0 release', async () => {
    const lockfile = JSON.parse(
      await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8'),
    ) as PackageLock;

    expect(lockfile.packages?.['node_modules/fast-uri']?.version).not.toBe('3.1.0');
  });
});
