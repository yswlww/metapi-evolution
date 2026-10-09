import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { oauthApi, parseNativeOAuthJson, pollOAuthSession, collectRouteUnits } from './oauthApi.ts';

test('OAuth page binds real provider selection and keeps feedback translation out of stored state', () => {
  const source = readFileSync(new URL('../OAuthManagement.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Select value=\{providerId\}/);
  assert.match(source, /\? connections\.find\(/);
  assert.doesNotMatch(source, /(?:flash|onFlash)\(t\(/);
  assert.doesNotMatch(source, /route-(?:merged|created)-/);
});

test('poll cleanup aborts pending authenticated requests without reporting cancellation as failure', async () => {
  const original = globalThis.fetch;
  let signal: AbortSignal | undefined;
  let errors = 0;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    signal = options?.signal ?? undefined;
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  try {
    const stop = pollOAuthSession('s', oauthApi.session, () => errors++, () => errors++);
    stop(); await new Promise(r => setTimeout(r, 2));
    assert.equal(signal?.aborted, true); assert.equal(errors, 0);
  } finally { globalThis.fetch = original; }
});

test('OAuth requests retain authenticated client timeout', async t => {
  const original = globalThis.fetch;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    assert.ok(options?.signal instanceof AbortSignal);
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  try {
    const pending = assert.rejects(oauthApi.start('codex', {}), /Request timed out after 30s/);
    t.mock.timers.tick(30_000);
    await pending;
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('OAuth requests inherit Bearer auth, expiry cleanup, and server error messages', async () => {
  const original = globalThis.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map([['metapi-auth-token', 'management-secret'], ['metapi-auth-expires-at', String(Date.now() + 60_000)]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) } });
  let authorization: string | null = null;
  globalThis.fetch = async (_url, options) => { authorization = new Headers(options?.headers).get('Authorization'); return new Response(JSON.stringify({ state: 's' })); };
  try {
    await oauthApi.start('codex', {});
    assert.equal(authorization, 'Bearer management-secret');
    stored.set('metapi-auth-expires-at', String(Date.now() - 1));
    await oauthApi.rebind(1, {});
    assert.equal(authorization, null); assert.equal(stored.has('metapi-auth-token'), false);
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'invalid callback state' }), { status: 400 });
    await assert.rejects(oauthApi.callback('s', 'http://localhost/'), /invalid callback state/);
    stored.set('metapi-auth-token', 'secret'); stored.set('metapi-auth-expires-at', String(Date.now() + 60_000));
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    await assert.rejects(oauthApi.session('s'), /Session expired/);
    assert.equal(stored.has('metapi-auth-token'), false);
  } finally { globalThis.fetch = original; if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete (globalThis as any).localStorage; }
});

test('batch file imports keep all original credentials under items', async () => {
  const original = globalThis.fetch;
  const items = [{ type: 'codex', tokens: { access_token: 'first' } }, { type: 'claude', access_token: 'second', refresh_token: 'refresh' }];
  let payload: any;
  globalThis.fetch = async (_url, options) => { payload = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ imported: 2, failed: 0, items: [] })); };
  try { await oauthApi.importBatch(items, { proxyUrl: null, useSystemProxy: false }); assert.deepEqual(payload, { items, proxyUrl: null, useSystemProxy: false }); }
  finally { globalThis.fetch = original; }
});

test('connection loading fetches every page and keeps server import failure summary', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const summary = { success: false, imported: 1, skipped: 0, failed: 1, items: [{ name: 'failed', status: 'failed', message: 'bad token' }] };
  globalThis.fetch = async url => {
    const path = String(url); calls.push(path);
    if (path.endsWith('/providers')) return new Response(JSON.stringify({ providers: [{ provider: 'codex' }] }));
    if (path.endsWith('/import')) return new Response(JSON.stringify(summary));
    const offset = Number(new URL(path, 'http://localhost').searchParams.get('offset'));
    return new Response(JSON.stringify({ items: [{ accountId: offset + 1 }], total: 2 }));
  };
  try {
    assert.equal((await oauthApi.data()).connections.length, 2);
    assert.ok(calls.includes('/api/oauth/connections?limit=100&offset=1'));
    assert.deepEqual(await oauthApi.import({ type: 'codex' }, {}), summary);
  } finally { globalThis.fetch = original; }
});

test('OAuth domain components do not import another top-level page or discard API responses through source adapters', () => {
  for (const name of ['oauthApi.ts', 'OAuthPanels.tsx', 'useOAuthText.ts']) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]\.\.\/[^/'"]+['"]/);
    assert.doesNotMatch(source, /from\s+['"][^'"]*lib\/source['"]/);
  }
});

test('session errors and transport failures terminate without retry loops', async () => {
  for (const transportFailure of [false, true]) {
    let reads = 0, terminal = 0;
    const stop = pollOAuthSession('s', async () => { reads++; if (transportFailure) throw new Error('network'); return { state: 's', status: 'error', error: 'expired' }; }, () => terminal++, () => terminal++, 1);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(reads, 1); assert.equal(terminal, 1); stop();
  }
});

test('route mutations send only supported contract fields and preserve server IDs', async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async (url, options) => { calls.push([String(url), options?.method, JSON.parse(String(options?.body))]); return new Response(JSON.stringify({ success: true, routeUnit: { id: 45 } })); };
  try {
    assert.equal((await oauthApi.createUnit({ accountIds: [1, 2], name: 'Pool', strategy: 'round_robin' })).routeUnit.id, 45);
    await oauthApi.updateUnit(45, { name: 'Updated', strategy: 'stick_until_unavailable' });
    assert.deepEqual(calls, [['/api/oauth/route-units', 'POST', { accountIds: [1, 2], name: 'Pool', strategy: 'round_robin' }], ['/api/oauth/route-units/45', 'PATCH', { name: 'Updated', strategy: 'stick_until_unavailable' }]]);
  } finally { globalThis.fetch = original; }
});

test('authorization responses retain state and callback metadata', async () => {
  const original = globalThis.fetch;
  const result = { state: 'a/b', authorizationUrl: 'https://example.com', instructions: { manualCallbackDelayMs: 0 } };
  const calls: string[] = [];
  globalThis.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify(result)); };
  try {
    assert.deepEqual(await oauthApi.start('codex', {}), result);
    assert.deepEqual(await oauthApi.rebind(3, {}), result);
    await oauthApi.callback('a/b', 'http://localhost/?code=x');
    assert.equal(calls[2], '/api/oauth/sessions/a%2Fb/manual-callback');
  } finally { globalThis.fetch = original; }
});

test('native credentials remain complete; unsupported arrays are rejected', () => {
  const data = { type: 'codex', tokens: { access_token: 'secret', refresh_token: 'refresh', id_token: 'id' }, account_id: 'account' };
  assert.deepEqual(parseNativeOAuthJson(JSON.stringify(data)), data);
  assert.throws(() => parseNativeOAuthJson('[]'));
  assert.throws(() => parseNativeOAuthJson('null'));
});

test('persisted route groups retain numeric IDs and membership', () => {
  const unit = { id: 8, kind: 'route_unit', name: 'Pool', strategy: 'round_robin' };
  assert.deepEqual(collectRouteUnits([{ accountId: 1, routeUnit: unit }, { accountId: 2, routeUnit: unit }]).map(u => [u.id, u.memberConnectionIds]), [['8', ['1', '2']]]);
});

test('poll completion stops scheduling and cleanup ignores late responses', async () => {
  let calls = 0, completed = 0;
  const stop = pollOAuthSession('s', async () => ({ state: 's', status: ++calls === 1 ? 'pending' : 'success' }), () => completed++, () => {}, 1);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(calls, 2); assert.equal(completed, 1); stop();
  let resolve!: (data: any) => void;
  const cancel = pollOAuthSession('s', () => new Promise(r => { resolve = r; }), () => completed++, () => completed++);
  cancel(); resolve({ status: 'success' });
  await new Promise(r => setTimeout(r, 5)); assert.equal(completed, 1);
});

test('model refresh surfaces nested failed or skipped result rather than stale success', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, refresh: { status: 'failed', errorMessage: 'discovery failed' } }));
  try { await assert.rejects(oauthApi.models(1, true), /discovery failed/); }
  finally { globalThis.fetch = original; }
});

test('model refresh checks upstream before reading; import sends original full payload', async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async (url, options) => { calls.push([String(url), options?.body ? JSON.parse(String(options.body)) : undefined]); return new Response(JSON.stringify({ success: true, models: [] })); };
  try {
    await oauthApi.models(7, true);
    await oauthApi.import({ type: 'codex', access_token: 'secret' }, { useSystemProxy: true });
    assert.deepEqual(calls, [['/api/models/check/7', {}], ['/api/accounts/7/models', undefined], ['/api/oauth/import', { data: { type: 'codex', access_token: 'secret' }, useSystemProxy: true }]]);
  } finally { globalThis.fetch = original; }
});
