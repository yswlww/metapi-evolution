import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
describe('maintenance parity baseline regressions', () => {
 it('supports queue wait, empty failure persistence and database SSL/overwrite', () => {
   const source = readFileSync(root + 'settings/SettingsAdvanced.tsx', 'utf8');
   expect(source).toContain('proxySessionChannelQueueWaitMs');
   expect(source).toContain('proxyEmptyContentFailEnabled:');
   expect(source).not.toContain('overwrite: false');
 });
 it('loads WebDAV and provides explicit password clearing', () => {
   const source = readFileSync(root + 'ImportExport.tsx', 'utf8');
   expect(source).toContain('getBackupWebdavConfig');
   expect(source).not.toContain('clearPassword: !webdavDraft.password');
 });
 it('selects historical revisions and exposes update configuration', () => {
   const source = readFileSync(root + 'About.tsx', 'utf8');
   expect(source).not.toContain('targetRevision: updateStatus?.currentVersion');
   expect(source).toContain('UpdateCenter');
 });
});
