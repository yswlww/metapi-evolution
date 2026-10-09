import { describe, expect, it } from 'vitest';
import { ADMIN_AUTH_FAILURE_HEADER, shouldClearAdminSession } from './adminAuthFailure.js';

describe('administrator versus proxy authentication failures', () => {
  it('preserves valid administrator sessions on proxy-origin 401 and 403', () => {
    for (const status of [401, 403]) {
      expect(shouldClearAdminSession('/api/test/proxy/stream', status, null)).toBe(false);
      expect(shouldClearAdminSession('/api/test/chat', status, null)).toBe(false);
      expect(shouldClearAdminSession('/v1/files/one/content', status, null)).toBe(false);
    }
  });
  it('clears explicitly marked administrator rejections even on proxy tests', () => {
    expect(ADMIN_AUTH_FAILURE_HEADER).toBe('x-metapi-admin-auth-failure');
    expect(shouldClearAdminSession('/api/test/proxy?mode=json', 403, '1')).toBe(true);
    expect(shouldClearAdminSession('/api/settings/runtime', 401, null)).toBe(true);
    expect(shouldClearAdminSession('/api/events', 403, null)).toBe(true);
    expect(shouldClearAdminSession('/api/test/proxy', 500, '1')).toBe(false);
  });
});
