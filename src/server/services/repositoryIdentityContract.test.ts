import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('repositoryIdentityContract', () => {
  const rootDir = resolve(__dirname, '../../../');

  it('verifies package.json points to yswlww/metapi-evolution and version 1.4.0', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
    expect(pkg.version).toBe('1.4.0');
    expect(pkg.repository?.url).toBe('https://github.com/yswlww/metapi-evolution.git');
    expect(pkg.bugs?.url).toBe('https://github.com/yswlww/metapi-evolution/issues');
    expect(pkg.homepage).toBe('https://github.com/yswlww/metapi-evolution#readme');
  });

  it('verifies render.yaml repo URL points to yswlww/metapi-evolution', () => {
    const content = readFileSync(resolve(rootDir, 'render.yaml'), 'utf8');
    expect(content).toContain('https://github.com/yswlww/metapi-evolution');
  });

  it('verifies zeabur-template.yaml raw asset URLs point to yswlww/metapi-evolution', () => {
    const content = readFileSync(resolve(rootDir, 'zeabur-template.yaml'), 'utf8');
    expect(content).toContain('https://raw.githubusercontent.com/yswlww/metapi-evolution');
  });

  it('verifies updateCenterVersionService uses yswlww/metapi-evolution default URLs', () => {
    const content = readFileSync(resolve(rootDir, 'src/server/services/updateCenterVersionService.ts'), 'utf8');
    expect(content).toContain('https://api.github.com/repos/yswlww/metapi-evolution/releases');
  });

  it('verifies About.tsx links point to yswlww/metapi-evolution and version 1.4.0', () => {
    const content = readFileSync(resolve(rootDir, 'src/web/pages/About.tsx'), 'utf8');
    expect(content).toContain('https://github.com/yswlww/metapi-evolution');
    expect(content).toContain("VERSION = '1.4.0'");
  });
});
