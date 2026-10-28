#!/usr/bin/env node
// Build on the target Linux architecture, inside the same Debian/Node image as
// Docker. Ship that Node executable with its native modules: host CI's Node ABI
// must never leak into a release installed in a different container runtime.
import { createHash } from 'node:crypto';
import { copyFile, cp, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';
import { normalizeLocalUpdateVersion, localUpdateBundleFilename, toLocalBundleArch, UPDATE_SUPPORTED_ARCHES } from '../../src/shared/localUpdateContract.js';

async function digestTree(root, path, hash) {
  for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) await digestTree(root, name, hash);
    else if (entry.isFile()) hash.update(name).update(await readFile(join(root, name)));
  }
}
export async function writeRuntimeManifest(root, version) {
  const hash = createHash('sha256');
  await digestTree(root, 'dist', hash);
  hash.update(await readFile(join(root, 'package.json')));
  const manifest = {
    protocol: 1, platform: process.platform, arch: process.arch, libc: 'glibc', version,
    nodeVersion: process.versions.node, nodeAbi: process.versions.modules, buildId: hash.digest('hex'),
  };
  await writeFile(join(root, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function buildBundle({ root = process.cwd(), out, arch = toLocalBundleArch(process.arch), version } = {}) {
  root = resolve(root);
  if (process.platform !== 'linux' || !UPDATE_SUPPORTED_ARCHES.includes(process.arch) || arch !== toLocalBundleArch(process.arch)) {
    throw new Error('Build bundles natively on the matching Linux amd64/arm64 architecture');
  }
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  version = normalizeLocalUpdateVersion(version || pkg.version);
  for (const path of ['dist/server/index.js', 'dist/server/db/migrate.js', 'dist/web/index.html', 'dist/web/legacy/index.html', 'node_modules', 'drizzle']) {
    await (await import('node:fs/promises')).access(join(root, path));
  }
  const outDir = resolve(out || 'release-bundles');
  await mkdir(outDir, { recursive: true });
  const staging = await mkdtemp(join(outDir, '.bundle-'));
  try {
    for (const name of ['dist', 'node_modules', 'drizzle']) await cp(join(root, name), join(staging, name), { recursive: true, verbatimSymlinks: true, filter: path => !path.endsWith('/.cache') });
    await writeFile(join(staging, 'package.json'), JSON.stringify({ ...pkg, version }, null, 2));
    await mkdir(join(staging, 'runtime'));
    await copyFile(process.execPath, join(staging, 'runtime/node'));
    await chmod(join(staging, 'runtime/node'), 0o755);
    await writeRuntimeManifest(staging, version);
    const filename = localUpdateBundleFilename(version, process.arch);
    const bundlePath = join(outDir, filename);
    await tar.c({ file: bundlePath, cwd: staging, gzip: true, portable: true, noMtime: true }, ['dist', 'node_modules', 'drizzle', 'package.json', 'runtime', 'runtime-manifest.json']);
    const { createReadStream } = await import('node:fs');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(bundlePath)) hash.update(chunk);
    const digest = hash.digest('hex');
    // Unique filenames avoid matrix artifact merges silently overwriting the
    // other architecture's checksums. The publishing job combines these files.
    await writeFile(`${bundlePath}.sha256`, `${digest}  ${filename}\n`);
    return { filename, digest };
  } finally { await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined; };
  const root = resolve(arg('root') || '.');
  const action = process.argv.includes('--manifest-only')
    ? readFile(join(root, 'package.json'), 'utf8').then(raw => writeRuntimeManifest(root, JSON.parse(raw).version))
    : buildBundle({ root, arch: arg('arch'), version: arg('version'), out: arg('out') });
  action.then(result => console.log(JSON.stringify(result))).catch(error => { console.error(`[buildBundle] ${error.message}`); process.exitCode = 1; });
}
