#!/usr/bin/env node
/**
 * Build a self-contained server release bundle for local runtime upgrades.
 *
 * The bundle is the image's own build, packed so the runner can unpack it into
 * $DATA_DIR/runtime/releases/<version> and switch to it. Native modules
 * (better-sqlite3) are not recompiled here: the bundle must be produced on the
 * architecture it will run on, which is why the release workflow builds one per
 * arch rather than cross-compiling.
 *
 * Usage: node scripts/release/buildBundle.mjs --version 1.5.0 --arch amd64 --out release-bundles
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const ARCH_TOKEN_BY_NODE_ARCH = { x64: 'amd64', arm64: 'arm64' };

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function resolveVersion() {
  const explicit = readArg('version');
  if (explicit) return explicit.replace(/^v/, '');
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  return String(pkg.version || '').trim();
}

function resolveArch() {
  const explicit = readArg('arch');
  if (explicit) return explicit;
  const mapped = ARCH_TOKEN_BY_NODE_ARCH[process.arch];
  if (!mapped) {
    throw new Error(`no bundle is published for ${process.arch}; build on amd64 or arm64`);
  }
  return mapped;
}

function sha256File(path) {
  const hash = createHash('sha256');
  return new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolvePromise(hash.digest('hex')));
  });
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code ?? 'null'}`));
    });
  });
}

async function main() {
  const version = resolveVersion();
  if (!version) throw new Error('could not resolve a version');
  const arch = resolveArch();
  const outDir = resolve(readArg('out') || 'release-bundles');

  for (const required of ['dist/server/index.js', 'dist/server/db/migrate.js', 'node_modules', 'package.json', 'drizzle']) {
    if (!existsSync(resolve(required))) {
      throw new Error(`missing ${required}; run the server build before bundling`);
    }
  }

  await mkdir(outDir, { recursive: true });
  const filename = `metapi-evolution-${version}-${arch}.tar.gz`;
  const bundlePath = join(outDir, filename);

  await run('tar', [
    '-czf', bundlePath,
    '--exclude=node_modules/.cache',
    'dist', 'node_modules', 'package.json', 'drizzle',
  ]);

  const digest = await sha256File(bundlePath);
  const checksumPath = join(outDir, 'checksums.txt');
  const existing = existsSync(checksumPath) ? await readFile(checksumPath, 'utf8') : '';
  const kept = existing.split('\n').filter((line) => line.trim() && !line.includes(filename));
  kept.push(`${digest}  ${filename}`);
  await writeFile(checksumPath, `${kept.join('\n')}\n`, 'utf8');

  console.log(JSON.stringify({ filename, digest, bytes: statSync(bundlePath).size, checksumPath }));
}

main().catch((error) => {
  console.error(`[buildBundle] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
