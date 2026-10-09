export class SettingsInputError extends Error {}
export { ROUTING_PROFILE_PRESETS as ROUTING_PRESETS, resolveRoutingProfilePreset } from '../../../../src/web/pages/helpers/routingProfiles';
export type DatabaseDraft = { dialect: 'sqlite' | 'mysql' | 'postgres'; connectionString: string; ssl: boolean; overwrite: boolean };
export function databasePayload(draft: DatabaseDraft, migration = false) {
  return {dialect: draft.dialect, connectionString: draft.connectionString.trim(), ssl: draft.ssl, ...(migration ? {overwrite: draft.overwrite} : {})};
}
export function finiteNumber(value: unknown, minimum = 0): number {
  if (value === '' || value === null || value === undefined) throw new SettingsInputError('A number is required');
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum) throw new SettingsInputError('Invalid numeric value');
  return result;
}
export function integerNumber(value: unknown, minimum = 0): number {
  const result = finiteNumber(value, minimum);
  if (!Number.isInteger(result)) throw new SettingsInputError('An integer is required');
  return result;
}
export function mergeSettingsDraft(draft: Record<string, unknown> | null, saved: Record<string, unknown> | null, next: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(next);
  if (draft && saved) for (const key of Object.keys(draft)) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key])) result[key] = structuredClone(draft[key]);
  }
  return result;
}
export function settingsDirty(draft: unknown, saved: unknown): boolean { return JSON.stringify(draft) !== JSON.stringify(saved); }
