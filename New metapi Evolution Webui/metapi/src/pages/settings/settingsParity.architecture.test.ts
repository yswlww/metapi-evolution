import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PROTOTYPE_DICTS } from '../../i18n/prototypeDicts';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = ['pages/Settings.tsx', 'pages/NotificationSettings.tsx', 'pages/ImportExport.tsx', 'pages/About.tsx',
  ...['pages/settings', 'pages/notifications', 'pages/about'].flatMap(directory => readdirSync(resolve(root, directory)).filter(name => /\.tsx?$/.test(name) && !name.includes('.test.')).map(name => directory + '/' + name)),
];
describe('settings parity architecture and localization', () => {
  it('all literal translation keys exist in every preserved language dictionary', () => {
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      for (const match of source.matchAll(/\bt\((['"])(ui\.[^'"]+)\1/g)) {
        for (const lang of ['en', 'zh-Hant', 'zh-Hans'] as const) expect(PROTOTYPE_DICTS[lang][match[2]], `${file}: ${lang}: ${match[2]}`).toBeTruthy();
      }
    }
  });
  it('domain components do not import orchestration pages or backend runtime modules', () => {
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source, file).not.toMatch(/from\s+['"][^'"]*\/(?:Settings|ImportExport|NotificationSettings|About)(?:\.tsx)?['"]/);
      expect(source, file).not.toMatch(/from\s+['"][^'"]*\/server\//);
    }
  });
  it('payload conversion and routing presets reuse the legacy pure owners', () => {
    const payload = readFileSync(resolve(root, 'lib/settingsParityPayload.ts'), 'utf8');
    const settings = readFileSync(resolve(root, 'lib/settingsParity.ts'), 'utf8');
    expect(payload).toContain('src/web/pages/settings/payloadRulesVisual');
    expect(settings).toContain('src/web/pages/helpers/routingProfiles');
    expect(payload).not.toContain('function visualRulesToPayloadRules');
    expect(settings).not.toContain('balanced: {');
  });
});
