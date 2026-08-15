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

  it('documents the project lineage and independent evolution policy in both READMEs', () => {
    const readme = readFileSync(resolve(rootDir, 'README.md'), 'utf8');
    const readmeEn = readFileSync(resolve(rootDir, 'README_EN.md'), 'utf8');

    expect(readme).toContain('是 [`cita-777/metapi`](https://github.com/cita-777/metapi) 的社区维护、非官方后续独立演进版本');
    expect(readme).toContain('完整保留了原项目的 Git 提交历史、历史版本标签和贡献者记录');
    expect(readme).toContain('继续遵循 [MIT License](LICENSE)');
    expect(readme).toContain('本独立演进分支的维护入口');
    expect(readme).toContain('并非原作者或上游仓库认可的官方续作');
    expect(readme).not.toContain('唯一权威来源');
    expect(readme).toContain('不直接合并上游分支、Pull Request 或连续提交');
    expect(readme).toContain('`kennethww/metapi`');
    expect(readme).toContain('`me.cita777.metapi.desktop`');

    expect(readmeEn).toContain('independent continuation of [`cita-777/metapi`](https://github.com/cita-777/metapi)');
    expect(readmeEn).toContain('full Git commit history, historical release tags, and contributor records');
    expect(readmeEn).toContain('continues under the [MIT License](LICENSE)');
    expect(readmeEn).toContain('maintenance home for this independent continuation');
    expect(readmeEn).toContain('is not an official continuation endorsed by the original author or upstream repository');
    expect(readmeEn).not.toContain('authoritative source');
    expect(readmeEn).toContain('does not directly merge upstream branches, pull requests, or commit series');
    expect(readmeEn).toContain('`kennethww/metapi`');
    expect(readmeEn).toContain('`me.cita777.metapi.desktop`');
  });

  it('tracks upstream PR dispositions and evolution PR history in the optimization checklist', () => {
    const content = readFileSync(resolve(rootDir, '優化清單.md'), 'utf8');

    expect(content).toContain('目前 11 個 OPEN upstream PR');
    expect(content).toContain('沒有任何一個是直接 merge');
    for (const prNumber of [520, 550, 557, 575, 581, 584, 588, 596, 599, 601, 602]) {
      expect(content).toContain(`https://github.com/cita-777/metapi/pull/${prNumber}`);
    }
    expect(content).toContain('[#581](https://github.com/cita-777/metapi/pull/581) | 🟡 部分覆蓋');
    expect(content).toContain('[#520](https://github.com/cita-777/metapi/pull/520) | ❌ 未採用');
    expect(content).toContain('[#557](https://github.com/cita-777/metapi/pull/557) | ❌ 未採用');
    expect(content).toContain('[#470](https://github.com/cita-777/metapi/pull/470)');
    expect(content).toContain('[#567](https://github.com/cita-777/metapi/pull/567)');
    expect(content).toContain('[PR #1](https://github.com/yswlww/metapi-evolution/pull/1)');
    expect(content).toContain('[PR #2](https://github.com/yswlww/metapi-evolution/pull/2)');
    expect(content).toContain('[`protect-main`](https://github.com/yswlww/metapi-evolution/rules/20888216)');
    expect(content).toContain('[`protect-release-tags`](https://github.com/yswlww/metapi-evolution/rules/20888217)');
    expect(content).toContain('完整測試：2724 passed，8 skipped');
    expect(content).not.toContain('新 repository 尚未建立');
  });

  it('keeps Dependabot from proposing unsupported Docker Node major upgrades', () => {
    const content = readFileSync(resolve(rootDir, '.github/dependabot.yml'), 'utf8');
    const dockerSection = content.slice(content.indexOf('- package-ecosystem: docker'));

    expect(dockerSection).toContain('ignore:');
    expect(dockerSection).toContain('dependency-name: "node"');
    expect(dockerSection).toContain('version-update:semver-major');
  });
});
