# Provider URL Identity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate raw URL substring provider detection so platform identity depends only on parsed HTTP(S) hostname and bounded path rules.

**Architecture:** Strengthen the shared `platformIdentity` parser and make OpenAI, Claude, Gemini, Gemini CLI, and AxonHub adapters delegate to it. Update CodeQL-flagged test fixtures to parse hostnames instead of searching raw URLs.

**Tech Stack:** JavaScript shared module with TypeScript declarations, TypeScript adapters, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-codeql-security-remediation-design.md`

## Global Constraints

- Accept existing scheme-less provider input by trying `https://`.
- Accept only `http:` and `https:`.
- Compare `URL.hostname`, never the raw URL, userinfo, path, query, or fragment.
- Use exact hostnames except the intentional `.googleapis.com` label-boundary family.
- Path prefixes must use segment boundaries.
- Provider adapters reuse the shared identity rule instead of duplicating host logic.
- Fix CodeQL alerts #1–#7 as one family.
- Do not push.

## File Structure

- Modify `src/shared/platformIdentity.js`: enforce protocol and path boundaries in one source of truth.
- Modify `src/shared/platformIdentity.d.ts`: expose any shared helper required by tests/consumers.
- Modify `src/shared/platformIdentity.test.ts`: table-driven valid and adversarial URL cases.
- Modify `src/server/services/platforms/openai.ts`: delegate detection to shared identity.
- Modify `src/server/services/platforms/claude.ts`: delegate detection to shared identity.
- Modify `src/server/services/platforms/gemini.ts`: delegate detection to shared identity.
- Modify `src/server/services/platforms/geminiCli.ts`: delegate detection to shared identity.
- Verify `src/server/services/platforms/axonHub.ts` already follows the shared pattern.
- Modify `src/server/services/platforms/index.test.ts`: integration tests for malicious URLs and correct platform results.
- Modify `src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts`: parse fixture hostnames, closing test-only alerts #1–#2.

---

### Task 1: Harden shared URL parsing and path boundaries

**Files:**
- Modify: `src/shared/platformIdentity.js`
- Modify: `src/shared/platformIdentity.d.ts`
- Test: `src/shared/platformIdentity.test.ts`

**Interfaces:**
- Preserve:

```ts
export function detectPlatformByUrlHint(url: string): string | undefined;
```

- Optionally expose for reuse/tests:

```ts
export function parseHttpUrlCandidate(url: unknown): URL | null;
```

If exported, declare it in `.d.ts`. Do not expose separate host rules.

- [ ] **Step 1: Add failing adversarial tests**

Add a table with literal expected values:

```ts
it.each([
  ['https://api.openai.com/v1', 'openai'],
  ['api.openai.com/v1', 'openai'],
  ['https://api.anthropic.com/v1/messages', 'claude'],
  ['https://generativelanguage.googleapis.com/v1beta', 'gemini'],
  ['https://foo.googleapis.com/v1beta/openai', 'gemini'],
  ['https://cloudcode-pa.googleapis.com', 'gemini-cli'],
] as const)('detects safe provider URL %s', (url, expected) => {
  expect(detectPlatformByUrlHint(url)).toBe(expected);
});

it.each([
  'https://api.openai.com.attacker.test/',
  'https://attacker.test/api.openai.com/v1',
  'https://api.openai.com@attacker.test/',
  'https://api.anthropic.com.attacker.test/',
  'https://attacker.test/anthropic.com/v1',
  'https://generativelanguage.googleapis.com.attacker.test/',
  'https://attacker.test/gemini.google.com',
  'https://foo.googleapis.com.attacker.test/v1beta/openai',
  'https://foo.googleapis.com/v1beta/openai-evil',
  'javascript://api.openai.com',
] as const)('rejects provider text outside a safe HTTP URL identity: %s', (url) => {
  expect(detectPlatformByUrlHint(url)).toBeUndefined();
});
```

Also add explicit path-boundary cases for Qianfan, Codex, Anthropic, and Gemini OpenAI-compatible paths.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run --root . src/shared/platformIdentity.test.ts
```

Expected failures include non-HTTP schemes and `/v1beta/openai-evil` being accepted by current prefix matching.

- [ ] **Step 3: Implement HTTP-only parsing**

Replace the private parser with:

```js
export function parseHttpUrlCandidate(url) {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) return null;
  const candidates = normalized.includes('://') ? [normalized] : [`https://${normalized}`];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      return parsed;
    } catch {}
  }
  return null;
}

function matchesPathSegment(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
```

Use `matchesPathSegment` for every semantic path rule instead of unrestricted `startsWith`.

- [ ] **Step 4: Preserve intentional host behavior**

Keep exact host checks for official providers. Preserve:

```js
host === 'googleapis.com' || host.endsWith('.googleapis.com')
```

Do not replace it with `endsWith('googleapis.com')`.

Keep branded self-hosted hints scoped to the parsed hostname. They may inspect hostname labels but never the full raw URL.

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run --root . src/shared/platformIdentity.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/platformIdentity.js src/shared/platformIdentity.d.ts src/shared/platformIdentity.test.ts
git commit -m "security: harden provider URL identity" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Make provider adapters reuse shared identity

**Files:**
- Modify: `src/server/services/platforms/openai.ts`
- Modify: `src/server/services/platforms/claude.ts`
- Modify: `src/server/services/platforms/gemini.ts`
- Modify: `src/server/services/platforms/geminiCli.ts`
- Verify/modify: `src/server/services/platforms/axonHub.ts`
- Test: `src/server/services/platforms/index.test.ts`

**Interfaces:**
- Every affected adapter keeps:

```ts
async detect(url: string): Promise<boolean>;
```

- Each implementation compares shared canonical identity to `this.platformName`.

- [ ] **Step 1: Add failing adapter integration cases**

Change the existing test that currently preserves path-based OpenAI classification. It must now expect no detection:

```ts
const adapter = await detectPlatform(`${baseUrl}/api.openai.com/v1`);
expect(adapter).toBeUndefined();
```

Add table-driven adapter cases that never perform network I/O:

```ts
it.each([
  ['openai', 'https://api.openai.com.attacker.test/'],
  ['claude', 'https://api.anthropic.com.attacker.test/'],
  ['gemini', 'https://generativelanguage.googleapis.com.attacker.test/'],
  ['gemini-cli', 'https://cloudcode-pa.googleapis.com.attacker.test/'],
] as const)('does not let %s detect look-alike URL %s', async (platform, url) => {
  const adapter = getAdapter(platform);
  expect(adapter).toBeDefined();
  await expect(adapter!.detect(url)).resolves.toBe(false);
});
```

The local ephemeral-server path case exercises full registry fallback without contacting the public network.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run --root . src/server/services/platforms/index.test.ts
```

Expected: FAIL for raw substring detectors.

- [ ] **Step 3: Delegate to shared identity**

In each adapter:

```ts
import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';

async detect(url: string): Promise<boolean> {
  return detectPlatformByUrlHint(url) === this.platformName;
}
```

For `GeminiCliAdapter`, the same implementation returns only `gemini-cli`; it does not inherit Gemini’s broader result.

Do not alter model-discovery methods.

- [ ] **Step 4: Verify GREEN and provider model tests**

```bash
npx vitest run --root . \
  src/server/services/platforms/index.test.ts \
  src/server/services/platforms/claude.test.ts \
  src/server/services/platforms/llmUpstream.test.ts
npm run typecheck:server
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/platforms/openai.ts src/server/services/platforms/claude.ts src/server/services/platforms/gemini.ts src/server/services/platforms/geminiCli.ts src/server/services/platforms/axonHub.ts src/server/services/platforms/index.test.ts
git commit -m "security: centralize provider detection" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Remove URL substring logic from pricing test fixtures

**Files:**
- Modify: `src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts:68-90`

- [ ] **Step 1: Add a failing fixture-routing regression**

Extract or inline hostname parsing in the fetch mock, then add a request URL whose path contains a fixture hostname:

```ts
const unrelated = 'https://attacker.test/path/pricing-a.example.com';
```

Assert it does not receive the pricing-A fixture and follows the mock’s unknown-host branch.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run --root . src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts
```

Expected: FAIL because the current mock uses `includes('pricing-a.example.com')`.

- [ ] **Step 3: Parse the hostname in the mock**

Replace raw substring checks with:

```ts
const hostname = (() => {
  try {
    return new URL(normalizedUrl).hostname;
  } catch {
    return '';
  }
})();

if (hostname === 'pricing-a.example.com') {
  // existing fixture A
} else if (hostname === 'pricing-b.example.com') {
  // existing fixture B
}
```

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run --root . src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts
git commit -m "test: parse pricing fixture hostnames" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Verify URL alert family

- [ ] **Step 1: Run focused tests**

```bash
npx vitest run --root . \
  src/shared/platformIdentity.test.ts \
  src/server/services/platforms/index.test.ts \
  src/server/services/platforms/claude.test.ts \
  src/server/services/platforms/llmUpstream.test.ts \
  src/server/routes/api/tokens.route-decision-refresh-pricing.test.ts
```

- [ ] **Step 2: Run static verification**

```bash
rg -n "includes\('api\.openai\.com|includes\('api\.anthropic\.com|includes\('generativelanguage\.googleapis\.com|includes\('cloudcode-pa\.googleapis\.com|includes\('pricing-[ab]\.example\.com" src
npm run typecheck
git diff --check
```

Expected: `rg` returns no unsafe detector/test matches; typecheck and diff check exit `0`.
