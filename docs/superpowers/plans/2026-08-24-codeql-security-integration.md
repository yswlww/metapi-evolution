# CodeQL Security Integration and Alert Disposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the four approved security remediations, perform complete verification and review, dismiss only proven false positives, and produce a clear local handoff for CodeQL re-scan.

**Architecture:** Execute the independent subsystem plans in a low-conflict order, then verify the repository as one system. GitHub alert updates are limited to semantic/test-only false positives whose current code flow has been documented; code-fixed alerts remain open until a pushed commit is scanned.

**Tech Stack:** Git, Vitest, TypeScript, Vite build, CodeQL alert REST API through `gh`.

**Spec:** `docs/superpowers/specs/2026-08-24-codeql-security-remediation-design.md`

## Global Constraints

- Execute each referenced plan with TDD and its own review gate.
- Do not push or merge.
- Do not dismiss a real code finding before CodeQL scans the fix.
- Dismiss only alerts #9, #10, #14, #16, and #17 with specific evidence.
- Do not batch-dismiss remaining rate-limit alerts; wait for the recognized global plugin to be scanned.
- Preserve the AxonHub commit `26f6db1` and design commit `85943fe`.

## Execution Order

1. `docs/superpowers/plans/2026-08-24-provider-url-identity-hardening.md`
2. `docs/superpowers/plans/2026-08-24-announcement-sanitization-hardening.md`
3. `docs/superpowers/plans/2026-08-24-legacy-ldoh-monitor-removal.md`
4. `docs/superpowers/plans/2026-08-24-request-rate-boundary.md`
5. This integration and alert-disposition plan

This order lands narrow pure-logic changes before the dependency and root-server boundary change.

---

### Task 1: Confirm subsystem commits and working tree

- [ ] **Step 1: Inspect history and status**

```bash
git log --oneline --decorate -20
git status --short --branch
```

Expected: each subsystem plan has committed its changes; the working tree is clean before final integration work.

- [ ] **Step 2: Inspect cumulative diff from the approved design commit**

```bash
git diff --stat 85943fe..HEAD
git diff --check 85943fe..HEAD
```

Expected: only security-remediation files and plan documents; no whitespace errors.

---

### Task 2: Run complete security verification

- [ ] **Step 1: Run targeted security tests**

```bash
npx vitest run --root . \
  src/shared/platformIdentity.test.ts \
  src/server/services/platforms/index.test.ts \
  src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts \
  src/web/pages/helpers/siteAnnouncementPresentation.test.tsx \
  src/server/routes/api/monitor.test.ts \
  src/web/pages/Monitors.internal.test.tsx \
  src/desktop/navigationGuard.test.ts \
  src/server/config.test.ts \
  src/server/middleware/requestRateLimit.test.ts \
  src/server/middleware/globalRateLimit.test.ts \
  src/server/middleware/auth.proxy.test.ts \
  src/server/desktop.test.ts \
  src/server/routes/api/auth.test.ts \
  src/server/routes/proxy/gemini.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run DOM sanitizer environment**

```bash
npx vitest run --root . --environment jsdom src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
```

Expected: all DOM sanitizer tests pass with no dangerous-element assertions failing.

- [ ] **Step 3: Run full project verification**

```bash
npm test
npm run typecheck
npm run repo:drift-check
npm run build
git diff --check
```

Expected: every command exits `0`. Record exact test-file/test totals and build output for the final report.

- [ ] **Step 4: Run static security searches**

```bash
rg -n "includes\('api\.openai\.com|includes\('api\.anthropic\.com|includes\('generativelanguage\.googleapis\.com|includes\('cloudcode-pa\.googleapis\.com" src
rg -n "extractVisibleTextFallback|<script\[\\s\\S\]|<style\[\\s\\S\]" src/web/pages/helpers/siteAnnouncementPresentation.tsx
rg -n "ldoh\.105117\.xyz|monitor-proxy/ldoh|monitor_ldoh_cookie|ld_auth_session" src
```

Expected: no unsafe production matches.

---

### Task 3: Request correctness and security review

- [ ] **Step 1: Dispatch a read-only reviewer**

Provide:

- spec path;
- all four plan paths;
- base SHA `85943fe`;
- current HEAD;
- CodeQL alert families and intended dispositions;
- verification output.

Require exact file/line findings grouped by Critical, Important, and Minor, plus a ready-to-merge verdict.

- [ ] **Step 2: Verify every finding before editing**

Use `superpowers:receiving-code-review`. For each confirmed issue, write a failing regression test, implement the smallest fix, rerun focused tests, then re-request verification from the same reviewer.

- [ ] **Step 3: Re-run full verification after any review fix**

```bash
npm test
npm run typecheck
npm run repo:drift-check
npm run build
git diff --check
```

Expected: all commands exit `0`.

---

### Task 4: Dismiss confirmed false positives with evidence

**External effect:** These GitHub API calls update the repository’s security dashboard. The user approved documented false-positive dismissal in the security design.

- [ ] **Step 1: Re-fetch each alert before dismissal**

```bash
for alert in 9 10 14 16 17; do
  gh api "repos/yswlww/metapi-evolution/code-scanning/alerts/${alert}"
done
```

Verify each remains open and still points to the previously triaged location/rule. Stop if any alert changed meaning or location.

- [ ] **Step 2: Dismiss #9**

```bash
gh api --method PATCH repos/yswlww/metapi-evolution/code-scanning/alerts/9 \
  -f state=dismissed \
  -f dismissed_reason='false positive' \
  -f dismissed_comment='SHA-256 is used for a deterministic route-channel identity composed of numeric database IDs and a model name. The digest backs deduplication and a unique index; no password, API token, OAuth token, or other credential reaches this hash.'
```

- [ ] **Step 3: Dismiss #10**

```bash
gh api --method PATCH repos/yswlww/metapi-evolution/code-scanning/alerts/10 \
  -f state=dismissed \
  -f dismissed_reason='false positive' \
  -f dismissed_comment='The hashed value is an overlong model identifier used only to bound a process-local endpoint-preference cache key. It is not a password or authentication credential, and OAuth access tokens do not flow into this value.'
```

- [ ] **Step 4: Dismiss test-only alerts #14 and #17**

```bash
gh api --method PATCH repos/yswlww/metapi-evolution/code-scanning/alerts/14 \
  -f state=dismissed \
  -f dismissed_reason='used in tests' \
  -f dismissed_comment='This handler exists only in a Vitest-created Fastify app in auth.proxy.test.ts and is never registered by the production server.'

gh api --method PATCH repos/yswlww/metapi-evolution/code-scanning/alerts/17 \
  -f state=dismissed \
  -f dismissed_reason='used in tests' \
  -f dismissed_comment='This handler exists only in a Vitest-created Fastify app in auth.proxy.test.ts and is never registered by the production server.'
```

- [ ] **Step 5: Dismiss shutdown-hook alert #16**

```bash
gh api --method PATCH repos/yswlww/metapi-evolution/code-scanning/alerts/16 \
  -f state=dismissed \
  -f dismissed_reason='false positive' \
  -f dismissed_comment='The flagged callback is Fastify onClose lifecycle cleanup, not an HTTP request handler and not externally invocable. Rate limiting is not applicable to server shutdown hooks.'
```

- [ ] **Step 6: Verify dispositions**

```bash
for alert in 9 10 14 16 17; do
  gh api "repos/yswlww/metapi-evolution/code-scanning/alerts/${alert}" \
    --jq '[.number, .state, .dismissed_reason, .dismissed_comment]'
done
```

Expected: all five report `dismissed` with the intended rationale.

---

### Task 5: Final handoff

- [ ] **Step 1: Confirm review fixes were committed in their owning subsystem**

```bash
git status --short --branch
```

Expected: clean worktree. If a reviewer-required fix is still uncommitted, return to the owning subsystem plan, complete its red-green cycle, and commit that exact fix there before continuing. Do not create an empty integration commit.

- [ ] **Step 2: Record final repository state**

```bash
git status --short --branch
git log --oneline --decorate -15
git diff --stat 85943fe..HEAD
```

Expected: clean worktree.

- [ ] **Step 3: Re-fetch open alerts**

```bash
gh api --paginate "repos/yswlww/metapi-evolution/code-scanning/alerts?state=open&per_page=100" \
  --jq '.[] | [.number, .rule.id, .most_recent_instance.location.path, .most_recent_instance.location.start_line] | @tsv'
```

Explain that code-fixed alerts remain open on the dashboard until this branch is pushed/merged and a new CodeQL analysis runs. Do not dismiss those alerts against the old analysis.

- [ ] **Step 4: Final report**

Report:

- AxonHub commit `26f6db1`;
- security design commit `85943fe`;
- all security implementation commit IDs;
- exact verification totals;
- five false-positive alert dispositions;
- code-fixed alerts awaiting re-scan;
- no push performed;
- reminder to rotate the previously exposed AxonHub test API key.
