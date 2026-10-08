import { describe, expect, it } from 'vitest';
import { backupPreview, webdavPayload } from './backupParity';

describe('backup parity contracts', () => {
  it('preserves a stored password when the password draft is blank', () => {
    expect(webdavPayload({ enabled: true, fileUrl: 'https://dav.test/backup.json', username: 'u', password: '', clearPassword: false, exportType: 'all', autoSyncEnabled: true, autoSyncCron: '0 */6 * * *' })).not.toHaveProperty('password');
    expect(webdavPayload({ enabled: false, fileUrl: '', username: '', password: '', clearPassword: false, exportType: 'all', autoSyncEnabled: false, autoSyncCron: '' })).not.toHaveProperty('clearPassword');
  });
  it('clears a stored password only after explicit selection', () => {
    expect(webdavPayload({ enabled: true, fileUrl: '', username: '', password: '', clearPassword: true, exportType: 'accounts', autoSyncEnabled: false, autoSyncCron: '' })).toHaveProperty('clearPassword', true);
  });
  it('counts actual v2 accounts and preferences sections', () => {
    expect(backupPreview({version: '2.1', accounts: {sites: [{}], accounts: [{}, {}], accountTokens: [{}]}, preferences: {settings: [{}, {}]}})).toEqual({sections: ['sites', 'accounts', 'accountTokens', 'settings'], totalRecords: 6});
  });
  it('counts supported legacy rows but not ignored bookmark sections', () => {
    expect(backupPreview({version: '2.0', accounts: {accounts: [{site_url: 'https://a.test'}], bookmarks: [{}, {}]}, apiCredentialProfiles: {profiles: [{}]}})).toEqual({sections: ['accounts', 'apiCredentialProfiles'], totalRecords: 2});
    expect(backupPreview({data: {accounts: [{}, {}], proxies: [{}]}})).toEqual({sections: ['accounts', 'proxies'], totalRecords: 3});
  });
  it('rejects prototype and primitive backup envelopes', () => {
    expect(() => backupPreview({sections: []})).toThrow();
    expect(() => backupPreview(null)).toThrow();
  });
});
