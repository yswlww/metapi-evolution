import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Sub2ApiAdapter } from './sub2api.js';

/**
 * Real Sub2API upstreams answer with a string envelope code
 * (`{"code":"UNAUTHORIZED","message":"..."}`), not a numeric one. The parser
 * previously required a number and threw "Invalid response format", which the
 * caller swallowed — so a Sub2API site showed no models and no error at all.
 */
describe('Sub2API envelope codes', () => {
  const server = createServer((req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/v1/models') {
      json(200, { object: 'list', data: [{ id: 'sub2-model' }] });
      return;
    }
    if (req.url === '/api/v1/auth/me') {
      // String success code, as the real upstream returns.
      json(200, { code: 'OK', data: { id: 5, username: 'fixture', email: 'a@b.c', balance: 1 } });
      return;
    }
    if (req.url === '/api/v1/keys?page=1&page_size=100') {
      json(200, { code: 0, data: { items: [] } });
      return;
    }
    json(401, { code: 'UNAUTHORIZED', message: 'Authorization header is required' });
  });
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('discovers models from a Sub2API-style upstream', async () => {
    expect(await new Sub2ApiAdapter().getModels(base, 'sk-fixture')).toEqual(['sub2-model']);
  });

  it('treats a string success code as success for management calls', async () => {
    const user = await new Sub2ApiAdapter().getUserInfo(base, 'sk-fixture');
    expect(user).not.toBeNull();
    expect(user?.username).toBe('fixture');
  });

  it('surfaces the upstream message for a non-success string code', async () => {
    // Point at a path the server rejects with a string error code.
    const adapter = new Sub2ApiAdapter() as unknown as {
      fetchJson: <T>(url: string, init?: unknown) => Promise<T>;
      parseSub2ApiEnvelope: <T>(body: unknown, endpoint: string) => T;
    };
    expect(() => adapter.parseSub2ApiEnvelope({ code: 'UNAUTHORIZED', message: 'Authorization header is required' }, '/x'))
      .toThrow(/Authorization header is required/);
  });
});
