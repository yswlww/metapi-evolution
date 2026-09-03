# Announcement Sanitization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove regex-based HTML sanitization fallback and prove announcement content cannot produce executable markup in DOM or non-DOM environments.

**Architecture:** Keep the current browser DOM allowlist sanitizer. When DOM APIs are unavailable, render the entire untrusted input as escaped plain text; never parse HTML with regular expressions.

**Tech Stack:** React 18, Marked 18, DOMParser/jsdom, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-codeql-security-remediation-design.md`

## Global Constraints

- Announcement content remains untrusted from upstream source through rendering.
- Browser DOM allowlist behavior remains intact.
- No-DOM execution must produce escaped plain text only.
- Remove `extractVisibleTextFallback` and every regex that attempts to remove script/style/HTML tags.
- Preserve safe HTTPS links, Markdown structure, and code-fence text in DOM-capable browsers.
- Close CodeQL alerts #11–#13 without adding a sanitizer dependency.
- Do not push.

## File Structure

- Modify `src/web/pages/helpers/siteAnnouncementPresentation.tsx`: remove regex fallback and fail closed to plain text.
- Modify `src/web/pages/helpers/siteAnnouncementPresentation.test.tsx`: add fallback, DOM, Markdown, and sink-level adversarial tests.

---

### Task 1: Replace regex fallback with escaped plain text

**Files:**
- Modify: `src/web/pages/helpers/siteAnnouncementPresentation.tsx:73-81,310-318`
- Test: `src/web/pages/helpers/siteAnnouncementPresentation.test.tsx`

**Interfaces:**
- Preserve exported function:

```ts
export function renderSiteAnnouncementHtml(content: string): string;
```

- [ ] **Step 1: Write failing no-DOM fallback tests**

The default Vitest Node environment has no `DOMParser`. Add literal overlap payloads:

```ts
it('escapes raw announcement markup when DOM parsing is unavailable', () => {
  const payload = [
    '<scr<script>removed</script>ipt>alert(1)</script>',
    '<sty<style>removed</style>le>body{display:none}</style>',
    '<img src=x onerror=alert(1)>',
  ].join('\n');

  const html = renderSiteAnnouncementHtml(payload);

  expect(html).not.toContain('<script');
  expect(html).not.toContain('<style');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;scr&lt;script&gt;');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});
```

Add malformed closing tags:

```ts
expect(renderSiteAnnouncementHtml('<script>alert(1)</script >')).toContain('&lt;script&gt;');
```

Do not skip these tests when DOM APIs are unavailable; this task specifically tests that environment.

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run --root . src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
```

Expected: FAIL because the current regex fallback removes or transforms markup instead of preserving it as escaped text.

- [ ] **Step 3: Implement fail-closed fallback**

Delete `extractVisibleTextFallback` entirely. Change:

```ts
if (typeof DOMParser !== 'function' || typeof Node === 'undefined') {
  return renderPlainText(html);
}
```

Do not add another HTML regex.

- [ ] **Step 4: Verify GREEN in Node environment**

```bash
npx vitest run --root . src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
```

Expected: fallback tests pass; DOM-dependent tests remain skipped only in the Node environment.

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/helpers/siteAnnouncementPresentation.tsx src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
git commit -m "security: fail closed for announcement markup" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add DOM and Markdown adversarial coverage

**Files:**
- Modify: `src/web/pages/helpers/siteAnnouncementPresentation.test.tsx`

- [ ] **Step 1: Add a DOM sanitizer payload matrix**

Under `itWithDomSupport`, render content containing:

```ts
const payload = [
  '<script>alert(1)</script>',
  '<style>body{display:none}</style>',
  '<img src="https://example.com/a.png" onerror="alert(1)">',
  '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
  '<a href="https://example.com/safe">safe</a>',
  '<iframe src="https://attacker.test"></iframe>',
].join('');
```

Assert no dropped elements, event attributes, or JavaScript URL survive, while the safe HTTPS link does.

- [ ] **Step 2: Add Markdown/raw-HTML tests**

Use content containing:

````md
[bad](javascript:alert(1))

<script>alert(1)</script>

```html
<script>literal code</script>
```
````

Assert the bad link and raw executable tag do not survive, while the fenced tag appears only as escaped code text inside `<pre><code>`.

- [ ] **Step 3: Add sink-level jsdom inspection**

Take `renderSiteAnnouncementHtml(payload)`, assign it to a jsdom container’s `innerHTML`, then assert:

```ts
expect(container.querySelector('script, style, iframe, object, embed')).toBeNull();
expect(container.querySelector('[onclick], [onerror]')).toBeNull();
expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
```

- [ ] **Step 4: Run jsdom suite**

```bash
npx vitest run --root . --environment jsdom src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
```

Expected: all tests pass with zero skips for DOM sanitizer cases.

- [ ] **Step 5: Run both environments and typecheck**

```bash
npx vitest run --root . src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
npx vitest run --root . --environment jsdom src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
npm run typecheck:web:test
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit tests**

```bash
git add src/web/pages/helpers/siteAnnouncementPresentation.test.tsx
git commit -m "test: cover hostile announcement markup" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
