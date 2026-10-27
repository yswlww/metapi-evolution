/**
 * Contract shared by the server, the legacy web UI and the Evolution UI for
 * local (in-container) runtime upgrades.
 *
 * Single source of truth for the phase vocabulary and the persisted
 * `update-state.json` shape. The runner, the server service and both UIs must
 * agree on these strings; drifting copies are how a failed upgrade ends up
 * looking like a successful one.
 *
 * Plain JS + a hand-written .d.ts, matching the other cross-target contracts
 * under src/shared (siteMaxConcurrency, platformCapabilities).
 */

/** Ordered phases of a single upgrade attempt. */
export const UPDATE_PHASES = Object.freeze([
  'idle',
  'resolving',
  'downloading',
  'verifying',
  'staging',
  'switching',
  'health-checking',
  'completed',
  'rolled-back',
  'failed',
]);

const PHASE_SET = new Set(UPDATE_PHASES);

/** Phases that mean work is still in flight. */
export const UPDATE_ACTIVE_PHASES = Object.freeze([
  'resolving',
  'downloading',
  'verifying',
  'staging',
  'switching',
  'health-checking',
]);

const ACTIVE_PHASE_SET = new Set(UPDATE_ACTIVE_PHASES);

/**
 * Phases from which a machine reboot may leave the runtime in an unverified
 * state. The runner treats these as "prove the new version works or roll back".
 */
export const UPDATE_UNVERIFIED_PHASES = Object.freeze([
  'switching',
  'health-checking',
]);

const UNVERIFIED_PHASE_SET = new Set(UPDATE_UNVERIFIED_PHASES);

/** Architectures the release workflow produces upgrade bundles for. */
export const UPDATE_SUPPORTED_ARCHES = Object.freeze(['x64', 'arm64']);

/** Filename of the persisted upgrade state inside `$DATA_DIR/runtime`. */
export const UPDATE_STATE_FILENAME = 'update-state.json';

export function isUpdatePhase(value) {
  return typeof value === 'string' && PHASE_SET.has(value);
}

export function isActiveUpdatePhase(value) {
  return typeof value === 'string' && ACTIVE_PHASE_SET.has(value);
}

export function isUnverifiedUpdatePhase(value) {
  return typeof value === 'string' && UNVERIFIED_PHASE_SET.has(value);
}

/**
 * Whether this process can upgrade itself.
 *
 * The release workflow only builds `amd64` and `arm64` bundles. Our Docker
 * image still supports armv7 (Node 22 is pinned precisely because Node 24+
 * dropped linux/arm/v7), so those users keep running and updating by pulling a
 * new image — we must say so rather than show a button that cannot work.
 *
 * @param {{ arch?: string, platform?: string, dataDirWritable?: boolean }} [input]
 * @returns {{ supported: boolean, reason: string | null, arch: string }}
 */
export function resolveSelfUpgradeSupport(input) {
  const source = input && typeof input === 'object' ? input : {};
  const arch = typeof source.arch === 'string' && source.arch.trim()
    ? source.arch.trim()
    : process.arch;
  const platform = typeof source.platform === 'string' && source.platform.trim()
    ? source.platform.trim()
    : process.platform;

  if (platform !== 'linux') {
    return {
      supported: false,
      reason: `local upgrades are Linux-only; this runtime is ${platform}`,
      arch,
    };
  }

  if (!UPDATE_SUPPORTED_ARCHES.includes(arch)) {
    return {
      supported: false,
      reason: `no upgrade bundle is published for ${arch}; pull a new image instead`,
      arch,
    };
  }

  if (source.dataDirWritable === false) {
    return {
      supported: false,
      reason: 'the data directory is not writable, so a release bundle cannot be staged',
      arch,
    };
  }

  return { supported: true, reason: null, arch };
}

/**
 * Build the persisted state record.
 *
 * `attempts` counts completed upgrade attempts for the *same* target version.
 * It exists so the runner can enforce "one automatic rollback, then stop":
 * automatic rollback is only allowed at attempt 1.
 *
 * @param {Partial<import('./localUpdateContract.d.ts').UpdateState>} [input]
 * @returns {import('./localUpdateContract.d.ts').UpdateState}
 */
export function createUpdateState(input) {
  const source = input && typeof input === 'object' ? input : {};
  const phase = isUpdatePhase(source.phase) ? source.phase : 'idle';
  return {
    phase,
    targetVersion: typeof source.targetVersion === 'string' ? source.targetVersion : null,
    previousVersion: typeof source.previousVersion === 'string' ? source.previousVersion : null,
    source: source.source === 'github-release' || source.source === 'docker-hub-tag'
      ? source.source
      : null,
    attempts: Number.isInteger(source.attempts) && source.attempts > 0 ? source.attempts : 0,
    startedAt: typeof source.startedAt === 'string' ? source.startedAt : null,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
    error: typeof source.error === 'string' ? source.error : null,
  };
}

/**
 * Whether the runner may roll back automatically.
 *
 * Exactly one automatic rollback per upgrade attempt. A crash loop that rolls
 * back forever hides the real failure; a failed upgrade that stays failed and
 * visible is the better outcome.
 *
 * @param {import('./localUpdateContract.d.ts').UpdateState} state
 * @returns {boolean}
 */
export function canAutoRollback(state) {
  const normalized = createUpdateState(state);
  if (!isUnverifiedUpdatePhase(normalized.phase)) return false;
  return normalized.attempts <= 1;
}
