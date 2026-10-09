import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type PackageLock = { packages: Record<string, { version?: string }> };
function versionParts(version: string): number[] { return version.split('.').map(part => Number.parseInt(part, 10)); }
function atLeast(version: string, minimum: string): boolean {
  const actual = versionParts(version); const floor = versionParts(minimum);
  for (let index = 0; index < 3; index++) { if (actual[index] !== floor[index]) return actual[index] > floor[index]; }
  return true;
}
const floors: Record<string, (version: string) => string> = {
  fastify: () => '5.12.5', nodemailer: () => '10.0.9',
  undici: version => version.startsWith('6.') ? '6.29.0' : '7.29.1',
  'brace-expansion': version => version.startsWith('1.') ? '1.1.21' : version.startsWith('2.') ? '2.1.7' : '5.0.12',
  'ip-address': () => '10.7.1', dompurify: () => '3.4.16',
  'fast-uri': version => version.startsWith('3.') ? '3.1.8' : '4.1.5',
  'shell-quote': () => '1.12.0', sharp: () => '0.35.5', vue: () => '3.5.43',
  '@vue/server-renderer': () => '3.5.43', 'source-map-js': () => '1.2.2',
  'http-cache-semantics': () => '4.3.0', joi: () => '18.2.9',
  katex: () => '0.19.0', 'global-agent': () => '4.1.3',
};

describe('dependency security floors', () => {
  it('locks every direct and nested vulnerable package above its patched floor', async () => {
    const lockfile = JSON.parse(await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8')) as PackageLock;
    const violations: string[] = [];
    for (const [path, entry] of Object.entries(lockfile.packages)) {
      for (const [name, floor] of Object.entries(floors)) {
        if (path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`) {
          if (!entry.version || !atLeast(entry.version, floor(entry.version))) violations.push(`${path}: ${entry.version} < ${entry.version ? floor(entry.version) : 'missing'}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
  it('keeps npm and pnpm security overrides identical', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    const workspace = await readFile(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8');
    const expected: Record<string, string> = {};
    for (const [name, value] of Object.entries(manifest.overrides)) {
      if (typeof value === 'string') expected[name] = value;
      else for (const [child, version] of Object.entries(value as Record<string, string>)) expected[`${name}>${child}`] = version;
    }
    const actual = Object.fromEntries(workspace.split('\n').filter(line => /^  "/.test(line)).map(line => {
      const match = /^  ("[^"]+"): ("[^"]+")$/.exec(line);
      if (!match) throw new Error(`Unexpected override entry: ${line}`);
      return [JSON.parse(match[1]), JSON.parse(match[2])];
    }));
    expect(actual).toEqual(expected);
  });
  it('retains the supported undici 6 runtime line rather than an untested major upgrade', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(manifest.dependencies.undici).toBe('6.29.0');
  });
});
