# Google OAuth Secret Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all hard-coded Gemini CLI and Antigravity Google OAuth client material from `yswlww/metapi-evolution` current code/tests and require runtime environment configuration.

**Architecture:** Store all four OAuth values only in `config`, sourced from environment variables and empty by default. Gemini CLI retains its existing lazy validation; Antigravity gains the same provider-local lazy validation before authorization/token flows. Tests use obviously non-production fixtures.

**Tech Stack:** TypeScript, existing config parser, OAuth provider registry, Vitest.

**Spec:** User-approved secret-scanning addendum to `docs/superpowers/specs/2026-08-24-codeql-security-remediation-design.md`: remediate only `yswlww/metapi-evolution`; do not modify upstream, rotate Google credentials, rewrite Git history, or falsely resolve alerts as revoked.

## Global Constraints

- Remove the four literal Google OAuth values from current production code and tests.
- Exact environment names: `GEMINI_CLI_CLIENT_ID`, `GEMINI_CLI_CLIENT_SECRET`, `ANTIGRAVITY_CLIENT_ID`, `ANTIGRAVITY_CLIENT_SECRET`.
- All four values default to empty strings after trimming.
- Do not fail process startup when unused providers are unconfigured.
- Fail clearly and before network requests when a requested provider lacks configuration.
- Preserve loopback redirects, scopes, provider registration, authorization/token request shape, refresh behavior, and model/proxy behavior.
- Test credentials must be unmistakably synthetic and must not match provider secret-scanning formats.
- Do not contact or modify `cita-777/metapi`.
- Do not rotate/revoke Google Cloud clients, rewrite Git history, push, or mark GitHub alerts revoked.

## File Structure

- Modify `src/server/config.ts`: remove Gemini defaults; add environment-only Antigravity fields.
- Modify `src/server/config.test.ts`: default-empty and trimmed-fixture tests; remove real values.
- Modify `src/server/services/oauth/antigravityProvider.ts`: consume config and add lazy validation.
- Modify `src/server/routes/api/oauth.test.ts`: set synthetic config values and test missing-config/URL/token flows.
- Modify `.env.example`: blank required-when-used variables for both providers.
- Modify `docker/docker-compose.yml`, `docker/.env.example`, `README.md`, `README_EN.md`, and `docs/getting-started.md`: propagate blank runtime variables through Compose examples.
- Modify `render.yaml` and `zeabur-template.yaml`: propagate runtime variables through hosted deployment templates without defaults.
- Modify `deploy/k3s/chart/values.yaml` and `deploy/k3s/chart/templates/secret.yaml`: propagate blank values through the managed Helm Secret while preserving `existingSecret` behavior.
- Modify `scripts/dev/docker.workflow.test.ts` and `src/server/update-helper/k3sAssets.test.ts`: verify deployment propagation and blank defaults.
- Modify `docs/k3s-update-center.md`: document the four environment keys for external Secrets.
- Modify `docs/configuration.md`: document empty defaults and required-when-used semantics.
- Modify `docs/oauth.md`: preparation note for runtime OAuth client configuration.

---

### Task 1: Remove configuration defaults

**Files:**
- Modify: `src/server/config.ts:5-10,66-80`
- Test: `src/server/config.test.ts`

**Interfaces:**

`buildConfig(env)` produces:

```ts
geminiCliClientId: string;
geminiCliClientSecret: string;
antigravityClientId: string;
antigravityClientSecret: string;
```

- [ ] **Step 1: Write failing default-empty tests**

```ts
it('does not embed Google OAuth client material by default', () => {
  const config = buildConfig({});
  expect(config.geminiCliClientId).toBe('');
  expect(config.geminiCliClientSecret).toBe('');
  expect(config.antigravityClientId).toBe('');
  expect(config.antigravityClientSecret).toBe('');
});

it('trims runtime Google OAuth configuration', () => {
  const config = buildConfig({
    GEMINI_CLI_CLIENT_ID: ' gemini-test-client-id ',
    GEMINI_CLI_CLIENT_SECRET: ' gemini-test-client-secret ',
    ANTIGRAVITY_CLIENT_ID: ' antigravity-test-client-id ',
    ANTIGRAVITY_CLIENT_SECRET: ' antigravity-test-client-secret ',
  });
  expect(config.geminiCliClientId).toBe('gemini-test-client-id');
  expect(config.geminiCliClientSecret).toBe('gemini-test-client-secret');
  expect(config.antigravityClientId).toBe('antigravity-test-client-id');
  expect(config.antigravityClientSecret).toBe('antigravity-test-client-secret');
});
```

Delete existing expectations containing real client values.

- [ ] **Step 2: Run RED**

```bash
npx vitest run --root . src/server/config.test.ts
```

Expected: default-empty and missing Antigravity fields fail.

- [ ] **Step 3: Implement environment-only config**

Delete Gemini default constants. Use:

```ts
geminiCliClientId: parseOptionalSecret(env.GEMINI_CLI_CLIENT_ID),
geminiCliClientSecret: parseOptionalSecret(env.GEMINI_CLI_CLIENT_SECRET),
antigravityClientId: parseOptionalSecret(env.ANTIGRAVITY_CLIENT_ID),
antigravityClientSecret: parseOptionalSecret(env.ANTIGRAVITY_CLIENT_SECRET),
```

- [ ] **Step 4: Run GREEN and static literal scan**

```bash
npx vitest run --root . src/server/config.test.ts
set +e
git grep -l -E 'GOCSPX-|\.apps\.googleusercontent\.com' -- src/server/config.ts src/server/config.test.ts >/tmp/metapi-google-oauth-scan
scan_status=$?
set -e
if [ "$scan_status" -eq 0 ]; then printf 'unexpected detector match\n'; exit 1; fi
test "$scan_status" -eq 1
npm run typecheck:server
```

Expected: tests/typecheck pass; the no-match `git grep` scan exits `1` and prints no values.

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts src/server/config.test.ts
git commit -m "security: remove embedded Gemini OAuth credentials" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Make Antigravity configuration lazy and explicit

**Files:**
- Modify: `src/server/services/oauth/antigravityProvider.ts`
- Modify: `src/server/routes/api/oauth.test.ts`

**Interfaces:**

Add private helper:

```ts
function requireAntigravityOAuthConfig(): {
  clientId: string;
  clientSecret: string;
};
```

Errors are exact:

```text
ANTIGRAVITY_CLIENT_ID is not configured
ANTIGRAVITY_CLIENT_SECRET is not configured
```

- [ ] **Step 1: Write missing-config and synthetic-flow tests**

Before dynamic provider imports, set `config.geminiCliClientId`, `config.geminiCliClientSecret`, `config.antigravityClientId`, and `config.antigravityClientSecret` to synthetic fixture values; save and restore originals.

Add direct/provider route cases proving:

1. Antigravity authorization start with empty ID fails with the exact ID error and performs no fetch.
2. With ID set and secret empty, code exchange/refresh fails with the exact secret error and performs no fetch.
3. Authorization URL contains `antigravity-test-client-id`.
4. Token request body contains the synthetic Antigravity ID/secret.
5. Existing Gemini missing-config errors become effective now that defaults are gone.

- [ ] **Step 2: Run RED**

```bash
npx vitest run --root . src/server/routes/api/oauth.test.ts
```

Expected: Antigravity missing-config behavior and synthetic request assertions fail while literals remain.

- [ ] **Step 3: Implement provider-local validation**

Import `config`. Remove exported literal client ID/secret constants. Add:

```ts
function requireAntigravityOAuthConfig() {
  const clientId = config.antigravityClientId;
  const clientSecret = config.antigravityClientSecret;
  if (!clientId) throw new Error('ANTIGRAVITY_CLIENT_ID is not configured');
  if (!clientSecret) throw new Error('ANTIGRAVITY_CLIENT_SECRET is not configured');
  return { clientId, clientSecret };
}
```

Call it in `buildAuthorizationUrl`, `exchangeAuthorizationCode`, and `refreshAccessToken`; use returned values in URL/token parameters. Validation must happen before `fetch`.

- [ ] **Step 4: Run GREEN and focused OAuth verification**

```bash
npx vitest run --root . src/server/routes/api/oauth.test.ts
npm run typecheck:server
set +e
git grep -l -E 'GOCSPX-|\.apps\.googleusercontent\.com' -- src/server/services/oauth/antigravityProvider.ts src/server/routes/api/oauth.test.ts >/tmp/metapi-google-oauth-scan
scan_status=$?
set -e
if [ "$scan_status" -eq 0 ]; then printf 'unexpected detector match\n'; exit 1; fi
test "$scan_status" -eq 1
```

Expected: tests/typecheck pass; the no-match `git grep` scan exits `1` and prints no values.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/oauth/antigravityProvider.ts src/server/routes/api/oauth.test.ts
git commit -m "security: require Antigravity OAuth configuration" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Document and verify secret removal

**Files:**
- Modify: `.env.example`
- Modify: `docs/configuration.md`
- Modify: `docs/oauth.md`

- [ ] **Step 1: Update blank environment template**

Use no sample credential-shaped values:

```dotenv
# Required only when using Gemini CLI OAuth.
GEMINI_CLI_CLIENT_ID=
GEMINI_CLI_CLIENT_SECRET=
# Required only when using Antigravity OAuth.
ANTIGRAVITY_CLIENT_ID=
ANTIGRAVITY_CLIENT_SECRET=
```

- [ ] **Step 2: Update documentation**

Document all four defaults as empty and required only when that provider is used. Remove claims that Gemini CLI has built-in defaults or Antigravity needs no configuration. State that deployment secret managers or untracked environment files must be used.

- [ ] **Step 3: Run complete tracked-tree secret scan and verification**

The scan must cover every tracked source, template, script, test, root file, and document. Exclude only this plan, which contains detector patterns as verification prose; do not print matched values.

```bash
set +e
git grep -l -E 'GOCSPX-|[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com' -- . ':(exclude)docs/superpowers/plans/2026-08-24-google-oauth-secret-removal.md' >/tmp/metapi-google-oauth-scan
scan_status=$?
set -e
if [ "$scan_status" -eq 0 ]; then printf 'unexpected detector match in tracked source\n'; exit 1; fi
test "$scan_status" -eq 1
npx vitest run --root . src/server/config.test.ts src/server/routes/api/oauth.test.ts scripts/dev/docker.workflow.test.ts src/server/update-helper/k3sAssets.test.ts
npm run typecheck
npm run repo:drift-check
git diff --check
npm test
```

Expected: the no-match `git grep` command returns its native exit `1`, the wrapper accepts that status without printing values, and all subsequent verification commands exit `0`.

- [ ] **Step 4: Commit the final-review fix wave**

```bash
git add .env.example docker/docker-compose.yml docker/.env.example README.md README_EN.md \
  docs/getting-started.md docs/configuration.md docs/oauth.md docs/k3s-update-center.md \
  render.yaml zeabur-template.yaml deploy/k3s/chart/values.yaml \
  deploy/k3s/chart/templates/secret.yaml scripts/dev/docker.workflow.test.ts \
  src/server/update-helper/k3sAssets.test.ts src/server/config.test.ts \
  src/server/routes/api/oauth.test.ts docs/superpowers/plans/2026-08-24-google-oauth-secret-removal.md
git commit -m "security: propagate Google OAuth configuration through deployments" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Record unresolved history state**

Report that GitHub Secret Scanning alerts #1-#4 may remain open because historical commits still contain the old values. Do not resolve them as revoked, rewrite history, contact upstream, or push as part of this plan.
