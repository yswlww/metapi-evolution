import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost, apiResponse } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('API cancellation', () => {
  it.each([401, 403])('does not expire a valid administrator for upstream HTTP %s', async (status) => {
    const values = new Map([['metapi-auth-token', 'valid-admin'], ['metapi-auth-expires-at', String(Date.now() + 60_000)]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { type: 'upstream_error', message: 'upstream expired' } }), { status, headers: { 'Content-Type': 'application/json' } }));
    const response = await apiResponse('/api/test/proxy/stream');
    expect(response.status).toBe(status);
    expect(values.get('metapi-auth-token')).toBe('valid-admin');
    await expect(apiPost('/api/test/proxy', {})).rejects.toThrow('upstream expired');
    expect(values.get('metapi-auth-token')).toBe('valid-admin');
  });
  it('shares authenticated response handling without breaking stream cancellation after headers', async () => {
    const values = new Map([['metapi-auth-token', 'stream-token'], ['metapi-auth-expires-at', String(Date.now() + 60_000)]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    const controller = new AbortController();
    let options: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { options = init; return new Response('captured failure', { status: 418 }); });
    const response = await apiResponse('/api/test/proxy/stream', { signal: controller.signal, method: 'POST' });
    expect(response.status).toBe(418);
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer stream-token');
    controller.abort();
    expect(options?.signal?.aborted).toBe(true);
  });
  it('rejects missing stream credentials before sending a request', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiResponse('/api/test/proxy/stream')).rejects.toThrow('Session expired');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('propagates a caller cancellation rather than waiting for the timeout', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const controller = new AbortController();
    controller.abort();
    let forwarded: AbortSignal | undefined;
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      forwarded = options.signal as AbortSignal;
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await apiGet('/api/example', { signal: controller.signal });
    expect(forwarded?.aborted).toBe(true);
  });
});
