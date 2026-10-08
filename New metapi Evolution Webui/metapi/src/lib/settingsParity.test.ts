import { describe, expect, it } from 'vitest';
import { databasePayload, finiteNumber, integerNumber, mergeSettingsDraft, settingsDirty, ROUTING_PRESETS, resolveRoutingProfilePreset } from './settingsParity';
import { createVisualPayloadRule, visualRulesToPayloadRules, payloadRulesToVisualRules, createCodexDefaultHighReasoningVisualPreset } from './settingsParityPayload';
import { deployPayload, rollbackPayload } from '../pages/about/updateCenterContract';

describe('maintenance parity contracts', () => {
  it('preserves explicit zero and rejects invalid numeric input', () => {
    expect(finiteNumber('0')).toBe(0);
    for (const value of ['', '-1', 'no', Infinity]) expect(() => finiteNumber(value)).toThrow();
  });
  it('enforces integer interval/queue controls and merges external saves without discarding dirty edits', () => {
    expect(integerNumber('0')).toBe(0);
    expect(() => integerNumber('1.5')).toThrow();
    expect(() => integerNumber('0', 1)).toThrow();
    expect(mergeSettingsDraft({cost: 2, flag: false}, {cost: 1, flag: false}, {cost: 3, flag: true})).toEqual({cost: 2, flag: true});
  });
  it('includes SSL and explicit overwrite only for migration', () => {
    const draft = {dialect: 'postgres' as const, connectionString: ' postgres://host/db ', ssl: true, overwrite: true};
    expect(databasePayload(draft)).toEqual({dialect: 'postgres', connectionString: 'postgres://host/db', ssl: true});
    expect(databasePayload(draft, true)).toHaveProperty('overwrite', true);
  });
  it('tracks nested edits and snapshots without rounding routing weights', () => {
    const saved = {routingWeights: {...ROUTING_PRESETS.stable}};
    const draft = structuredClone(saved);
    expect(settingsDirty(draft, saved)).toBe(false);
    draft.routingWeights.balanceWeight = 0.601;
    expect(settingsDirty(draft, saved)).toBe(true);
    expect(resolveRoutingProfilePreset(ROUTING_PRESETS.stable)).toBe('stable');
    expect(resolveRoutingProfilePreset(draft.routingWeights)).toBe('custom');
  });
  it('reuses the full visual payload contract including filter/raw actions', () => {
    const rows = [createVisualPayloadRule({modelPattern: '*', action: 'filter', path: 'temperature'}), createVisualPayloadRule({modelPattern: 'gpt-*', action: 'override-raw', protocol: 'codex', path: 'reasoning', value: '{"effort":"high"}', valueMode: 'json'})];
    const result = visualRulesToPayloadRules(rows);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(payloadRulesToVisualRules(result.value).map(({action, path, value}) => ({action, path, value}))).toEqual([
      {action: 'override-raw', path: 'reasoning', value: '{"effort":"high"}'}, {action: 'filter', path: 'temperature', value: ''},
    ]);
    expect(createCodexDefaultHighReasoningVisualPreset()[0]).toMatchObject({protocol: 'codex', path: 'reasoning.effort', value: 'high'});
  });
  it('rejects invalid raw JSON rules', () => {
    expect(visualRulesToPayloadRules([createVisualPayloadRule({modelPattern: '*', path: 'x', action: 'default-raw', value: '{'})]).success).toBe(false);
  });
  it('deploys the real Docker tag and immutable digest, not a display version', () => {
    expect(deployPayload('docker-hub-tag', {tagName: 'v1.4.2', displayVersion: 'Metapi 1.4.2', digest: 'sha256:abc'})).toEqual({source: 'docker-hub-tag', targetTag: 'v1.4.2', targetDigest: 'sha256:abc'});
    expect(() => deployPayload('github-release', {displayVersion: 'latest'})).toThrow();
  });
  it('rolls back only to an actual noncurrent history revision', () => {
    const status = {currentVersion: '1.4.2', helper: {revision: '8', history: [{revision: '7'}, {revision: '8'}]}};
    expect(rollbackPayload(status, '7')).toEqual({targetRevision: '7'});
    for (const revision of ['8', '1.4.2', '', 'unknown']) expect(() => rollbackPayload(status, revision)).toThrow();
  });
});
