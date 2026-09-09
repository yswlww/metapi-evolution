# Upstream Full Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully decouple `yswlww/metapi-evolution` from upstream `cita-777/metapi` — desktop identity rename, updater feed switch, docs domain switch to GitHub Pages, contact points, and git-level cleanup.

**Architecture:** All changes live on one branch (`feature/upstream-separation`). Desktop identity changes are guarded by `repositoryIdentityContract.test.ts` assertions; the userData pin is a tiny pure helper with its own unit test; link constants live in `src/web/docsLink.ts`; documentation edits carry the same contract test. External actions (Pages enable, remote removal, repo archive) are confirmation-gated and happen outside the branch.

**Tech Stack:** TypeScript (Electron main + React web + Fastify server), electron-builder, VitePress, vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-upstream-full-separation-design.md`

## Global Constraints

- Do NOT rewrite Git history; do NOT re-tag; tags `v1.0`–`v1.4.2` stay untouched.
- Do NOT change: npm package name (`metapi`), Docker image names (`kennethww/metapi`, `ghcr.io/yswlww/metapi-evolution`), data paths, environment variables, API routes.
- Do NOT bump the package version (stays `1.4.2`; version bump belongs to the release process).
- Do NOT operate on `cita-777`-owned repositories.
- New desktop identity values (verbatim): appId `io.github.yswlww.metapi.desktop`, productName `Metapi-Evolution`, userData dir pinned to `Metapi`.
- New destinations (verbatim): `SITE_DOCS_URL` = `https://yswlww.github.io/metapi-evolution`, `SITE_GITHUB_URL` = `https://github.com/yswlww/metapi-evolution`, contact email `yswlww@users.noreply.github.com`.
- Residual whitelist after completion: `cita-777` may appear ONLY in README Origin/Evolution prose, README contributor avatars, `優化清單.md` historical PR tables, `repositoryIdentityContract.test.ts` (attribution guard), `scripts/dev/update-readme-contributors.test.ts` (factual contributor fixture). Zero occurrences of `cita777.me` or `me.cita777` anywhere.
- Run all commands from the worktree root: `/home/kenneth/MyCoding/metapi/.claude/worktrees/dependabot-remediation` (branch `feature/upstream-separation`).
- Local Node is 24.x (project engines say >=25): expect `EBADENGINE` warnings; tests/typecheck run fine locally. Node 25 is verified remotely by CI.

---

### Task 1: Desktop identity — electron-builder, release workflow, mac verifier

**Files:**
- Modify: `electron-builder.yml:1-4,30-36`
- Modify: `.github/workflows/release.yml:179`
- Modify: `scripts/desktop/verifyMacArchitecture.mjs:6`
- Test: `src/server/services/repositoryIdentityContract.test.ts` (add one test, edit two assertions)

**Interfaces:**
- Produces: electron-builder config with appId `io.github.yswlww.metapi.desktop`, productName `Metapi-Evolution`, publish feed `yswlww/metapi-evolution`. Later tasks and the final residual scan rely on these exact strings.

- [ ] **Step 1: Write the failing contract test**

In `src/server/services/repositoryIdentityContract.test.ts`, inside `describe('repositoryIdentityContract', ...)`, add after the `updateCenterVersionService` test:

```typescript
  it('verifies electron-builder identity points to yswlww-owned destinations', () => {
    const content = readFileSync(resolve(rootDir, 'electron-builder.yml'), 'utf8');
    expect(content).toContain('appId: io.github.yswlww.metapi.desktop');
    expect(content).toContain('productName: Metapi-Evolution');
    expect(content).toContain('owner: yswlww');
    expect(content).toContain('repo: metapi-evolution');
    expect(content).not.toContain('cita777');
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run src/server/services/repositoryIdentityContract.test.ts`
Expected: FAIL — the new test reports that `appId: io.github.yswlww.metapi.desktop` is missing from `electron-builder.yml` (file still contains `me.cita777.metapi.desktop`).

- [ ] **Step 3: Apply the electron-builder identity changes**

In `electron-builder.yml`, replace lines 1-2:

```yaml
appId: io.github.yswlww.metapi.desktop
productName: Metapi-Evolution
```

Replace line 30:

```yaml
  maintainer: yswlww <yswlww@users.noreply.github.com>
```

Replace the publish block (lines 31-36):

```yaml
publish:
  provider: github
  owner: yswlww
  repo: metapi-evolution
  releaseType: release
  publishAutoUpdate: true
```

Do NOT change `artifactName` (it uses the npm package name and keeps installer filenames stable) or `nsis:`/`directories:`/`files:` sections.

- [ ] **Step 4: Update the Windows smoke path in the release workflow**

In `.github/workflows/release.yml` line 179, replace:

```yaml
          $exePath = Join-Path $PWD 'release\win-unpacked\Metapi.exe'
```

with:

```yaml
          $exePath = Join-Path $PWD 'release\win-unpacked\Metapi-Evolution.exe'
```

(The preceding line 178 `$appRoot = Join-Path $PWD 'release\win-unpacked\resources\app'` stays unchanged — `win-unpacked` derives from productName too, but the directory name in electron-builder output is `win-unpacked` regardless; verify by building locally in Task 8 if unsure.)

- [ ] **Step 5: Update the mac architecture verifier**

In `scripts/desktop/verifyMacArchitecture.mjs` line 6, replace:

```javascript
const MAC_BINARY_SEGMENTS = ['Metapi.app', 'Contents', 'MacOS', 'Metapi'];
```

with:

```javascript
const MAC_BINARY_SEGMENTS = ['Metapi-Evolution.app', 'Contents', 'MacOS', 'Metapi-Evolution'];
```

- [ ] **Step 6: Run the contract test to verify it passes**

Run: `npx vitest run src/server/services/repositoryIdentityContract.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 7: Commit**

```bash
git add electron-builder.yml .github/workflows/release.yml scripts/desktop/verifyMacArchitecture.mjs src/server/services/repositoryIdentityContract.test.ts
git commit -m "chore: rename desktop identity to Metapi-Evolution under yswlww"
```

---

### Task 2: Desktop userData pin and product strings

**Files:**
- Create: `src/desktop/userData.ts`
- Test: `src/desktop/userData.test.ts`
- Modify: `src/desktop/main.ts:1-35` (import + pin before `log.initialize()`), `src/desktop/main.ts:83,135,282,283,318,431` (display strings)

**Interfaces:**
- Produces: `resolvePinnedUserDataPath(appDataPath: string): string` and `LEGACY_USER_DATA_DIR_NAME = 'Metapi'` from `src/desktop/userData.ts`. `main.ts` calls it once at startup. No other module consumes it.

- [ ] **Step 1: Write the failing test**

Create `src/desktop/userData.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  LEGACY_USER_DATA_DIR_NAME,
  resolvePinnedUserDataPath,
} from './userData.js';

describe('resolvePinnedUserDataPath', () => {
  it('pins userData to the legacy Metapi directory under appData', () => {
    expect(resolvePinnedUserDataPath(join('/home', 'u', '.config'))).toBe(
      join('/home', 'u', '.config', 'Metapi'),
    );
  });

  it('uses the exact directory name that shipped desktop builds created', () => {
    // productName was `Metapi` in all shipped builds, so Electron derived
    // userData from `Metapi`. Renaming productName to `Metapi-Evolution`
    // must not move the data directory.
    expect(LEGACY_USER_DATA_DIR_NAME).toBe('Metapi');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/desktop/userData.test.ts`
Expected: FAIL — cannot resolve `./userData.js` (module does not exist).

- [ ] **Step 3: Implement the helper**

Create `src/desktop/userData.ts`:

```typescript
import { join } from 'node:path';

/**
 * Shipped desktop builds (productName `Metapi`) derived their Electron
 * userData directory from the product name. The product is now
 * `Metapi-Evolution`; pinning userData to the legacy name keeps existing
 * server data and logs visible to the new build.
 */
export const LEGACY_USER_DATA_DIR_NAME = 'Metapi';

export function resolvePinnedUserDataPath(appDataPath: string): string {
  return join(appDataPath, LEGACY_USER_DATA_DIR_NAME);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/desktop/userData.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the pin into main.ts before log initialization**

In `src/desktop/main.ts`, add to the local imports (after the existing `./runtime.js` import or equivalent local import block):

```typescript
import { resolvePinnedUserDataPath } from './userData.js';
```

Then locate the startup section — currently:

```typescript
log.initialize();
```

Add the pin immediately before it (this must run before any path is read or log file written):

```typescript
app.setPath('userData', resolvePinnedUserDataPath(app.getPath('appData')));

log.initialize();
```

- [ ] **Step 6: Update display strings in main.ts**

Replace these exact strings (leave surrounding code untouched):

- Line 83: `label: 'Open Metapi',` → `label: 'Open Metapi-Evolution',`
- Line 135: `tray.setToolTip('Metapi');` → `tray.setToolTip('Metapi-Evolution');`
- Line 282: `title: 'Metapi backend stopped',` → `title: 'Metapi-Evolution backend stopped',`
- Line 283: message template `The local Metapi backend exited unexpectedly` → `The local Metapi-Evolution backend exited unexpectedly` (keep the `${typeof code ...}` suffix)
- Line 318: `message: 'Metapi could not restart the local backend.',` → `message: 'Metapi-Evolution could not restart the local backend.',`
- Line 431: `title: 'Metapi failed to start',` → `title: 'Metapi-Evolution failed to start',`

Do NOT touch: `src/web` user-facing brand text, `docs`, or anything outside `src/desktop/main.ts` in this step.

- [ ] **Step 7: Typecheck the desktop project**

Run: `npm run typecheck:desktop`
Expected: exit 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/desktop/userData.ts src/desktop/userData.test.ts src/desktop/main.ts
git commit -m "feat: pin desktop userData to legacy dir and rebrand desktop strings"
```

---

### Task 3: Web link constants — docsLink, login surface, navigation guard

**Files:**
- Modify: `src/web/docsLink.ts`
- Test: `src/web/App.login-surface.test.tsx:15-19`
- Test: `src/desktop/navigationGuard.test.ts:67,71`

**Interfaces:**
- Produces: `SITE_DOCS_URL = 'https://yswlww.github.io/metapi-evolution'` and `SITE_GITHUB_URL = 'https://github.com/yswlww/metapi-evolution'` (both exported from `src/web/docsLink.ts`; consumers `src/web/App.tsx:218,233,602` and the login surface pick them up automatically with no changes).

- [ ] **Step 1: Flip the test assertions (RED)**

In `src/web/App.login-surface.test.tsx`, replace:

```typescript
  it('uses the site root as the documentation URL', () => {
    expect(SITE_DOCS_URL).toBe('https://metapi.cita777.me');
  });

  it('uses the author github profile for the login github shortcut', () => {
    expect(SITE_GITHUB_URL).toBe('https://github.com/cita-777');
  });
```

with:

```typescript
  it('uses the GitHub Pages docs site as the documentation URL', () => {
    expect(SITE_DOCS_URL).toBe('https://yswlww.github.io/metapi-evolution');
  });

  it('uses the evolution repository for the login github shortcut', () => {
    expect(SITE_GITHUB_URL).toBe('https://github.com/yswlww/metapi-evolution');
  });
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run src/web/App.login-surface.test.tsx`
Expected: FAIL — the two URL assertions fail against the old constants.

- [ ] **Step 3: Implement the new constants (GREEN)**

Replace the entire content of `src/web/docsLink.ts` with:

```typescript
export const SITE_DOCS_URL = 'https://yswlww.github.io/metapi-evolution';
export const SITE_GITHUB_URL = 'https://github.com/yswlww/metapi-evolution';
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run src/web/App.login-surface.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Update the navigationGuard docs-domain fixture**

In `src/desktop/navigationGuard.test.ts`, the test at lines ~60-72 uses the docs URL as a sample cross-origin URL. Replace both occurrences of `https://metapi.cita777.me` (lines 67 and 71) with `https://yswlww.github.io/metapi-evolution`:

```typescript
    const result = harness.getOpenHandler()({
      url: 'https://yswlww.github.io/metapi-evolution',
    });

    expect(result).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://yswlww.github.io/metapi-evolution');
```

This test is about cross-origin handling (any external URL works as a fixture); there is no assertion against `docsLink.ts`, so it needs no RED step — it is a fixture swap. Verify it passes.

Run: `npx vitest run src/desktop/navigationGuard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/docsLink.ts src/web/App.login-surface.test.tsx src/desktop/navigationGuard.test.ts
git commit -m "feat: point web link constants at evolution repo and GitHub Pages docs"
```

---

### Task 4: README, CONTRIBUTING, checklist lineage updates

**Files:**
- Modify: `README.md` (links at lines 36-41, 366-368; Origin section lines 440-455)
- Modify: `README_EN.md` (links at lines 51-57; Origin section lines 565-580)
- Modify: `CONTRIBUTING.md:216`
- Modify: `優化清單.md:15`
- Test: `src/server/services/repositoryIdentityContract.test.ts:37-60` (lineage test)

**Interfaces:**
- Consumes: new identity strings from Task 1 (appId/productName). Produces: README wording that `repositoryIdentityContract.test.ts` asserts.

- [ ] **Step 1: Flip the lineage contract assertions (RED)**

In `src/server/services/repositoryIdentityContract.test.ts`, inside the test `documents the project lineage and independent evolution policy in both READMEs`, replace:

```typescript
    expect(readme).toContain('`kennethww/metapi`');
    expect(readme).toContain('`me.cita777.metapi.desktop`');
```

with:

```typescript
    expect(readme).toContain('`kennethww/metapi`');
    expect(readme).toContain('`io.github.yswlww.metapi.desktop`');
    expect(readme).not.toContain('`me.cita777.metapi.desktop`');
    expect(readme).toContain('Metapi-Evolution');
    expect(readme).toContain('https://yswlww.github.io/metapi-evolution');
```

and replace (English half):

```typescript
    expect(readmeEn).toContain('`kennethww/metapi`');
    expect(readmeEn).toContain('`me.cita777.metapi.desktop`');
```

with:

```typescript
    expect(readmeEn).toContain('`kennethww/metapi`');
    expect(readmeEn).toContain('`io.github.yswlww.metapi.desktop`');
    expect(readmeEn).not.toContain('`me.cita777.metapi.desktop`');
    expect(readmeEn).toContain('Metapi-Evolution');
    expect(readmeEn).toContain('https://yswlww.github.io/metapi-evolution');
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run src/server/services/repositoryIdentityContract.test.ts`
Expected: FAIL — READMEs still contain the old appId and no Pages URL.

- [ ] **Step 3: Update README.md**

3a. Replace every `https://metapi.cita777.me` occurrence (lines 36-41 quick links, 366, 368) with `https://yswlww.github.io/metapi-evolution`, keeping the path suffixes (`/getting-started`, `/deployment`, `/configuration`, `/client-integration`, `/faq`).

3b. In the Origin and Evolution section, replace the paragraph in `### 独立维护与兼容性` (line ~449) with:

```markdown
本分支由社区维护者根据自身使用需求独立开发，[`yswlww/metapi-evolution`](https://github.com/yswlww/metapi-evolution) 是本独立演进分支的维护入口，承载后续开发、Issue、Pull Request 与 Release。自迁移以来，桌面版已改以独立身份发布：应用 ID 为 `io.github.yswlww.metapi.desktop`，产品名称为 `Metapi-Evolution`；桌面版数据目录保持兼容（沿用原 `Metapi` 数据目录），但早期桌面版不会通过自动更新迁移到新身份，需要手动安装新版本。Docker 镜像 `kennethww/metapi`、npm 包名 `metapi`、服务器端配置、环境变量、数据目录与升级路径均保持不变。
```

Leave the rest of the Origin section (`### 起源与传承`, `### 上游参考政策`) untouched — the `cita-777/metapi` attribution link there is intentional and permanent.

- [ ] **Step 4: Update README_EN.md**

4a. Replace every `https://metapi.cita777.me` occurrence (lines 51-57) with `https://yswlww.github.io/metapi-evolution`, keeping path suffixes.

4b. In `### Independent maintenance and compatibility` (line ~573), replace the paragraph with:

```markdown
This branch is developed independently by community maintainers for their own use cases. [`yswlww/metapi-evolution`](https://github.com/yswlww/metapi-evolution) is the maintenance home for this independent continuation and hosts this branch's ongoing development, issues, pull requests, and releases. The desktop app now ships under an independent identity: application ID `io.github.yswlww.metapi.desktop` and product name `Metapi-Evolution`, with the desktop data directory kept compatible (the legacy `Metapi` data directory is still used). Existing desktop installs do not migrate to the new identity via auto-update and must be upgraded manually. The `kennethww/metapi` Docker image, the `metapi` npm package name, server-side configuration, environment variables, data directories, and upgrade paths are unchanged.
```

Leave `### Origin and continuity` and `### Upstream reference policy` untouched (attribution link stays).

- [ ] **Step 5: Update CONTRIBUTING.md line 216**

Replace:

```markdown
- 📖 [Documentation](https://metapi.cita777.me) / [文档](https://metapi.cita777.me)
```

with:

```markdown
- 📖 [Documentation](https://yswlww.github.io/metapi-evolution) / [文档](https://yswlww.github.io/metapi-evolution)
```

- [ ] **Step 6: Update 優化清單.md line 15**

Replace the sentence fragment:

```markdown
desktop app ID 仍為 `me.cita777.metapi.desktop`。
```

with:

```markdown
desktop app ID 已更新為 `io.github.yswlww.metapi.desktop`（產品名稱 `Metapi-Evolution`，數據目錄保持相容）。
```

(Keep the rest of the line — repository and Docker image clauses — unchanged.)

- [ ] **Step 7: Run to verify GREEN**

Run: `npx vitest run src/server/services/repositoryIdentityContract.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add README.md README_EN.md CONTRIBUTING.md 優化清單.md src/server/services/repositoryIdentityContract.test.ts
git commit -m "docs: switch docs links to GitHub Pages and document desktop identity change"
```

---

### Task 5: Contact points and package author

**Files:**
- Modify: `SECURITY.md:71,170,172`
- Modify: `CODE_OF_CONDUCT.md:41,104,106`
- Modify: `package.json:163-167`
- Test: `src/server/services/repositoryIdentityContract.test.ts` (extend the package.json test)

**Interfaces:**
- Produces: `package.json` author `{ "name": "yswlww", "email": "yswlww@users.noreply.github.com", "url": "https://github.com/yswlww" }`. No other module consumes author.

- [ ] **Step 1: Extend the package.json contract test (RED)**

In `src/server/services/repositoryIdentityContract.test.ts`, in the test `verifies package.json points to yswlww/metapi-evolution and version 1.4.2`, add after the homepage assertion:

```typescript
    expect(pkg.author?.name).toBe('yswlww');
    expect(pkg.author?.email).toBe('yswlww@users.noreply.github.com');
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run src/server/services/repositoryIdentityContract.test.ts`
Expected: FAIL — author is still `cita-777`.

- [ ] **Step 3: Update package.json author**

Replace the author block (lines 163-167):

```json
  "author": {
    "name": "yswlww",
    "email": "yswlww@users.noreply.github.com",
    "url": "https://github.com/yswlww"
  }
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run src/server/services/repositoryIdentityContract.test.ts`
Expected: PASS.

- [ ] **Step 5: Update SECURITY.md contact points**

Line 71, replace:

```markdown
   - Send to: `cita-777@users.noreply.github.com`
```

with:

```markdown
   - Send to: `yswlww@users.noreply.github.com`
```

Line 170, replace:

```markdown
If you have questions about this security policy, please contact `cita-777@users.noreply.github.com`.
```

with:

```markdown
If you have questions about this security policy, please contact `yswlww@users.noreply.github.com` or open a [GitHub Security Advisory](https://github.com/yswlww/metapi-evolution/security/advisories/new).
```

Line 172, replace:

```markdown
如果您对本安全政策有疑问，请联系 `cita-777@users.noreply.github.com`。
```

with:

```markdown
如果您对本安全政策有疑问，请联系 `yswlww@users.noreply.github.com` 或通过 [GitHub 安全公告](https://github.com/yswlww/metapi-evolution/security/advisories/new) 联系。
```

(The GitHub Security Advisory channel at line ~65 already points at the correct `yswlww/metapi-evolution` URL — leave it.)

- [ ] **Step 6: Update CODE_OF_CONDUCT.md contact points**

Line 41, replace:

```markdown
1. **Email** / **邮件**: `cita-777@users.noreply.github.com` with subject prefix `[Metapi Conduct]` / 主题前缀为 `[Metapi Conduct]`
```

with:

```markdown
1. **Email** / **邮件**: `yswlww@users.noreply.github.com` with subject prefix `[Metapi Conduct]` / 主题前缀为 `[Metapi Conduct]`
```

Lines 104 and 106, replace both occurrences of `cita-777@users.noreply.github.com` with `yswlww@users.noreply.github.com`:

```markdown
If you have questions about this Code of Conduct, please open an issue or contact the maintainers at `yswlww@users.noreply.github.com`.

如果您对本行为准则有疑问，请开启 issue 或通过 `yswlww@users.noreply.github.com` 联系维护者。
```

- [ ] **Step 7: Verify no stray contact references remain**

Run: `git grep -n "cita-777@users" -- SECURITY.md CODE_OF_CONDUCT.md package.json`
Expected: no output (exit 1).

- [ ] **Step 8: Commit**

```bash
git add SECURITY.md CODE_OF_CONDUCT.md package.json src/server/services/repositoryIdentityContract.test.ts
git commit -m "docs: route security and conduct contacts to yswlww"
```

---

### Task 6: Update-center fixture modernization and chart placeholder

**Files:**
- Modify: `src/web/pages/settings/UpdateCenterSection.tsx:655` (production placeholder)
- Modify (fixtures only, mechanical): `src/server/routes/api/updateCenter.test.ts`, `src/server/services/updateCenterDeployGuardService.test.ts`, `src/server/services/updateCenterHelperClient.test.ts`, `src/server/services/updateCenterPollingService.test.ts`, `src/server/services/updateCenterRuntimeStateService.test.ts`, `src/server/update-helper/app.test.ts`, `src/server/update-helper/service.test.ts`, `src/web/pages/About.update-center.test.tsx`, `src/web/pages/settings/UpdateCenterSection.test.tsx`
- Do NOT touch: `scripts/dev/update-readme-contributors.test.ts` (its `cita-777` entries are the factual original-author contributor fixture and stay forever)

**Interfaces:**
- Consumes: nothing from other tasks. Produces: fixtures that model `yswlww/metapi-evolution` release URLs and a repo-owned chart placeholder. Tests must pass before and after (pure fixture rename, no behavior change).

- [ ] **Step 1: Baseline-run the affected suites**

Run: `npx vitest run src/server/routes/api/updateCenter.test.ts src/server/services/updateCenterDeployGuardService.test.ts src/server/services/updateCenterHelperClient.test.ts src/server/services/updateCenterPollingService.test.ts src/server/services/updateCenterRuntimeStateService.test.ts src/server/update-helper/app.test.ts src/server/update-helper/service.test.ts src/web/pages/About.update-center.test.tsx src/web/pages/settings/UpdateCenterSection.test.tsx`
Expected: PASS (baseline before the mechanical swap).

- [ ] **Step 2: Swap fixture URLs**

In the nine test files listed above, apply exactly two textual replacements:

1. `oci://ghcr.io/cita-777/charts/metapi` → `oci://ghcr.io/yswlww/metapi-evolution/charts/metapi`
2. `https://github.com/cita-777/metapi/releases/tag/` → `https://github.com/yswlww/metapi-evolution/releases/tag/`

Use `git grep -n "cita-777" src/server/routes/api/updateCenter.test.ts src/server/services/updateCenterDeployGuardService.test.ts src/server/services/updateCenterHelperClient.test.ts src/server/services/updateCenterPollingService.test.ts src/server/services/updateCenterRuntimeStateService.test.ts src/server/update-helper/app.test.ts src/server/update-helper/service.test.ts src/web/pages/About.update-center.test.tsx src/web/pages/settings/UpdateCenterSection.test.tsx` first to enumerate every occurrence, then replace each. If an occurrence matches neither pattern (some other upstream context), stop and record it in the commit message body rather than guessing.

- [ ] **Step 3: Update the production chart placeholder**

In `src/web/pages/settings/UpdateCenterSection.tsx` line 655, replace:

```tsx
              placeholder="oci://ghcr.io/cita-777/charts/metapi"
```

with:

```tsx
              placeholder="oci://ghcr.io/yswlww/metapi-evolution/charts/metapi"
```

- [ ] **Step 4: Run the affected suites to verify GREEN**

Run: `npx vitest run src/server/routes/api/updateCenter.test.ts src/server/services/updateCenterDeployGuardService.test.ts src/server/services/updateCenterHelperClient.test.ts src/server/services/updateCenterPollingService.test.ts src/server/services/updateCenterRuntimeStateService.test.ts src/server/update-helper/app.test.ts src/server/update-helper/service.test.ts src/web/pages/About.update-center.test.tsx src/web/pages/settings/UpdateCenterSection.test.tsx`
Expected: PASS, same counts as Step 1 baseline.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/api/updateCenter.test.ts src/server/services/updateCenterDeployGuardService.test.ts src/server/services/updateCenterHelperClient.test.ts src/server/services/updateCenterPollingService.test.ts src/server/services/updateCenterRuntimeStateService.test.ts src/server/update-helper/app.test.ts src/server/update-helper/service.test.ts src/web/pages/About.update-center.test.tsx src/web/pages/settings/UpdateCenterSection.test.tsx src/web/pages/settings/UpdateCenterSection.tsx
git commit -m "test: model update-center fixtures on yswlww/metapi-evolution destinations"
```

---

### Task 7: VitePress base for GitHub Pages subpath

**Files:**
- Modify: `docs/.vitepress/config.ts:48-53` (add `base`, fix favicon hrefs)

**Interfaces:**
- Consumes: the Pages URL from Task 3/4. Produces: a docs build that serves correctly from `https://yswlww.github.io/metapi-evolution/`. `docs:dev` remains unaffected (VitePress serves base-aware in dev).

- [ ] **Step 1: Add the base and fix absolute favicon paths**

In `docs/.vitepress/config.ts`, in the `defineConfig({...})` object, add `base` next to `cleanUrls` and rewrite the three `head` favicon hrefs (VitePress does NOT prefix raw `head` link hrefs with base):

```typescript
    base: '/metapi-evolution/',
    head: [
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/metapi-evolution/favicon.png' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/metapi-evolution/favicon-64.png' }],
      ['link', { rel: 'shortcut icon', href: '/metapi-evolution/favicon.ico' }],
    ],
    cleanUrls: true,
```

(`lastUpdated: true` and `ignoreDeadLinks: true` stay as-is.)

- [ ] **Step 2: Build the docs to verify**

Run: `npm run docs:build`
Expected: exit 0. Then verify the output is base-aware:

Run: `grep -c "metapi-evolution" docs/.vitepress/dist/index.html`
Expected: a count > 0 (asset URLs carry the base).

Run: `grep -o 'href="/metapi-evolution/favicon[^"]*"' docs/.vitepress/dist/index.html | head -3`
Expected: the three favicon links with the base prefix.

- [ ] **Step 3: Commit**

```bash
git add docs/.vitepress/config.ts
git commit -m "docs: build VitePress under the GitHub Pages subpath"
```

---

### Task 8: Full verification matrix and residual scan

**Files:** none modified (verification only)

**Interfaces:**
- Consumes: all prior tasks. Produces: the evidence required before any external action.

- [ ] **Step 1: Typecheck everything**

Run: `npm run typecheck`
Expected: exit 0 (web, web:test, server, desktop).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass; failures are not acceptable. Local Node is 24.x — `EBADENGINE` warnings are expected noise, not failures.

- [ ] **Step 3: Build all three targets**

Run: `npm run build:web && npm run build:server && npm run build:desktop`
Expected: all three exit 0.

- [ ] **Step 4: Drift check**

Run: `npm run repo:drift-check`
Expected: 0 violations.

- [ ] **Step 5: Residual scan**

Run: `git grep -n "cita777" -- . ':!package-lock.json' ':!pnpm-lock.yaml' ':!docs/superpowers'`
Expected hits (whitelist only):
- `README.md`, `README_EN.md`: the attribution link `cita-777/metapi` in Origin prose, and the contributor avatar links (original author is a factual contributor)
- `優化清單.md`: historical upstream PR table links
- `src/server/services/repositoryIdentityContract.test.ts`: assertions guarding the attribution prose
- `scripts/dev/update-readme-contributors.test.ts`: factual contributor fixture
- `electron-builder.yml`: ZERO hits — must be gone

Run: `git grep -n "cita777.me" -- . ':!package-lock.json' ':!pnpm-lock.yaml' ':!docs/superpowers'`
Expected: ZERO hits anywhere.

Run: `git grep -n "me.cita777" -- . ':!package-lock.json' ':!pnpm-lock.yaml'`
Expected: ZERO hits.

Any hit outside the whitelist: fix it in the owning task's style and re-run.

- [ ] **Step 6: Commit (only if the scan forced fixes)**

If Step 5 required fixes, commit them; otherwise skip.

---

### Task 9: External actions (confirmation-gated, after branch merge)

**Files:** none in the repository (GitHub settings and local git config)

**Interfaces:**
- Consumes: merged branch with Tasks 1-8 green. Produces: live Pages site, cleaned remotes, archived legacy repo.

- [ ] **Step 1: Push and integrate the branch**

Use the finishing-a-development-branch flow: push `feature/upstream-separation`, open a PR against `main`, let CI run, merge with explicit owner approval.

- [ ] **Step 2: Enable GitHub Pages (needs owner confirmation)**

Owner enables: repository Settings → Pages → Build and deployment → Source: **GitHub Actions**. Then trigger the `Docs Pages` workflow (Actions → Docs Pages → Run workflow) or push a docs-affecting change to main. Verify `https://yswlww.github.io/metapi-evolution/` returns 200 and a deep link (e.g. `/getting-started`) resolves. If deep links 404 (cleanUrls + Pages quirk), report back — fallback is setting `cleanUrls: false` in a follow-up commit.

- [ ] **Step 3: Delete local remotes (needs owner confirmation)**

Run from any checkout of this repository:

```bash
git remote remove upstream
git remote remove legacy
```

Then verify:

```bash
git remote -v
```

Expected: only `origin https://github.com/yswlww/metapi-evolution.git` remains. (Remotes are shared repo config, not worktree-local.)

- [ ] **Step 4: Archive the legacy repository (needs owner confirmation)**

Owner performs: `yswlww/metapi` → Settings → General → Danger Zone → Archive this repository. Optionally first update its description/homepage to point at `yswlww/metapi-evolution`. Do NOT touch `cita-777/metapi`.

- [ ] **Step 5: Record completion**

Update the memory file `resume-dependabot-remediation-2026-09-08.md` (or a new `resume-upstream-separation` note) with: branch/PR link, Pages URL, archived-repo confirmation, and the residual-scan whitelist.
