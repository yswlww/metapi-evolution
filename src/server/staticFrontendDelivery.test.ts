import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';

const webDir = mkdtempSync(join(tmpdir(), 'metapi-static-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>root</title>');
writeFileSync(join(webDir, 'index-abc123.js'), 'export default 1;');

/**
 * Mirrors the cache-header callback registered in `src/server/index.ts`.
 * `@fastify/static` passes the Fastify reply, whose `setHeader` does not exist;
 * calling it throws inside the static handler, turning every asset and the SPA
 * fallback into a 500 and crashing the process so the packaged UI never loads.
 */
function setCacheHeader(reply: { header?: (name: string, value: string) => unknown }, filePath: string) {
  const normalizedPath = normalize(filePath);
  const apply = (value: string) => {
    if (typeof reply.header === 'function') reply.header('Cache-Control', value);
    else (reply as unknown as import('node:http').ServerResponse).setHeader('Cache-Control', value);
  };
  if (normalizedPath.includes(`${sep}assets${sep}`)) {
    apply('public, max-age=31536000, immutable');
    return;
  }
  if (normalizedPath.endsWith(`${sep}index.html`)) apply('no-cache');
}

describe('static frontend delivery', () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      wildcard: false,
      setHeaders: setCacheHeader as never,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the entry document with an explicit cache policy instead of throwing', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('root');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves files with an explicit cache policy instead of throwing', async () => {
    const response = await app.inject({ method: 'GET', url: '/index-abc123.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBeDefined();
  });
});