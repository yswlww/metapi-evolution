import test from 'node:test';
import assert from 'node:assert/strict';
import * as parity from './managementParity.ts';
import { buildPolicyRestrictions, buildAccountEditPayload, buildTokenEditPayload, buildOrderUpdates, filterTokens, buildCredentialOptions, buildSchedulePayload, checkinDiagnostics, batchOutcome, matchesTags } from './managementParity.ts';

test('site weights clearing sends an empty object and invalid JSON cannot silently preserve old values', () => {
  assert.equal(typeof parity.parseSiteWeightDraft, 'function');
  assert.deepEqual(parity.parseSiteWeightDraft(''), {});
  assert.deepEqual(parity.parseSiteWeightDraft('{"2": 0.5}'), { '2': 0.5 });
  for (const input of ['{', '[]', 'null', '{"2": -1}', '{"2": "1"}']) assert.throws(() => parity.parseSiteWeightDraft(input));
});
test('admin credential rotation persists the new session only after backend acceptance', async () => {
  assert.equal(typeof parity.rotateAdminCredential, 'function');
  const events: string[] = [];
  await parity.rotateAdminCredential(' new-key ', async token => { events.push(`save:${token}`); }, token => events.push(`login:${token}`));
  assert.deepEqual(events, ['save:new-key', 'login:new-key']);
  await assert.rejects(() => parity.rotateAdminCredential('next', async () => { throw new Error('rejected'); }, () => events.push('unexpected')));
  assert.deepEqual(events, ['save:new-key', 'login:new-key']);
});
test('clearing downstream restrictions sends explicit empty arrays including credentials', () => {
  assert.deepEqual(buildPolicyRestrictions([], [], []), { allowedRouteIds: [], excludedSiteIds: [], excludedCredentialRefs: [] });
});
test('excluded credential choices distinguish explicit token and default API key without exposing secrets', () => {
  const options = buildCredentialOptions([{ id: 3, siteId: 2, username: 'u', apiToken: 'secret' }], [{ id: 8, accountId: 3, name: 't', account: { id: 3 }, site: { id: 2 } }]);
  assert.deepEqual(options.map(o => o.ref), [{ kind: 'account_token', siteId: 2, accountId: 3, tokenId: 8 }, { kind: 'default_api_key', siteId: 2, accountId: 3 }]);
  assert.ok(!JSON.stringify(options).includes('secret'));
});
test('account edits clear optional values but preserve unchanged secret fields', () => {
  const result = buildAccountEditPayload({ username: ' u ', status: 'active', checkinEnabled: false, unitCost: '', proxyUrl: '', isPinned: true, sortOrder: '2', accessToken: '', apiToken: '', refreshToken: '', tokenExpiresAt: '' });
  assert.equal(result.unitCost, null); assert.equal(result.proxyUrl, null); assert.equal(result.sortOrder, 2);
  assert.ok(!('accessToken' in result)); assert.ok(!('apiToken' in result));
});
test('explicit account credential clearing supports switching away from a session without blank-field data loss', () => {
  const result = buildAccountEditPayload({ username: 'u', status: 'active', checkinEnabled: false, unitCost: '', proxyUrl: '', isPinned: false, sortOrder: '0', accessToken: '', apiToken: '', refreshToken: '', tokenExpiresAt: '', clearAccessToken: true, clearApiToken: true, clearRefreshToken: true });
  assert.equal(result.accessToken, ''); assert.equal(result.apiToken, null); assert.equal(result.refreshToken, null); assert.equal(result.tokenExpiresAt, null);
});
test('token edit keeps secret when blank and permits clearing group', () => {
  assert.deepEqual(buildTokenEditPayload({ name: ' a ', token: '', group: '', enabled: true, isDefault: false }), { name: 'a', group: '', enabled: true, isDefault: false });
  assert.throws(() => buildTokenEditPayload({ name: 'a', token: '', group: '', enabled: true, isDefault: false }, true));
});
test('custom reordering preserves pin partition and produces nonnegative integer order', () => {
  const rows = [{ id: 1, isPinned: true, sortOrder: 0 }, { id: 2, sortOrder: 0 }, { id: 3, sortOrder: 1 }];
  assert.deepEqual(buildOrderUpdates(rows, 2, 'up'), []);
  assert.deepEqual(buildOrderUpdates(rows, 3, 'up'), [{ id: 3, sortOrder: 0 }, { id: 2, sortOrder: 1 }]);
});
test('token search and filters use group, account, site and value status', () => {
  const rows = [{ id: 1, tokenGroup: 'team', enabled: true, accountId: 2, account: { username: 'alice' }, site: { name: 'edge' } }, { id: 2, tokenGroup: 'other', enabled: false, accountId: 3 }];
  assert.deepEqual(filterTokens(rows, { query: 'edge', status: 'enabled', accountId: '2', group: 'team' }).map(x => x.id), [1]);
  assert.deepEqual(filterTokens(rows, { query: '', status: 'disabled', accountId: '', group: '' }).map(x => x.id), [2]);
});
test('interval schedule retains its mode and rejects zero or invalid hours', () => {
  assert.deepEqual(buildSchedulePayload('interval', 'unused', '6'), { mode: 'interval', intervalHours: 6 });
  assert.throws(() => buildSchedulePayload('interval', '', '0'));
  assert.throws(() => buildSchedulePayload('interval', '', '25'));
  assert.throws(() => buildSchedulePayload('interval', '', '1.5'));
  assert.deepEqual(buildSchedulePayload('cron', ' 0 8 * * * ', ''), { mode: 'cron', cron: '0 8 * * *' });
});
test('structured checkin diagnostics preserve code, category, action and original message', () => {
  assert.deepEqual(checkinDiagnostics({ code: 'auth', category: 'credential', title: 'Expired', detailHint: '401', actionHint: 'Rebind' }, 'raw'), { code: 'auth', category: 'credential', title: 'Expired', detailHint: '401', actionHint: 'Rebind', message: 'raw' });
});
test('batch partial failures remain selected and do not imply all succeeded', () => {
  assert.deepEqual(batchOutcome({ successIds: [1], failedItems: [{ id: 2, message: 'denied' }] }), { succeeded: 1, failedIds: [2], messages: ['2: denied'] });
});
test('tag filtering supports any and all case-insensitively', () => {
  assert.equal(matchesTags(['Prod', 'Team'], ['prod', 'other'], 'all'), false);
  assert.equal(matchesTags(['Prod', 'Team'], ['prod', 'other'], 'any'), true);
});
