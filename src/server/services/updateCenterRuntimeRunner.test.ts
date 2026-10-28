import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { verifyOrRollback, waitForHealthy } from '../../../scripts/release/runtimeRunner.mjs';

function makeRuntime() {
  const dataDir = mkdtempSync(join(tmpdir(), 'metapi-runner-'));
  const runtimeRoot = join(dataDir, 'runtime');
  const releasesDir = join(runtimeRoot, 'releases');
  mkdirSync(join(releasesDir, '1.4.2'), { recursive: true });
  mkdirSync(join(releasesDir, '1.5.0'), { recursive: true });
  symlinkSync(join('releases', '1.4.2'), join(runtimeRoot, 'previous'));
  symlinkSync(join('releases', '1.5.0'), join(runtimeRoot, 'current'));
  return {
    dataDir,
    paths: {
      statePath: join(runtimeRoot, 'update-state.json'),
      currentLink: join(runtimeRoot, 'current'),
      previousLink: join(runtimeRoot, 'previous'),
      releasesDir,
    },
  };
}

function writeState(path, state) {
  writeFileSync(path, JSON.stringify(state), 'utf8');
}

function readState(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readLink(linkPath) {
  return readlinkSync(linkPath);
}

describe('waitForHealthy', () => {
  it('returns true as soon as the probe answers', async () => {
    const probe = vi.fn().mockResolvedValue(true);
    await expect(waitForHealthy({ port: 4000, host: '127.0.0.1', timeoutMs: 5_000, intervalMs: 1, probe })).resolves.toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('returns false on timeout instead of assuming success', async () => {
    const probe = vi.fn().mockResolvedValue(false);
    await expect(waitForHealthy({ port: 4000, host: '127.0.0.1', timeoutMs: 20, intervalMs: 1, probe })).resolves.toBe(false);
    expect(probe.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('verifyOrRollback', () => {
  it('does nothing when the boot is not an unverified switch', async () => {
    const { paths } = makeRuntime();
    writeState(paths.statePath, { phase: 'idle' });

    const probe = vi.fn().mockResolvedValue(true);
    const result = await verifyOrRollback({ ...paths, port: 4000, host: '127.0.0.1', timeoutMs: 50, probe });

    expect(result).toEqual({ phase: 'idle', rolledBack: false, healthy: true });
    expect(probe).not.toHaveBeenCalled();
  });

  it('marks the upgrade completed when the new release is healthy', async () => {
    const { paths } = makeRuntime();
    writeState(paths.statePath, { phase: 'switching', attempts: 1, targetVersion: '1.5.0' });

    const result = await verifyOrRollback({
      ...paths, port: 4000, host: '127.0.0.1', timeoutMs: 200, intervalMs: 1,
      probe: vi.fn().mockResolvedValue(true),
    });

    expect(result.phase).toBe('completed');
    expect(result.rolledBack).toBe(false);
    expect(readState(paths.statePath).phase).toBe('completed');
  });

  it('rolls back once when the new release is unhealthy', async () => {
    const { paths } = makeRuntime();
    writeState(paths.statePath, { phase: 'health-checking', attempts: 1, targetVersion: '1.5.0' });

    const result = await verifyOrRollback({
      ...paths, port: 4000, host: '127.0.0.1', timeoutMs: 20, intervalMs: 1,
      probe: vi.fn().mockResolvedValue(false),
    });

    expect(result.phase).toBe('rolled-back');
    expect(result.rolledBack).toBe(true);
    const state = readState(paths.statePath);
    expect(state.phase).toBe('rolled-back');
    expect(state.error).toContain('rolled back');
  });

  it('refuses a second automatic rollback so the failure stays visible', async () => {
    const { paths } = makeRuntime();
    writeState(paths.statePath, { phase: 'health-checking', attempts: 2, targetVersion: '1.5.0' });

    const result = await verifyOrRollback({
      ...paths, port: 4000, host: '127.0.0.1', timeoutMs: 20, intervalMs: 1,
      probe: vi.fn().mockResolvedValue(false),
    });

    expect(result.phase).toBe('failed');
    expect(result.rolledBack).toBe(false);
    expect(readState(paths.statePath).error).toContain('automatic rollback disabled');
  });

  it('stays failed when there is no previous release to fall back to', async () => {
    const { paths } = makeRuntime();
    unlinkSync(paths.previousLink);
    writeState(paths.statePath, { phase: 'switching', attempts: 1 });

    const result = await verifyOrRollback({
      ...paths, port: 4000, host: '127.0.0.1', timeoutMs: 20, intervalMs: 1,
      probe: vi.fn().mockResolvedValue(false),
    });

    expect(result.phase).toBe('failed');
    expect(result.rolledBack).toBe(false);
    expect(readState(paths.statePath).error).toContain('no previous release');
  });
});
