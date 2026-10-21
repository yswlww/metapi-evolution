import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiResponse } from './client';
import Fastify from 'fastify';

afterEach(() => vi.unstubAllGlobals());

const mutations = [
  ['POST', apiPost], ['PUT', apiPut], ['PATCH', apiPatch], ['DELETE', apiDelete],
] as const;

describe('JSON mutation transport against the real server parser', () => {
  it.each(mutations)('%s without a body does not declare empty JSON and retains caller headers', async (method, request) => {
    const app = Fastify();
    app.route({ method, url: '/api/empty', handler: async req => ({ success: true, bodyReceived: req.body !== undefined, fixture: req.headers['x-fixture'] }) });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const response = await app.inject({ method, url, headers: Object.fromEntries(new Headers(init.headers)), payload: init.body as string | undefined });
      return new Response(response.body, { status: response.statusCode, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      await expect(request('/api/empty', undefined, { headers: new Headers({ 'X-Fixture': 'retained' }) })).resolves.toEqual({ success: true, bodyReceived: false, fixture: 'retained' });
    } finally { await app.close(); }
  });

  it.each(mutations)('%s still serializes and declares JSON bodies and retains caller headers', async (method, request) => {
    const app = Fastify();
    app.route({ method, url: '/api/json', handler: async req => ({ body: req.body, type: req.headers['content-type'], fixture: req.headers['x-fixture'] }) });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const response = await app.inject({ method, url, headers: Object.fromEntries(new Headers(init.headers)), payload: init.body as string | undefined });
      return new Response(response.body, { status: response.statusCode, headers: { 'Content-Type': 'application/json' } });
    });
    try {
      for (const body of [{ read: true }, {}, [], false, 0, null]) {
        await expect(request('/api/json', body, { headers: { 'X-Fixture': 'retained' } })).resolves.toEqual({ body, type: 'application/json', fixture: 'retained' });
      }
    } finally { await app.close(); }
  });
});

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
