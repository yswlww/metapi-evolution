export type UpdatePhase =
  | 'idle'
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'staging'
  | 'switching'
  | 'health-checking'
  | 'completed'
  | 'rolled-back'
  | 'failed';

export type UpdateSourceKind = 'github-release' | 'docker-hub-tag';

export type UpdateState = Readonly<{
  phase: UpdatePhase;
  targetVersion: string | null;
  previousVersion: string | null;
  source: UpdateSourceKind | null;
  /** Completed attempts for this same target; gates automatic rollback. */
  attempts: number;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
  taskId?: string;
  operation?: 'deploy' | 'rollback';
  targetRelease?: string;
  previousRelease?: string;
  rollbackAttempted?: boolean;
}>;

export type SelfUpgradeSupport = Readonly<{
  supported: boolean;
  reason: string | null;
  arch: string;
  reasonCode?: 'unsupported-platform' | 'unsupported-arch' | 'read-only-runtime' | 'runner-required';
}>;

export declare const UPDATE_PHASES: readonly UpdatePhase[];
export declare const UPDATE_ACTIVE_PHASES: readonly UpdatePhase[];
export declare const UPDATE_UNVERIFIED_PHASES: readonly UpdatePhase[];
export declare const UPDATE_SUPPORTED_ARCHES: readonly string[];
export declare const UPDATE_STATE_FILENAME: string;

export declare function normalizeLocalUpdateVersion(value: unknown): string;
export declare function toLocalBundleArch(arch: string): string;
export declare function localUpdateBundleFilename(version: string, arch: string): string;
export declare function isLocalUpdateReleaseTag(value: unknown): value is string;
export declare function isUpdatePhase(value: unknown): value is UpdatePhase;
export declare function isActiveUpdatePhase(value: unknown): value is UpdatePhase;
export declare function isUnverifiedUpdatePhase(value: unknown): value is UpdatePhase;
export declare function resolveSelfUpgradeSupport(input?: {
  arch?: string;
  platform?: string;
  dataDirWritable?: boolean;
}): SelfUpgradeSupport;
export declare function createUpdateState(input?: Partial<UpdateState>): UpdateState;
export declare function canAutoRollback(state: UpdateState): boolean;
