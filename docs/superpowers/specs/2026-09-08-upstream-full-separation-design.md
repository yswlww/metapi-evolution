# Upstream Full Separation Design

**Date:** 2026-09-08
**Status:** Approved design, pending implementation plan
**Scope:** `yswlww/metapi-evolution` — complete functional decoupling from upstream `cita-777/metapi`

## Context

The 2026-08-15 repository migration moved the project to `yswlww/metapi-evolution` while
deliberately keeping a reference-only relationship with upstream `cita-777/metapi`. The
owner now requires **full separation**: no functional dependency on the upstream project
may remain. GitHub already treats this repository as independent (`isFork: false`); the
remaining coupling is local git configuration, runtime updater feeds, identity metadata,
and documentation contact points.

## Goals

1. Every runtime surface resolves updates, links, and contact points under
   `yswlww`-controlled destinations only.
2. Desktop identity no longer carries upstream-derived identifiers
   (`me.cita777.*`, productName `Metapi`).
3. Documentation no longer points at the upstream author's domain
   (`metapi.cita777.me`).
4. Local git no longer carries `upstream`/`legacy` remotes; the owner's legacy
   repository is archived.
5. Preserve the full 720-commit Git history, all tags, and MIT attribution.

## Non-goals

- Rewriting Git history or re-tagging (`v1.0`–`v1.4.2` stay as-is).
- Renaming the npm package, Docker image (`kennethww/metapi`), data paths,
  environment variables, or API routes.
- Removing the README Origin and Evolution attribution section (MIT license and
  honest attribution require stating the origin; `repositoryIdentityContract`
  test guards it).
- Operating on `cita-777`-owned repositories (not ours; never touched).
- Migrating already-shipped desktop installs (unreachable — see Existing Facts).

## Approved Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Git history | Preserve all 720 commits, no rewrite |
| 2 | Desktop appId | `me.cita777.metapi.desktop` → `io.github.yswlww.metapi.desktop` |
| 3 | Desktop productName | `Metapi` → `Metapi-Evolution`, with userData pinned to the old directory to preserve existing server data |
| 4 | Docs domain | `metapi.cita777.me` (upstream author's domain, upstream's content) → `https://yswlww.github.io/metapi-evolution` (GitHub Pages, must be enabled first) |
| 5 | Security/conduct contact | `cita-777@users.noreply.github.com` → `yswlww@users.noreply.github.com` plus repository Security Advisory entry point |
| 6 | Remotes / legacy repo | Delete local `upstream` + `legacy` remotes; archive `yswlww/metapi` on GitHub |

## Existing Facts (not fixable in code)

- Already-shipped desktop builds have `app-update.yml` baked in pointing at
  `cita-777/metapi` releases. Their "check for updates" surfaces **upstream
  releases**. New releases from this repository cannot reach those installs;
  users must manually install the next build. README + release notes must say so.
- Old-appId installs and new-appId installs are two separate applications on the
  same machine (old Windows control-panel entry remains until the old app is
  uninstalled; macOS login items/permissions re-grant once).
- `metapi.cita777.me` remains owned and operated by the upstream author and may
  serve outdated or upstream-specific content; we no longer rely on it.

## Verified Impact Map

### A. Desktop runtime (user-visible behavior changes for desktop users)

| File | Change |
|---|---|
| `electron-builder.yml` | `appId: io.github.yswlww.metapi.desktop`; `productName: Metapi-Evolution`; `maintainer: yswlww <yswlww@users.noreply.github.com>`; `publish: {provider: github, owner: yswlww, repo: metapi-evolution, releaseType: release, publishAutoUpdate: true}` |
| `src/desktop/main.ts` | Pin userData at the very top of the module (before `log.initialize()`): `app.setPath('userData', join(app.getPath('appData'), 'Metapi'))` — one line, so the new build keeps reading existing server data/logs. Tray tooltip, menu label, and dialog titles: `Metapi` → `Metapi-Evolution` |
| `.github/workflows/release.yml:179` | Windows smoke path `release\win-unpacked\Metapi.exe` → `Metapi-Evolution.exe` |
| `scripts/desktop/verifyMacArchitecture.mjs:6` | `MAC_BINARY_SEGMENTS` `Metapi.app`/`Metapi` → `Metapi-Evolution.app`/`Metapi-Evolution` |

Note: `artifactName: ${name}-...` keeps installer filenames stable (`metapi-<version>-...`),
because it derives from the npm package name, not productName.

### B. Web/docs links (25 references across 9 files)

| File | Change |
|---|---|
| `src/web/docsLink.ts` | `SITE_DOCS_URL` → `https://yswlww.github.io/metapi-evolution`; `SITE_GITHUB_URL` → `https://github.com/yswlww/metapi-evolution` |
| `README.md`, `README_EN.md`, `CONTRIBUTING.md` | All `metapi.cita777.me` links → Pages URL; Origin/Evolution section wording updated for the appId/productName rename (honest "renamed as of v1.4.3" statement) |
| `優化清單.md` | appId record line updated |
| `src/web/App.login-surface.test.tsx` | URL assertions updated (TDD red first) |
| `src/desktop/navigationGuard.test.ts` | Docs-domain fixture updated (TDD red first) |

### C. Contact points

| File | Change |
|---|---|
| `SECURITY.md` | Reporting email → `yswlww@users.noreply.github.com`; add GitHub Security Advisory entry point |
| `CODE_OF_CONDUCT.md` | Contact email → `yswlww@users.noreply.github.com` |
| `package.json` author | → `yswlww` |

### D. Test contract sync (TDD: update assertions first, watch RED, then implement)

- `repositoryIdentityContract.test.ts` — appId/productName assertions flip from
  "promise unchanged" to "assert new values"; add `electron-builder.yml` assertions
  (appId, productName, publish owner/repo); README contract strings updated.
- ~16 test files with `cita-777` release/chart URLs in fixtures
  (update-center suite, update-helper suite, About, UpdateCenterSection,
  update-readme-contributors) — fixtures modernized to `yswlww/metapi-evolution`
  URLs where they represent *live* expectations; upstream historical fixture URLs
  in provenance-style tests may stay only if the assertion is about historical
  parsing, decided per test during implementation.
- `docs/.vitepress/config.ts` — add `base: '/metapi-evolution/'`. Dev server is
  unaffected (VitePress handles base in dev); `docs:build` output now serves
  correctly from the Pages subpath.

### E. External actions (individually confirmed before each)

1. Enable GitHub Pages: Settings → Pages → Source: GitHub Actions (the
   `docs-pages.yml` workflow exists but has never deployed; `has_pages: false`
   as of 2026-09-08, `yswlww.github.io/metapi-evolution` is currently 404).
2. Delete local remotes `upstream` and `legacy`.
3. Archive `yswlww/metapi` on GitHub (read-only; 14-day window from the 08-15
   migration design expired long ago).

### F. Verification

1. Full matrix: typecheck, full test suite, `build:web/server/desktop`,
   drift-check, `docs:build`.
2. Residual scan: `git grep cita-777` and `git grep cita777.me` must hit only the
   README Origin/Evolution attribution sections, `repositoryIdentityContract.test.ts`
   (guarding attribution), `優化清單.md` historical PR tables, and historical
   provenance fixtures that intentionally reference upstream context.
3. Pages site reachable at `https://yswlww.github.io/metapi-evolution/` after
   deployment; docs links resolve.
4. Next desktop release (v1.4.3+) verification: `app-update.yml` inside the
   packaged app points at `yswlww/metapi-evolution`; Windows smoke path and mac
   verifier pass in CI.

## Compatibility Statement

- Server/web users: no behavior change except that the About/docs links point to
  the new Pages site and repository.
- Docker users: zero impact. Image names unchanged (`kennethww/metapi`,
  `ghcr.io/yswlww/metapi-evolution`); `docker pull` / `docker compose pull` habits
  unchanged; no appId/productName concept exists in the container.
- Desktop users: new build appears as a separate application ("Metapi-Evolution");
  existing server data is preserved via the userData pin; the old install must be
  uninstalled manually; auto-update of old installs pulls upstream releases and
  must be ignored in favor of a manual reinstall.
- Existing user data, environment variables, API surface, npm package name, and
  Docker repository remain compatible.

## Rollback Strategy

- All code/metadata changes are on one branch; revert the merge commit to undo.
- Pages enablement is additive and reversible in repository settings.
- Remote deletion is local-only and reversible by re-adding.
- Archiving `yswlww/metapi` is reversible in repository settings.
- No history rewrite, no tag changes, no Docker image changes → nothing irrevocable.

## Success Criteria

1. `git grep cita-777` residual scan passes the whitelist above.
2. Desktop build config, updater feed, and all live links resolve under
   `yswlww`-controlled destinations.
3. Full verification matrix green on the branch.
4. Pages site live and linked from README/docs.
5. Legacy repo archived; local remotes cleaned.
6. README + release notes document the desktop migration path.
