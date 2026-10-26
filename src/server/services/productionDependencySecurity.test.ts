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
  'follow-redirects': () => '1.16.1',
  fastify: () => '5.12.5', nodemailer: () => '10.1.4',
  undici: () => '7.30.1',
  'brace-expansion': version => version.startsWith('1.') ? '1.1.21' : version.startsWith('2.') ? '2.1.7' : '5.0.12',
  'ip-address': () => '10.7.5', dompurify: () => '3.4.17',
  // fast-uri 3.x, 4.0–4.2.2 and the shared 4.1.5 pin are all vulnerable to
  // URI scheme spoofing through percent-encoded scheme decoding.
  'fast-uri': version => version.startsWith('3.') ? '3.1.9' : '4.2.3',
  'shell-quote': () => '1.12.0', sharp: () => '0.35.5', vue: () => '3.5.43',
  '@vue/server-renderer': () => '3.5.43', 'source-map-js': () => '1.2.2',
  'http-cache-semantics': () => '4.3.0', joi: () => '18.2.9',
  katex: () => '0.19.0', 'global-agent': () => '4.1.3',
  vite: () => '6.4.3', esbuild: () => '0.25.0',
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
  it('pins undici to a release that carries the TLS and decompression fixes', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    // 7.30.1 is the first release covering the TLS 1.2 renegotiation DoS,
    // the Agent TLS-option drop, excessive content-encoding DoS and the SRI
    // algorithm-token bypass. The 6.x line received none of these.
    expect(atLeast(manifest.dependencies.undici, '7.30.1')).toBe(true);
    expect(manifest.dependencies.undici).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('routes every transitive undici consumer to the patched release', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
    for (const [parent, child] of Object.entries(manifest.overrides)) {
      if (!child || typeof child !== 'object') continue;
      const pinned = (child as Record<string, string>).undici;
      if (pinned === undefined) continue;
      expect(atLeast(pinned, '7.30.1'), `${parent}>undici`).toBe(true);
    }
  });
});
