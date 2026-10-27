#!/usr/bin/env node
/**
 * Stable runner for local runtime upgrades (#622).
 *
 * This file is the container's entrypoint and is deliberately tiny and
 * dependency-free: it lives in $DATA_DIR/runtime/runner/ and is never swapped
 * while a release is being swapped under it. It locates the active release via
 * the `current` symlink, boots it as a child process, proves the new version
 * actually serves traffic, and rolls back at most once if it does not.
 *
 * Kept as plain ESM JavaScript with no imports from src/ so that a broken
 * build of the app cannot prevent the runner from starting and repairing it.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, readlink, rename, rm, symlink, writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPDATE_STATE_FILENAME = 'update-state.json';
const HEALTH_ROUTE = '/api/desktop/health';
const UNVERIFIED_PHASES = new Set(['switching', 'health-checking']);
const DEFAULT_HEALTH_TIMEOUT_MS = 60_000;
const DEFAULT_HEALTH_INTERVAL_MS = 1_000;

function resolvePaths(dataDir) {
  const runtimeRoot = join(dataDir, 'runtime');
  return {
    runtimeRoot,
    releasesDir: join(runtimeRoot, 'releases'),
    currentLink: join(runtimeRoot, 'current'),
    previousLink: join(runtimeRoot, 'previous'),
    statePath: join(runtimeRoot, UPDATE_STATE_FILENAME),
    bootstrapDir: join(runtimeRoot, 'bootstrap'),
  };
}

async function readState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeState(statePath, patch) {
  const current = (await readState(statePath)) || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

async function readLinkTarget(linkPath) {
  try {
    return await readlink(linkPath);
  } catch {
    return null;
  }
}

async function switchSymlink(linkPath, target) {
  const temporary = `${linkPath}.tmp`;
  await rm(temporary, { force: true });
  await symlink(target, temporary);
  await rename(temporary, linkPath);
}

/**
 * First boot of a fresh container: adopt the image's own build as release
 * `0.0.0-bootstrap` and point `current` at it, so behaviour is identical to
 * today until an upgrade is actually performed.
 */
async function bootstrapRelease(paths, appRoot) {
  await mkdir(paths.releasesDir, { recursive: true });
  const releaseDir = join(paths.releasesDir, '0.0.0-bootstrap');
  await rm(releaseDir, { recursive: true, force: true });
  await symlink(resolve(appRoot), releaseDir);
  await switchSymlink(paths.currentLink, join('releases', '0.0.0-bootstrap'));
  return releaseDir;
}

function waitForChildExit(child) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      resolvePromise({ code, signal });
    };
    child.once('exit', finish);
    child.once('error', () => finish(null, null));
  });
}

async function isHealthy({ port, host, timeoutMs = DEFAULT_HEALTH_INTERVAL_MS }) {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${port}${HEALTH_ROUTE}`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(handle);
  }
}

/**
 * Poll the health route until it answers or the deadline passes. Returns true
 * only on a definitive OK — a timeout is a failure, never an assumption of
 * success.
 */
export async function waitForHealthy(options) {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
  const interval = options.intervalMs ?? DEFAULT_HEALTH_INTERVAL_MS;
  const probe = options.probe ?? isHealthy;
  while (Date.now() < deadline) {
    if (await probe({ port: options.port, host: options.host })) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/**
 * Decide whether the current boot is unverified and, if so, prove it works or
 * roll back exactly once.
 *
 * Returns the phase the machine ends up in so the caller can log it and the
 * test can assert it.
 */
export async function verifyOrRollback(options) {
  const {
    statePath,
    currentLink,
    previousLink,
    port,
    host,
    timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
    probe,
  } = options;

  const state = await readState(statePath);
  if (!state || !UNVERIFIED_PHASES.has(state.phase)) {
    return { phase: state?.phase ?? 'idle', rolledBack: false, healthy: true };
  }

  const healthy = await waitForHealthy({ port, host, timeoutMs, probe });
  if (healthy) {
    await writeState(statePath, { phase: 'completed', error: null });
    return { phase: 'completed', rolledBack: false, healthy: true };
  }

  const attempts = Number.isInteger(state.attempts) ? state.attempts : 0;
  if (attempts > 1) {
    // Second failure for the same target: refuse to loop. Stay failed and
    // visible rather than rolling back forever.
    await writeState(statePath, {
      phase: 'failed',
      error: 'new version failed its health check again; automatic rollback disabled',
    });
    return { phase: 'failed', rolledBack: false, healthy: false };
  }

  const previousTarget = await readLinkTarget(previousLink);
  if (!previousTarget) {
    await writeState(statePath, {
      phase: 'failed',
      error: 'new version failed its health check and no previous release is available',
    });
    return { phase: 'failed', rolledBack: false, healthy: false };
  }

  await switchSymlink(currentLink, previousTarget);
  await writeState(statePath, {
    phase: 'rolled-back',
    error: 'new version failed its health check; rolled back to previous release',
  });
  return { phase: 'rolled-back', rolledBack: true, healthy: false };
}

async function spawnApp(appDir, env) {
  const entry = join(appDir, 'dist', 'server', 'index.js');
  if (!existsSync(entry)) {
    throw new Error(`release is missing dist/server/index.js: ${entry}`);
  }
  return spawn(process.execPath, [entry], {
    cwd: appDir,
    stdio: 'inherit',
    env,
  });
}

/**
 * Run the release's migrations before the app starts, matching the old
 * `node dist/server/db/migrate.js && node dist/server/index.js` entrypoint.
 * A failure here must stop the boot rather than serve a half-migrated schema.
 */
async function runMigrations(appDir, env) {
  const script = join(appDir, 'dist', 'server', 'db', 'migrate.js');
  if (!existsSync(script)) return;
  const exit = await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script], { cwd: appDir, stdio: 'inherit', env });
    child.once('error', () => resolvePromise({ code: null, signal: null, failedToSpawn: true }));
    child.once('exit', (code, signal) => resolvePromise({ code, signal }));
  });
  if (exit.failedToSpawn) {
    throw new Error('failed to start the migration step');
  }
  if (exit.code !== 0) {
    throw new Error(`migration step exited with code ${exit.code ?? 'null'}`);
  }
}

export async function run(options = {}) {
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? './data';
  const appRoot = options.appRoot ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const port = Number(options.port ?? process.env.PORT ?? 4000);
  const host = options.host ?? '127.0.0.1';
  const paths = resolvePaths(dataDir);

  const currentTarget = await readLinkTarget(paths.currentLink);
  if (!currentTarget) {
    await bootstrapRelease(paths, appRoot);
    await writeState(paths.statePath, { phase: 'idle', attempts: 0 });
  }

  const activeTarget = await readLinkTarget(paths.currentLink);
  const appDir = resolve(paths.runtimeRoot, activeTarget ?? join('releases', '0.0.0-bootstrap'));

  await runMigrations(appDir, process.env);
  const child = await spawnApp(appDir, process.env);

  // Only verify a *switched* release; a normal boot is not a candidate.
  const state = await readState(paths.statePath);
  if (state && UNVERIFIED_PHASES.has(state.phase)) {
    const result = await verifyOrRollback({
      statePath: paths.statePath,
      currentLink: paths.currentLink,
      previousLink: paths.previousLink,
      port,
      host,
      probe: options.probe,
    });
    if (result.rolledBack) {
      // The failed release is still running; stop it so the restart picks up
      // the release we just pointed `current` back at.
      child.kill('SIGTERM');
      await waitForChildExit(child);
      process.exit(75);
    }
  }

  const exit = await waitForChildExit(child);
  if (exit.signal) {
    process.kill(process.pid, exit.signal);
    return exit;
  }
  process.exit(exit.code ?? 0);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  run().catch((error) => {
    console.error(`[runner] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
