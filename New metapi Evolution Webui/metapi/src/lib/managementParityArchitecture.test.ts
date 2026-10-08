import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
test('management pages delegate modal families rather than importing top-level pages', () => {
  for (const page of ['Accounts', 'Sites', 'DownstreamKeys', 'Checkins']) {
    const source = read(`../pages/${page}.tsx`);
    assert.doesNotMatch(source, /from\s+["']\.\/(?:Accounts|Sites|DownstreamKeys|Checkins|OAuthManagement|Models|Routes)(?:\.tsx)?["']/g);
  }
  assert.doesNotMatch(read('../pages/DownstreamKeys.tsx'), /function KeyDrawer\(/);
  assert.match(read('../pages/DownstreamKeys.tsx'), /downstream-keys\/KeyDrawer/);
});
test('key weight-clear and administrator session contracts are connected to their actual save handlers', () => {
  assert.match(read('../pages/downstream-keys/KeyDrawer.tsx'), /siteWeightMultipliers:\s*parseSiteWeightDraft\(siteWeightsText\)/);
  const source = read('../pages/Accounts.tsx');
  assert.match(source, /const \{ token, login \} = useAuth\(\)/);
  assert.match(source, /await rotateAdminCredential\(newToken,/);
  assert.match(source, /\}, login\);/);
});
test('key editor offers only restrictions the backend persists, never fake scopes', () => {
  assert.doesNotMatch(read('../pages/downstream-keys/KeyDrawer.tsx'), /toggleScope|Object\.entries\(scopes\)/);
});
test('mobile key card has independent selection and the metadata/overview families remain extracted', () => {
  const source = read('../pages/DownstreamKeys.tsx');
  const mobile = source.slice(source.indexOf('{/* Mobile cards */}'));
  assert.match(mobile, /checked=\{selectedIds\.has\(key\.id\)\}/);
  assert.match(mobile, /onChange=\{\(\) => toggleSelected\(key\.id\)\}/);
  for (const family of ['KeyMetadata', 'KeyOverview']) assert.match(source, new RegExp(`downstream-keys/${family}`));
});
