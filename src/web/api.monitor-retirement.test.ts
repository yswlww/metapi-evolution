import { describe, expect, it } from 'vitest';
import { api } from './api.js';

describe('retired LDOH monitor API', () => {
  it('does not expose legacy config or session methods', () => {
    expect(api).not.toHaveProperty('getMonitorConfig');
    expect(api).not.toHaveProperty('updateMonitorConfig');
    expect(api).not.toHaveProperty('initMonitorSession');
  });
});
