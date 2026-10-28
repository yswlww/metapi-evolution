import { describe, expect, it } from 'vitest';

import {
  canAutoRollback,
  createUpdateState,
  isActiveUpdatePhase,
  isUnverifiedUpdatePhase,
  isUpdatePhase,
  resolveSelfUpgradeSupport,
  UPDATE_PHASES,
  UPDATE_SUPPORTED_ARCHES,
} from './localUpdateContract.js';

describe('localUpdateContract phases', () => {
  it('recognises only declared phases', () => {
    for (const phase of UPDATE_PHASES) {
      expect(isUpdatePhase(phase)).toBe(true);
    }
    expect(isUpdatePhase('deploying')).toBe(false);
    expect(isUpdatePhase('')).toBe(false);
    expect(isUpdatePhase(null)).toBe(false);
    expect(isUpdatePhase(undefined)).toBe(false);
  });

  it('treats switching and health-checking as the unverified windows', () => {
    expect(isUnverifiedUpdatePhase('switching')).toBe(true);
    expect(isUnverifiedUpdatePhase('health-checking')).toBe(true);
    for (const phase of ['idle', 'downloading', 'completed', 'rolled-back', 'failed'] as const) {
      expect(isUnverifiedUpdatePhase(phase)).toBe(false);
    }
  });

  it('does not treat terminal phases as active', () => {
    expect(isActiveUpdatePhase('downloading')).toBe(true);
    for (const phase of ['completed', 'rolled-back', 'failed', 'idle'] as const) {
      expect(isActiveUpdatePhase(phase)).toBe(false);
    }
  });
});

describe('resolveSelfUpgradeSupport', () => {
  it('supports the architectures the release workflow builds for', () => {
    for (const arch of UPDATE_SUPPORTED_ARCHES) {
      expect(resolveSelfUpgradeSupport({ arch, platform: 'linux', dataDirWritable: true })).toEqual({
        supported: true,
        reason: null,
        arch,
      });
    }
  });

  it('refuses armv7 and explains why, rather than hiding the control', () => {
    const result = resolveSelfUpgradeSupport({ arch: 'arm', platform: 'linux', dataDirWritable: true });
    expect(result.supported).toBe(false);
    expect(result.arch).toBe('arm');
    expect(result.reason).toContain('arm');
  });

  it('refuses non-Linux runtimes', () => {
    const result = resolveSelfUpgradeSupport({ arch: 'x64', platform: 'win32', dataDirWritable: true });
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('win32');
  });

  it('refuses when the data directory cannot be written', () => {
    const result = resolveSelfUpgradeSupport({ arch: 'x64', platform: 'linux', dataDirWritable: false });
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('not writable');
  });
});

describe('createUpdateState', () => {
  it('falls back to idle with empty fields for junk input', () => {
    expect(createUpdateState(undefined)).toEqual({
      phase: 'idle',
      targetVersion: null,
      previousVersion: null,
      source: null,
      attempts: 0,
      startedAt: null,
      updatedAt: null,
      error: null,
    });
    expect(createUpdateState({ phase: 'nonsense' as never }).phase).toBe('idle');
  });

  it('keeps a valid phase and rejects a negative attempt count', () => {
    const state = createUpdateState({ phase: 'switching', attempts: -3, targetVersion: '1.5.0' });
    expect(state.phase).toBe('switching');
    expect(state.attempts).toBe(0);
    expect(state.targetVersion).toBe('1.5.0');
  });
});

describe('canAutoRollback', () => {
  it('allows exactly one automatic rollback', () => {
    expect(canAutoRollback(createUpdateState({ phase: 'switching', attempts: 1 }))).toBe(true);
    expect(canAutoRollback(createUpdateState({ phase: 'health-checking', attempts: 1 }))).toBe(true);
  });

  it('refuses a second automatic rollback so a crash loop stays visible', () => {
    expect(canAutoRollback(createUpdateState({ phase: 'switching', attempts: 2 }))).toBe(false);
  });

  it('never rolls back outside the unverified window', () => {
    expect(canAutoRollback(createUpdateState({ phase: 'completed', attempts: 1 }))).toBe(false);
    expect(canAutoRollback(createUpdateState({ phase: 'idle', attempts: 0 }))).toBe(false);
    expect(canAutoRollback(createUpdateState({ phase: 'failed', attempts: 1 }))).toBe(false);
  });
});
