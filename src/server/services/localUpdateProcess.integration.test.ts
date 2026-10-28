import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import getPort from 'get-port';

const temporary: string[] = [];
const children: ChildProcess[] = [];
const runner = resolve('scripts/release/runtimeRunner.mjs');
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 1500))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(process.env.CLAUDE_JOB_DIR ? `${process.env.CLAUDE_JOB_DIR}/tmp/` : tmpdir(), 'metapi-process-'));
  temporary.push(root);
  const port = await getPort();
  const dataDir = join(root, 'data');
  await mkdir(dataDir);
  const image = join(root, 'image');
  await release(image, '1.0.0');
  return { root, port, dataDir, image, runtime: join(dataDir, 'runtime') };
}

async function release(path: string, version: string, brokenMigration = false) {
  await mkdir(join(path, 'dist/server/db'), { recursive: true });
  await writeFile(join(path, 'package.json'), JSON.stringify({ type: 'module', version }));
  await writeFile(join(path, 'dist/server/db/migrate.js'), brokenMigration ? 'process.exit(42);' : '');
  await writeFile(join(path, 'dist/server/index.js'), `
    import http from 'node:http';
    import fs from 'node:fs/promises';
    import path from 'node:path';
    const server = http.createServer(async (req, res) => {
      if (req.url === '/activate') {
        const runtime = path.join(process.env.DATA_DIR, 'runtime');
        await fs.symlink('releases/2.0.0', path.join(runtime, 'next'));
        await fs.rename(path.join(runtime, 'next'), path.join(runtime, 'current'));
        await fs.writeFile(path.join(runtime, 'update-state.json'), JSON.stringify({ phase: 'health-checking', attempts: 1, taskId: 'upgrade-test', targetVersion: '2.0.0', targetRelease: 'releases/2.0.0', previousRelease: 'releases/1.0.0' }));
        res.end('{}');
        process.send?.({ type: 'metapi:activate', taskId: 'upgrade-test' });
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, version: '${version}', runtimeBootId: process.env.METAPI_RUNTIME_BOOT_ID }));
    });
    server.listen(Number(process.env.PORT), '127.0.0.1');
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `);
}

function start(f: Awaited<ReturnType<typeof fixture>>, script = runner) {
  const child = spawn(process.execPath, [script], {
    cwd: f.image,
    env: { ...process.env, DATA_DIR: f.dataDir, PORT: String(f.port), METAPI_IMAGE_ROOT: f.image, METAPI_UPDATE_HEALTH_TIMEOUT_MS: '1000', METAPI_UPDATE_POLL_MS: '25' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return child;
}

async function waitUntil(test: () => Promise<boolean>, child?: ChildProcess) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await test()) return;
    if (child?.exitCode != null || child?.signalCode != null) throw new Error(`runner exited: ${child.exitCode}/${child.signalCode}`);
    await new Promise(r => setTimeout(r, 30));
  }
  throw new Error('runner integration condition timed out');
}

async function version(port: number) {
  try { return (await (await fetch(`http://127.0.0.1:${port}/api/desktop/health`)).json()).version; }
  catch { return null; }
}

async function state(path: string) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}

describe('stable runner process integration', () => {
  it('uses the configured image root independently of the script location', async () => {
    const f = await fixture();
    const child = start(f);
    await waitUntil(async () => await version(f.port) === '1.0.0', child);
    expect(child.exitCode).toBeNull();
  });

  it('activates the selected release without a manual container restart', async () => {
    const f = await fixture();
    await release(join(f.runtime, 'releases/1.0.0'), '1.0.0');
    await release(join(f.runtime, 'releases/2.0.0'), '2.0.0');
    await symlink('releases/1.0.0', join(f.runtime, 'current'));
    await symlink('releases/1.0.0', join(f.runtime, 'previous'));
    const child = start(f);
    await waitUntil(async () => await version(f.port) === '1.0.0', child);
    await fetch(`http://127.0.0.1:${f.port}/activate`);
    await waitUntil(async () => await version(f.port) === '2.0.0', child);
    await waitUntil(async () => (await state(join(f.runtime, 'update-state.json'))).phase === 'completed', child);
  });

  it('rolls back and restarts the known-good release when candidate migration fails', async () => {
    const f = await fixture();
    await release(join(f.runtime, 'releases/1.0.0'), '1.0.0');
    await release(join(f.runtime, 'releases/2.0.0'), '2.0.0', true);
    await symlink('releases/2.0.0', join(f.runtime, 'current'));
    await symlink('releases/1.0.0', join(f.runtime, 'previous'));
    await writeFile(join(f.runtime, 'update-state.json'), JSON.stringify({ phase: 'health-checking', attempts: 1, targetVersion: '2.0.0', taskId: 'upgrade-test', previousRelease: 'releases/1.0.0' }));
    const child = start(f);
    await waitUntil(async () => await version(f.port) === '1.0.0', child);
    const value = await state(join(f.runtime, 'update-state.json'));
    expect(value.phase).toBe('rolled-back');
    expect(value.rollbackAttempted).toBe(true);
  });
});
