# metapi-evolution Repository Migration Design

**Date:** 2026-08-15  
**Status:** Approved design, pending implementation plan  
**Current repository:** `yswlww/metapi`  
**Target repository:** `yswlww/metapi-evolution`

## Context

The maintained fork has evolved beyond the current upstream repository. Its `main` branch contains issue fixes, schema migrations, routing and concurrency architecture, deployment improvements, update-center behavior, and Docker releases that are not present or not accepted upstream. The fork will no longer merge upstream branches, pull requests, or complete commit sequences directly.

The next step is to make `metapi-evolution` the independent, authoritative repository while preserving compatibility for existing users. The repository identity changes, but the application remains named `metapi`: npm package metadata, desktop identity, data paths, configuration keys, API surface, Helm release name, and Docker repository remain compatible.

## Goals

1. Create a public standalone repository at `github.com/yswlww/metapi-evolution`.
2. Preserve the complete Git history and all existing release tags.
3. Make the new repository the immediate authority for source, issues, releases, update checks, documentation, and deployment links.
4. Publish `v1.4.0` as the first authoritative evolution release.
5. Keep existing application, storage, deployment, and Docker identities compatible.
6. Transition `yswlww/metapi` to a redirect-only legacy repository, then archive it after a verified 14-day migration window.
7. Preserve original authorship, license, attribution, and links to upstream issue history.

## Non-goals

- Renaming the application, npm package, desktop app ID, Helm release, data directory, environment variables, or API endpoints.
- Moving Docker images away from `kennethww/metapi`.
- Rewriting historical commits, tags, plans, specs, or upstream issue references.
- Mirroring stale feature, dependabot, or abandoned topic branches.
- Importing the 17 already-fixed upstream roadmap issues into the new issue tracker.
- Automatically inferring or migrating repository secrets, signing credentials, or protected environment values.
- Immediately archiving the legacy repository before the new release and update path are verified.

## Approved Decisions

| Area | Decision |
|---|---|
| Repository | Public `yswlww/metapi-evolution` |
| Branding | Repository-only identity change; product remains `metapi` |
| History | Preserve full Git history |
| Refs | Push `main` and all existing tags; omit stale branches |
| Authority | Switch source, release, issue, update, docs, and deploy links immediately at cutover |
| First release | `v1.4.0` |
| Docker | Publish `kennethww/metapi:v1.4.0`, commit SHA tag, and `latest` |
| Issues | Create only unresolved/migration issues; do not copy already-fixed issues |
| Legacy repo | Redirect after cutover; archive after 14 verified days |
| Local remotes | `origin` = evolution, `legacy` = old fork, `upstream` = original project |
| Upstream policy | Reference only; no direct merges of upstream branches/PRs/commit series |

## Repository Identity Boundary

### Identity that changes

- GitHub repository owner/name and URLs.
- GitHub release and API endpoints.
- Issue, pull request, discussion, security advisory, contributor, badge, clone, and deployment links.
- Repository metadata in `package.json`.
- Update-center release source.
- GitHub Pages/VitePress social and home links.
- Runtime About-page repository link.
- Render and Zeabur source/logo URLs that reference the old GitHub repository.
- Contributor-update automation repository identifier.

### Identity that remains compatible

- Application display name: `metapi`.
- npm package name and binary/script identities.
- Desktop application ID and local data paths.
- Docker repository: `kennethww/metapi`.
- Helm chart/release names and Kubernetes resource naming.
- Environment variables, configuration, API routes, database paths, and migrations.
- Existing user volumes, account data, backups, and deployment commands.

## Attribution and Historical References

The existing `LICENSE`, author history, and contributor commits remain unchanged. README files gain an **Origin and Evolution** section that states:

- the project originated from `cita-777/metapi`;
- `metapi-evolution` preserves the full Git history and license;
- current maintenance and releases are independent;
- upstream code may be studied as reference but is not merged directly.

Historical design/plan documents and links to upstream issues remain unchanged where they describe past decisions. The migration must not mass-replace `cita-777/metapi` inside historical evidence or the fixed-issue audit table.

Uncontrolled external mirrors or indexes, such as old AtomGit or DeepWiki links, are removed or clearly labeled until an evolution-specific mirror/index exists.

## File and Component Scope

### Live repository metadata and contributor surfaces

Representative files:

- `README.md`
- `README_EN.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `package.json`
- lockfiles affected by the version bump
- `scripts/dev/update-readme-contributors.ts`

Required changes:

- Replace live repository, release, issue, PR, discussion, security advisory, badge, star, contributor, and clone links with `yswlww/metapi-evolution`.
- Update repository metadata and version to `1.4.0`.
- Add independent-maintenance and origin-attribution notices.
- Preserve upstream issue links used as historical evidence.

### Documentation and deployment links

Representative files:

- `docs/.vitepress/config.ts`
- `docs/README.md`
- `docs/getting-started.md`
- `docs/deployment.md`
- `docs/faq.md`
- `render.yaml`
- `zeabur-template.yaml`
- `優化清單.md`

Required changes:

- Switch homepage, source, releases, issue, clone, and one-click deployment links.
- Ensure raw logo and template URLs resolve from the new repository.
- Keep the fixed-issue audit linked to upstream issue pages while clearly labeling fork status.
- Document `metapi-evolution` as the sole maintained source.

### Application update and About surfaces

Representative files:

- `src/server/services/updateCenterVersionService.ts`
- update-center service/route tests
- `src/web/pages/About.tsx`
- About/update-center tests
- desktop navigation tests containing repository URLs

Required changes:

- Update GitHub Releases API to `https://api.github.com/repos/yswlww/metapi-evolution/releases`.
- Update release URLs and repository links expected by tests.
- Preserve current fallback, polling, reminder, rollout, and version-comparison behavior.

### GitHub workflows and release assets

Representative files:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/docs-pages.yml`
- repository workflow contract tests

Required changes:

- Remove assumptions tied to the old repository identity while retaining existing permissions and triggers unless the new repository requires a documented adjustment.
- Verify Pages deployment, release asset creation, Docker publication, and update-helper assets in the new repository.
- Inventory required repository variables, environments, and secrets before triggering `v1.4.0`.

Secrets are never read back or copied automatically. Any required secret must be configured explicitly in `metapi-evolution` or the first release must use the already-verified local publication path.

## Git and Remote Model

After the new repository passes public verification, local remotes become:

```text
origin   https://github.com/yswlww/metapi-evolution.git
legacy   https://github.com/yswlww/metapi.git
upstream https://github.com/cita-777/metapi.git
```

`origin/main` is the only development and release authority. `legacy` is used only for the redirect/archive transition. `upstream` is read-only reference material and must not be used as a merge source.

Migration pushes:

1. Push the reviewed migration commit history to `origin/main`.
2. Push all existing tags `v1.0` through `v1.3.0` as historical tags.
3. Do not push local feature, dependabot, or stale topic branches.
4. Create `v1.4.0` only after the new repository settings and release path are ready.

## Version and Release Model

### Version

- Set package version to `1.4.0`.
- Update affected lockfiles and version assertions.
- Keep the product name `metapi`.

### GitHub release

`v1.4.0` is the first authoritative `metapi-evolution` GitHub Release. Release notes summarize:

- independent fork/evolution policy;
- issue fixes already present in fork main;
- site-header and CPA pricing protection;
- atomic/cross-process route reconciliation;
- migrations 0027 and 0028;
- Compose, Helm, update, and Actions maintenance;
- compatibility and rollout notes;
- unresolved issue links and migration guidance.

Existing historical tags remain visible, but old GitHub Release metadata is not recreated or represented as evolution-authored releases.

### Docker release

Publish and verify:

```text
kennethww/metapi:v1.4.0
kennethww/metapi:<short-sha>
kennethww/metapi:latest
```

The three tags must resolve to the same digest and the published image must pass an HTTP smoke test before release completion is claimed. Publication continues using the existing verified amd64 convention unless a separately validated multi-architecture builder is configured.

## Issue Tracker Initialization

The new repository starts with only actionable evolution issues:

1. Repository migration and 14-day legacy archive checklist.
2. MiniMax think-content leakage, linked to upstream #511.
3. Expired connection health display, linked to upstream #359.
4. WebDAV export/409/path handling, linked to upstream #493.

Each imported issue states that it is a new evolution tracking issue, links the upstream report, records current reproduction status, and does not imply upstream ownership transfer.

The 17 roadmap issues already fixed in fork main are documented in `優化清單.md`; they are not recreated as issue noise.

## Legacy Repository Transition

The old repository is untouched until `metapi-evolution` has passed source, release, update, Docker, docs, and deployment verification.

After cutover:

1. Create a separate redirect-only commit from the legacy repository's pre-migration main.
2. Put a prominent notice at the top of README files pointing to `yswlww/metapi-evolution`.
3. Update repository description and homepage to the new location.
4. Disable or redirect new issue/discussion entry points to avoid split tracking.
5. Keep source and history accessible for 14 days.
6. Track the archive deadline in the new repository migration issue.
7. Archive `yswlww/metapi` only after the 14-day window and a final link/update audit.

The redirect commit is never merged into `metapi-evolution`.

## Atomic Cutover Sequence

1. Create an isolated migration worktree and branch from the current verified main.
2. Add failing repository identity, update-center, version, and live-link contract tests.
3. Apply repository identity, version, documentation, deployment-link, and release changes.
4. Run focused tests and the complete repository verification matrix.
5. Build and smoke-test the Docker image; render Helm managed/external Secret modes.
6. Complete an independent whole-change review and fix all Critical/Important findings.
7. Create the empty public `yswlww/metapi-evolution` repository.
8. Push reviewed `main` and historical tags.
9. Configure default branch, Issues, Discussions, Actions, Pages, variables, environments, and required secrets.
10. Verify public clone, source links, badges, docs, deployment templates, and Releases API.
11. Tag and publish `v1.4.0`; publish Docker version/SHA/latest tags.
12. Verify release assets, update center, Docker digests, and fresh-install/upgrade paths.
13. Reconfigure local remotes to `origin`/`legacy`/`upstream`.
14. Push the separate legacy redirect commit.
15. Create migration/unresolved issues and start the 14-day archive window.

## Verification Matrix

### Source and repository identity

- No live user-facing link points to `cita-777/metapi` or `yswlww/metapi`, except explicit attribution, legacy notices, historical plans, and upstream issue references.
- `package.json` repository/homepage/bugs fields point to `metapi-evolution`.
- Clone, contributor, badge, issue, PR, discussion, security, deploy, raw asset, and About links resolve publicly.
- New repository clone produces the expected `main` SHA and tags.

### Application and update center

- Focused update-center tests use the evolution Releases API.
- About and desktop navigation tests use the new repository.
- Version comparison, reminder, polling, runtime state, and release parsing remain unchanged.
- A running build can discover `v1.4.0` from the public Releases API.

### Build and runtime

- Full test suite.
- Full typecheck.
- Production web/server/desktop build.
- Repository drift check.
- Full diff check.
- Docker build and HTTP smoke.
- Helm managed and `existingSecret` template rendering.
- Schema and database migration smoke paths remain green.

### Release and external state

- `origin/main` equals the reviewed local main.
- Historical tags exist in the new repository.
- `v1.4.0` release exists and assets are downloadable.
- Docker `v1.4.0`, SHA, and `latest` share one digest.
- README/docs/Pages/deploy links are reachable without authentication.
- Initial unresolved issues exist with correct upstream references.
- Legacy repository notice points to the new repository and no new work is directed there.

## Rollback Strategy

Before public verification, the old repository and existing Docker `latest` remain unchanged.

If repository creation or initial push fails:

- keep the migration branch local;
- delete or repair the empty new repository only after inspecting its state;
- do not change remotes or legacy repository content.

If Actions, Pages, release, or update-center verification fails:

- fix the migration branch/new-repo configuration;
- do not tag `v1.4.0` or publish new `latest` until all required gates pass;
- retain the old repository as the visible source during repair.

If release publication partially succeeds:

- do not overwrite verified old Docker tags;
- remove or correct only the incomplete new release/tag after explicit inspection;
- rerun release and registry verification before announcing cutover.

If the legacy redirect causes an operational problem:

- revert the redirect-only legacy commit;
- keep `metapi-evolution` unchanged;
- postpone the archive deadline.

Local remotes switch only after the new public authority is verified, so rollback never requires rewriting the reviewed migration history.

## Security and Operational Constraints

- Never expose or attempt to read existing repository secrets.
- Never copy signing credentials through files, logs, issue bodies, or release notes.
- Preserve required Docker/Compose authentication guards.
- Preserve security policy and advisory links under the new repository identity.
- Keep the original license and attribution intact.
- Confirm release workflows have the minimum required permissions.
- Treat repository creation, settings changes, pushes, releases, issues, Docker publication, legacy redirect, and archive as separate externally visible actions with inspected outcomes.

## Success Criteria

The migration is complete only when:

1. `yswlww/metapi-evolution` is public and authoritative.
2. Full history, `main`, and historical tags are present.
3. All live source/update/release/docs/deploy links point to the new repository.
4. `v1.4.0` is published and discoverable by the application update center.
5. Docker version/SHA/latest tags are published, identical, and smoke-tested.
6. Full local and public verification passes.
7. The new issue tracker contains only the migration and unresolved evolution work.
8. The legacy repository contains a verified redirect notice.
9. The 14-day archive deadline is tracked but the legacy repository is not archived early.
10. Local remotes use the approved `origin`/`legacy`/`upstream` model.
