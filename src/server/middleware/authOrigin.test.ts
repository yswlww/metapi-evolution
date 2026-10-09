import Fastify from 'fastify';
import { beforeEach, expect, it, vi } from 'vitest';
import { authMiddleware } from './auth.js';
import { config } from '../config.js';

vi.mock('../config.js', () => ({ config: { authToken: 'admin-secret', adminIpAllowlist: [] } }));
vi.mock('../services/downstreamApiKeyService.js', () => ({ authorizeDownstreamToken: vi.fn(), consumeManagedKeyRequest: vi.fn() }));
beforeEach(() => { config.adminIpAllowlist = []; });

it.each([
  [{}, 401],
  [{ authorization: 'Bearer invalid' }, 403],
] as const)('marks a rejected administrator request without changing its status', async (headers, status) => {
  const app = Fastify();
  app.addHook('preHandler', authMiddleware);
  app.get('/api/test/proxy', async () => ({ success: true }));
  try {
    const response = await app.inject({ method: 'GET', url: '/api/test/proxy', headers });
    expect(response.statusCode).toBe(status);
    expect(response.headers['x-metapi-admin-auth-failure']).toBe('1');
  } finally { await app.close(); }
});
it('marks an administrative IP rejection but leaves accepted requests unmarked', async () => {
  const app = Fastify();
  app.addHook('preHandler', authMiddleware);
  app.get('/api/test/proxy', async () => ({ success: true }));
  try {
    const allowed = await app.inject({ method: 'GET', url: '/api/test/proxy', headers: { authorization: 'Bearer admin-secret' } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['x-metapi-admin-auth-failure']).toBeUndefined();
    config.adminIpAllowlist = ['192.0.2.1'];
    const rejected = await app.inject({ method: 'GET', url: '/api/test/proxy', headers: { authorization: 'Bearer admin-secret' } });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.headers['x-metapi-admin-auth-failure']).toBe('1');
  } finally { await app.close(); }
});
