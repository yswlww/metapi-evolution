import { describe, expect, it } from 'vitest';
import { frontendEntryForPath } from './frontendEntry.js';

describe('dual frontend SPA fallback', () => {
  it('serves the reference frontend for legacy deep links', () => {
    expect(frontendEntryForPath('/legacy/accounts?segment=tokens')).toBe('legacy/index.html');
    expect(frontendEntryForPath('/legacy')).toBe('legacy/index.html');
    expect(frontendEntryForPath('/app/routes')).toBe('index.html');
  });
  it('does not hide missing API or static asset responses with an HTML app', () => {
    for (const path of ['/api', '/api/missing', '/v1', '/v1/models', '/monitor-proxy/missing', '/assets/missing.js', '/legacy/assets/missing.js']) {
      expect(frontendEntryForPath(path)).toBe(null);
    }
  });
});
