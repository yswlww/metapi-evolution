import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api.js';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map([['auth_token', 'valid-admin'], ['auth_token_expires_at', String(Date.now() + 60_000)]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
const envelope = { method: 'POST', path: '/v1/chat/completions', requestKind: 'json', jsonBody: { model: 'fixture', messages: [] } } as const;

it.each([401, 403])('legacy proxy HTTP %s is not an administrator-session rejection', async (status) => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { type: 'upstream_error', message: 'upstream expired' } }), { status, headers: { 'Content-Type': 'application/json' } }));
  const response = await api.proxyTestStream(envelope);
  expect(response.status).toBe(status);
  expect(store.get('auth_token')).toBe('valid-admin');
});
it('keeps caller cancellation attached after stream response headers', async () => {
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => { signal = options.signal; return new Response('data: [DONE]\n\n'); });
  const controller = new AbortController();
  await api.proxyTestStream(envelope, controller.signal);
  controller.abort();
  expect(signal?.aborted).toBe(true);
});
it('rejects expired legacy credentials without leaving a timeout behind', async () => {
  vi.useFakeTimers();
  try {
    store.set('auth_token_expires_at', '1');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(api.proxyTestStream(envelope)).rejects.toThrow('Session expired');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
it('still clears a genuinely rejected administrator session', async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 403, headers: { 'x-metapi-admin-auth-failure': '1' } }));
  await expect(api.proxyTestStream(envelope)).rejects.toThrow('Session expired');
  expect(store.has('auth_token')).toBe(false);
});
