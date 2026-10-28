#!/usr/bin/env node
// The supervisor is image-owned, not replaced by a downloaded release. Its only
// dependencies are built-ins and the shared, dependency-free runtime contract.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canAutoRollback, createUpdateState, isUnverifiedUpdatePhase } from '../../src/shared/localUpdateContract.js';
import {
  atomicWriteJson, finishLocalUpdateTask, readSymlinkIfPresent, readUpdateState,
  resolveLocalUpdatePaths, resolveRelease, sweepStagingDirs, switchSymlink, writeUpdateState,
} from '../../src/shared/localUpdateRuntime.js';

const HEALTH_ROUTE = '/api/desktop/health';
const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function probeHealth({ port, host, bootId, signal }) {
  try {
    const response = await fetch(`http://${host}:${port}${HEALTH_ROUTE}`, {
      signal: AbortSignal.any([AbortSignal.timeout(1000), ...(signal ? [signal] : [])]),
    });
    const body = await response.json();
    return response.ok && body.ok === true && (!bootId || body.runtimeBootId === bootId);
  } catch { return false; }
}

export async function waitForHealthy(options) {
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline && !options.signal?.aborted) {
    if (await (options.probe ?? probeHealth)(options)) return true;
    await pause(Math.min(options.intervalMs ?? 250, Math.max(0, deadline - Date.now())));
  }
  return false;
}

async function failOrRollback(paths, error) {
  const state = await readUpdateState(paths);
  const previous = state.previousRelease || await readSymlinkIfPresent(paths.previousLink);
  let reason = error;
  if (canAutoRollback(state) && previous) {
    try {
      await resolveRelease(paths, previous);
      // Persist the consumed rollback before changing a pointer. A reboot here
      // must never return to the failed candidate or consume another rollback.
      const rolledBack = await writeUpdateState(paths, {
        ...state, phase: 'rolled-back', rollbackAttempted: true,
        error: `${error}; rolled back to previous release`,
      });
      await switchSymlink(paths.currentLink, previous);
      await finishLocalUpdateTask(paths, rolledBack);
      return { phase: 'rolled-back', rolledBack: true, healthy: false };
    } catch (failure) { reason = `${error}; rollback failed: ${failure.message}`; }
  } else {
    reason += previous ? '; automatic rollback disabled' : '; no previous release is available';
  }
  const failed = await writeUpdateState(paths, { ...state, phase: 'failed', rollbackAttempted: true, error: reason });
  await finishLocalUpdateTask(paths, failed);
  return { phase: 'failed', rolledBack: false, healthy: false };
}

export async function verifyOrRollback(options) {
  const paths = { ...resolveLocalUpdatePaths(dirname(dirname(options.statePath))), ...options };
  const state = await readUpdateState(paths);
  if (!isUnverifiedUpdatePhase(state.phase)) return { phase: state.phase, rolledBack: false, healthy: true };
  if (await waitForHealthy(options)) {
    const completed = await writeUpdateState(paths, { ...state, phase: 'completed', error: null });
    await finishLocalUpdateTask(paths, completed);
    return { phase: 'completed', rolledBack: false, healthy: true };
  }
  return failOrRollback(paths, 'new version failed its health check');
}

function launch(command, args, cwd, env, ipc = false) {
  const child = spawn(command, args, { cwd, env, stdio: ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit' });
  const exited = new Promise(resolvePromise => {
    child.once('error', error => resolvePromise({ code: 1, error }));
    child.once('exit', (code, signal) => resolvePromise({ code: code ?? 1, signal }));
  });
  return { child, exited };
}

async function stopChild(active) {
  if (!active || active.child.exitCode !== null || active.child.signalCode !== null) return;
  active.child.kill('SIGTERM');
  let timer;
  await Promise.race([
    active.exited,
    new Promise(r => { timer = setTimeout(() => { active.child.kill('SIGKILL'); r(); }, 5000); }),
  ]);
  clearTimeout(timer);
  await active.exited;
}

async function bootstrap(paths, imageRoot) {
  await mkdir(paths.releasesDir, { recursive: true });
  const manifest = await readFile(join(imageRoot, 'runtime-manifest.json'), 'utf8').catch(() => '');
  const identity = manifest || await readFile(join(imageRoot, 'package.json'), 'utf8');
  const imageId = createHash('sha256').update(identity).digest('hex').slice(0, 20);
  let oldImageId;
  try { oldImageId = JSON.parse(await readFile(join(paths.runtimeRoot, 'image.json'), 'utf8')).id; } catch {}
  const current = await readSymlinkIfPresent(paths.currentLink);
  // An explicit image pull/recreate takes precedence over a persisted bundle.
  if (!current || (oldImageId && oldImageId !== imageId)) {
    const target = `releases/image-${imageId}`;
    const path = join(paths.runtimeRoot, target);
    await rm(path, { force: true });
    await symlink(imageRoot, path);
    await switchSymlink(paths.currentLink, target);
    await rm(paths.previousLink, { force: true });
    await writeUpdateState(paths, createUpdateState());
  }
  await atomicWriteJson(join(paths.runtimeRoot, 'image.json'), { id: imageId });
}

export async function run(options = {}) {
  const imageRoot = resolve(options.appRoot ?? process.env.METAPI_IMAGE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  const paths = resolveLocalUpdatePaths(dataDir);
  const port = Number(options.port ?? process.env.PORT ?? 4000);
  const timeoutMs = Number(process.env.METAPI_UPDATE_HEALTH_TIMEOUT_MS || 60_000);
  await bootstrap(paths, imageRoot);
  // Only the supervisor, before it starts an app, may recover interrupted work.
  await rm(paths.lockPath, { force: true });
  await sweepStagingDirs(paths);
  let state = await readUpdateState(paths);
  if (['resolving', 'downloading', 'verifying', 'staging'].includes(state.phase)) {
    state = await writeUpdateState(paths, { ...state, phase: 'failed', error: 'Upgrade interrupted before activation; running release was not changed.' });
    await finishLocalUpdateTask(paths, state);
  }
  if (state.phase === 'rolled-back' && state.previousRelease) {
    await switchSymlink(paths.currentLink, state.previousRelease);
  }
  let active;
  let stopping = false;
  let resolveStop;
  const stopped = new Promise(r => { resolveStop = r; });
  const stop = () => { stopping = true; resolveStop({ type: 'stop' }); void stopChild(active); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    while (!stopping) {
      state = await readUpdateState(paths);
      const unverified = isUnverifiedUpdatePhase(state.phase);
      try {
        if (unverified && state.targetRelease) {
          await resolveRelease(paths, state.targetRelease);
          await switchSymlink(paths.currentLink, state.targetRelease);
        }
        const target = await readSymlinkIfPresent(paths.currentLink);
        const appDir = await resolveRelease(paths, target);
        const node = existsSync(join(appDir, 'runtime/node')) ? join(appDir, 'runtime/node') : process.execPath;
        const pkg = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf8'));
        const env = {
          ...process.env, DATA_DIR: dataDir, PORT: String(port),
          METAPI_APP_VERSION: pkg.version, METAPI_LOCAL_UPDATE_RUNNER: '1',
          METAPI_RUNTIME_ROOT: paths.runtimeRoot, METAPI_RUNTIME_BOOT_ID: randomUUID(),
        };
        const migrate = join(appDir, 'dist/server/db/migrate.js');
        if (!existsSync(migrate)) throw new Error('Release is missing its migration entrypoint');
        active = launch(node, [migrate], appDir, env);
        const migrated = await active.exited;
        if (stopping) return 0;
        if (migrated.code !== 0) throw new Error(`Migration failed (exit ${migrated.code})`);
        const entry = join(appDir, 'dist/server/index.js');
        if (!existsSync(entry)) throw new Error('Release is missing its server entrypoint');
        active = launch(node, [entry], appDir, env, true);
        let activate;
        const activation = new Promise(r => { activate = r; });
        active.child.on('message', message => {
          if (message?.type === 'metapi:activate' && typeof message.taskId === 'string') activate(message);
        });
        if (unverified) {
          const controller = new AbortController();
          const healthy = await Promise.race([
            waitForHealthy({ port, host: '127.0.0.1', bootId: env.METAPI_RUNTIME_BOOT_ID, timeoutMs, intervalMs: 50, signal: controller.signal }),
            active.exited.then(() => false),
            stopped.then(() => false),
          ]);
          controller.abort();
          if (stopping) return 0;
          if (!healthy) throw new Error('New release failed its health check');
          const completed = await writeUpdateState(paths, { ...state, phase: 'completed', error: null });
          await finishLocalUpdateTask(paths, completed);
        }
        const event = await Promise.race([active.exited, activation, stopped]);
        if (stopping) return 0;
        if (event?.type === 'metapi:activate') {
          const next = await readUpdateState(paths);
          if (next.taskId !== event.taskId || !isUnverifiedUpdatePhase(next.phase)) throw new Error('Activation request does not match persisted upgrade');
          await stopChild(active);
          continue;
        }
        return event.code;
      } catch (error) {
        await stopChild(active);
        if (stopping) return 0;
        if (unverified) {
          const result = await failOrRollback(paths, error.message);
          if (result.rolledBack) continue;
        } else if (state.phase === 'rolled-back') {
          const failed = await writeUpdateState(paths, { ...state, phase: 'failed', error: `Previous release failed: ${error.message}` });
          await finishLocalUpdateTask(paths, failed);
        }
        console.error(`[runner] ${error.message}`);
        return 1;
      }
    }
    return 0;
  } finally {
    await stopChild(active);
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(code => { process.exitCode = code; }).catch(error => { console.error(`[runner] ${error.message}`); process.exitCode = 1; });
}
