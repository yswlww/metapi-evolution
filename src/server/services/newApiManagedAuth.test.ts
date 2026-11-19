import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { parseNewApiRefreshPayload, requestNewApiSessionRefresh } from './newApiManagedAuth.js';

describe('newApiManagedAuth', () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (!server) return;
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  });

  it('parses a rotated refresh cookie and unix-second expiry', () => {
    expect(parseNewApiRefreshPayload({
      success: true,
      data: { access_token: 'next-access', access_expires_at: 1_800_000_000 },
    }, 'old-refresh', ['new_api_refresh=rotated-refresh; Path=/api/user/auth; HttpOnly'])).toEqual({
      accessToken: 'next-access',
      refreshToken: 'rotated-refresh',
      tokenExpiresAt: 1_800_000_000_000,
    });
  });

  it('refreshes a short-lived dashboard session with the refresh cookie', async () => {
    const baseUrl = await new Promise<string>((resolve) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/api/user/auth/refresh' && req.headers.cookie === 'new_api_refresh=refresh-secret') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'new_api_refresh=rotated-refresh; Path=/api/user/auth; HttpOnly',
          });
          res.end(JSON.stringify({
            success: true,
            data: { access_token: 'next-access', access_expires_at: 1_800_000_000 },
          }));
          return;
        }
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'invalid refresh token' }));
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server!.address() as AddressInfo;
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });

    await expect(requestNewApiSessionRefresh({
      siteUrl: baseUrl,
      refreshToken: 'refresh-secret',
    })).resolves.toEqual({
      accessToken: 'next-access',
      refreshToken: 'rotated-refresh',
      tokenExpiresAt: 1_800_000_000_000,
    });
  });
});
