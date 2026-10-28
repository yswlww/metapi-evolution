// Dependency-free filesystem primitives used by both the stable supervisor and
// the application. Keep durable state and link semantics identical across boots.
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readlink, readdir, realpath, rename, rm, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createUpdateState, isUpdatePhase, UPDATE_STATE_FILENAME } from './localUpdateContract.js';

export function resolveLocalUpdatePaths(dataDir) {
  const runtimeRoot = resolve(dataDir, 'runtime');
  return {
    runtimeRoot,
    releasesDir: join(runtimeRoot, 'releases'),
    currentLink: join(runtimeRoot, 'current'),
    previousLink: join(runtimeRoot, 'previous'),
    statePath: join(runtimeRoot, UPDATE_STATE_FILENAME),
    lockPath: join(runtimeRoot, 'upgrade.lock'),
    tasksDir: join(runtimeRoot, 'tasks'),
  };
}

export async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readUpdateState(paths) {
  try {
    const value = JSON.parse(await readFile(paths.statePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isUpdatePhase(value.phase)) throw new Error('invalid state');
    return createUpdateState(value);
  } catch (error) {
    if (error.code === 'ENOENT') return createUpdateState();
    return createUpdateState({ phase: 'failed', error: 'Upgrade state is unreadable; inspect runtime/update-state.json before retrying.' });
  }
}

export async function writeUpdateState(paths, state) {
  const next = createUpdateState({ ...state, updatedAt: new Date().toISOString() });
  await atomicWriteJson(paths.statePath, next);
  return next;
}

export async function readSymlinkIfPresent(path) {
  try { return await readlink(path); } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EINVAL') return null;
    throw error;
  }
}

export async function switchSymlink(path, target) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await symlink(target, temporary);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function resolveRelease(paths, target) {
  if (!target || isAbsolute(target)) throw new Error('Invalid runtime release pointer');
  const path = resolve(paths.runtimeRoot, target);
  const contained = relative(paths.releasesDir, path);
  if (!contained || contained.startsWith(`..${sep}`) || contained === '..' || isAbsolute(contained)) {
    throw new Error('Runtime release pointer escapes releases directory');
  }
  // A bootstrap release deliberately links to the immutable image tree.
  return realpath(path);
}

export async function readCurrentVersion(linkPath) {
  const target = await readSymlinkIfPresent(linkPath);
  if (!target) return null;
  try {
    const release = resolve(dirname(linkPath), target);
    const pkg = JSON.parse(await readFile(join(release, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return target.split('/').pop() || null;
  }
}

export async function sweepStagingDirs(paths) {
  const names = await readdir(paths.releasesDir).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const removed = names.filter(name => name.endsWith('.staging'));
  for (const name of removed) await rm(join(paths.releasesDir, name), { recursive: true, force: true });
  for (const name of await readdir(paths.runtimeRoot)) {
    if (/^metapi-evolution-.*\.tar\.gz\.download$/.test(name)) await rm(join(paths.runtimeRoot, name), { force: true });
  }
  return removed;
}

export function resolveLocalUpdateTaskPath(paths, id) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid update task id');
  const tasksDir = resolve(paths.tasksDir);
  const file = resolve(tasksDir, `${id}.json`);
  if (file !== tasksDir && !file.startsWith(tasksDir + sep)) throw new Error('Invalid update task id');
  return file;
}

const TASK_FILE_NAME = /^[a-zA-Z0-9-]{1,100}\.json$/;

/**
 * Locate a task file by name, using the directory listing rather than a path
 * built from request data. Returns null when the task does not exist.
 */
async function findTaskFile(paths, id) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return null;
  const wanted = `${id}.json`;
  let entries;
  try { entries = await readdir(paths.tasksDir); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const entry = entries.find(name => name === wanted && TASK_FILE_NAME.test(name));
  return entry ? join(paths.tasksDir, entry) : null;
}

export async function readLocalUpdateTask(paths, id) {
  const file = await findTaskFile(paths, id);
  if (!file) return null;
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function writeLocalUpdateTask(paths, task) {
  await atomicWriteJson(resolveLocalUpdateTaskPath(paths, task.id), task);
  return task;
}

export async function finishLocalUpdateTask(paths, state) {
  if (!state.taskId) return;
  // Update the file that was located by name, so the recorded task id (read
  // back from disk) is never used to build a path.
  const file = await findTaskFile(paths, state.taskId);
  if (!file) return;
  let task;
  try { task = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const success = state.phase === 'completed';
  const message = success ? `Activated ${state.targetVersion}` : state.error || state.phase;
  await atomicWriteJson(file, {
    ...task,
    status: success ? 'succeeded' : 'failed',
    error: success ? null : message,
    message,
    result: { phase: state.phase, version: state.targetVersion },
    updatedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    logs: [...(task.logs || []), { seq: (task.logs?.at(-1)?.seq || 0) + 1, message, createdAt: new Date().toISOString() }].slice(-200),
  });
}
