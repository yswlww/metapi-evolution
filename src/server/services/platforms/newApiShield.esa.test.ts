import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NewApiAdapter } from './newApi.js';
import { fetchJsonWithShieldCookieRetry } from './newApiShield.js';

const html = '<html><head><meta content="challenge" name="aliyun_waf_aa"><meta name="aliyun_waf_bb" content="challenge"></head><body>Verify browser</body></html>';

describe('ESA browser challenge diagnostics', () => {
  let mode: 'all' | 'user-only' | 'models-only' | 'json' = 'all';
  beforeEach(() => { mode = 'all'; });
  const server = createServer((req, res) => {
    const json = (value: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (mode === 'json') return json({ content: html });
    if (mode === 'user-only' && req.url === '/v1/models') return json({ data: [] });
    if (mode === 'models-only' && req.url === '/api/user/self') {
      return json({ success: true, data: { id: 1, username: 'fixture', quota: 100, used_quota: 0 } });
    }
    if (mode === 'models-only' && req.url?.startsWith('/api/token')) return json({ success: true, data: [] });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  let baseUrl: string;
  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it('reports browser verification instead of silently returning null from cookie fetch', async () => {
    await expect(fetchJsonWithShieldCookieRetry(baseUrl)).rejects.toThrow(/ESA.*浏览器/);
  });
  it('returns an actionable login failure', async () => {
    const result = await new NewApiAdapter().login(baseUrl, 'fixture', 'fixture');
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/ESA.*浏览器/);
  });
  it('preserves the diagnostic during token verification', async () => {
    const result = await new NewApiAdapter().verifyToken(baseUrl, 'fixture');
    expect(result.tokenType).toBe('unknown');
    expect(result).toHaveProperty('message', expect.stringMatching(/ESA.*浏览器/));
  });
  it('preserves the diagnostic when only the session endpoint is challenged', async () => {
    mode = 'user-only';
    const result = await new NewApiAdapter().verifyToken(baseUrl, 'fixture', 1);
    expect(result).toMatchObject({ tokenType: 'unknown', message: expect.stringMatching(/ESA.*浏览器/) });
  });
  it('does not mistake challenge markup inside valid JSON for a browser challenge', async () => {
    mode = 'json';
    await expect(fetchJsonWithShieldCookieRetry(baseUrl)).resolves.toMatchObject({ data: { content: html } });
  });
  it('still accepts a working session when the model endpoint is challenged', async () => {
    mode = 'models-only';
    const result = await new NewApiAdapter().verifyToken(baseUrl, 'fixture', 1);
    expect(result).toMatchObject({ tokenType: 'session', userInfo: { username: 'fixture' } });
  });
  it('preserves the diagnostic during check-in', async () => {
    const result = await new NewApiAdapter().checkin(baseUrl, 'fixture', 1);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/ESA.*浏览器/);
  });
});
