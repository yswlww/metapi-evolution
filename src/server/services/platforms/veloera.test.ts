import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { VeloeraAdapter } from './veloera.js';

describe('VeloeraAdapter checkin', () => {
  let server: ReturnType<typeof createServer> | undefined;
  const requests: Array<{ method: string; url: string }> = [];

  afterEach(async () => {
    requests.length = 0;
    if (!server) return;
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  });

  async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
    return new Promise((resolve) => {
      server = createServer((req, res) => {
        requests.push({ method: req.method || 'GET', url: req.url || '/' });
        handler(req, res);
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server!.address() as AddressInfo;
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  it('uses the current check_in path and quota reward when the legacy checkin route is gone', async () => {
    const baseUrl = await start((req, res) => {
      if (req.url === '/api/user/checkin') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '404 page not found' }));
        return;
      }
      if (req.url === '/api/user/check_in' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'checked in', data: { quota: 250000 } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const result = await new VeloeraAdapter().checkin(baseUrl, 'session-token', 7);

    expect(result).toEqual({ success: true, message: 'checked in', reward: '250000' });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/user/checkin',
      'POST /api/user/check_in',
    ]);
  });
});
