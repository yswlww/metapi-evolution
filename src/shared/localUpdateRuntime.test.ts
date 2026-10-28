import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readLocalUpdateTask,
  resolveLocalUpdatePaths,
  resolveLocalUpdateTaskPath,
  writeLocalUpdateTask,
} from './localUpdateRuntime.js';

describe('localUpdateRuntime task paths', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function paths() {
    const dataDir = mkdtempSync(join(tmpdir(), 'metapi-task-path-'));
    dirs.push(dataDir);
    return resolveLocalUpdatePaths(dataDir);
  }

  it('resolves a valid task id inside the tasks directory', () => {
    const p = paths();
    const file = resolveLocalUpdateTaskPath(p, 'abc-123');
    expect(file.startsWith(p.tasksDir + sep)).toBe(true);
    expect(file.endsWith(`${sep}abc-123.json`)).toBe(true);
  });

  it.each(['..', '../x', 'a/b', 'a\\b', '/etc/passwd', '', 'a'.repeat(101), 'a b', 'a.json'])(
    'rejects unsafe task id %j',
    (id) => {
      expect(() => resolveLocalUpdateTaskPath(paths(), id)).toThrow('Invalid update task id');
    },
  );

  it('returns null when reading with an unsafe id instead of touching the filesystem', async () => {
    await expect(readLocalUpdateTask(paths(), '../../package')).resolves.toBeNull();
  });

  it('round-trips a task through the resolved path', async () => {
    const p = paths();
    const task = {
      id: 'task-1', type: 'update-center.deploy', title: 't', status: 'running' as const,
      message: 'm', error: null, result: null, createdAt: '', updatedAt: '',
      startedAt: null, finishedAt: null, logs: [],
    };
    await writeLocalUpdateTask(p, task);
    expect(await readLocalUpdateTask(p, 'task-1')).toMatchObject({ id: 'task-1', status: 'running' });
  });
});
