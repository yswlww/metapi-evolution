# CodeQL Security Remediation Design

**Date:** 2026-08-24  
**Status:** Approved  
**Repository:** `yswlww/metapi-evolution`

## 1. Purpose

Resolve the open GitHub CodeQL findings without silencing real vulnerabilities, while preserving the current Metapi monitoring experience and normal provider-development workflow.

The open scan contains several independent alert families:

- missing request rate limiting;
- incomplete URL substring validation;
- announcement HTML fallback sanitization;
- apparent insufficient password hashing;
- a request-forgery finding in the legacy LDOH monitor proxy.

The remediation distinguishes exploitable or defense-relevant findings from test-only and semantic false positives. Production fixes are preferred over suppressions. Dismissal is reserved for findings whose data flow has been verified not to represent the reported vulnerability.

## 2. Goals

1. Add one automatic, CodeQL-recognized request-rate boundary for existing and future routes.
2. Prevent provider detection from trusting hostnames embedded in URL paths, userinfo, queries, or look-alike domains.
3. Make announcement sanitization fail closed when DOM parsing is unavailable.
4. Remove the obsolete LDOH same-origin reverse proxy and its credential surface while retaining the current built-in monitor page.
5. Document and dismiss only confirmed false positives.
6. Preserve current provider onboarding: adding a provider adapter must not require new rate-limit configuration.

## 3. Non-goals

- No distributed/shared rate-limit store is introduced in this change. The default remains process-local; multi-instance deployments are documented as requiring a shared store for cluster-wide enforcement.
- No database migration deletes the legacy `monitor_ldoh_cookie` setting. Existing values become inert.
- No new generic SSRF proxy framework is built because the only flagged outbound monitor proxy is being removed.
- No Git push or merge is performed as part of this task.
- No CodeQL alert is dismissed merely to obtain an empty dashboard.

## 4. Approved Architecture

### 4.1 Global request-rate boundary

Register `@fastify/rate-limit` exactly once, immediately after creating the root Fastify instance and before authentication hooks or route registration.

Registration order:

1. create Fastify app;
2. register `@fastify/rate-limit` globally;
3. register CORS;
4. install authentication hooks;
5. register API and proxy routes.

All subsequently registered routes, including routes added for future providers, inherit the global limiter automatically. Existing route-specific guards remain and continue to impose lower limits on sensitive operations such as login, token changes, OAuth mutations, monitor refreshes, and account verification.

#### Limit configuration

Add environment-backed configuration with these defaults:

- `REQUEST_RATE_LIMIT_MAX=12000`
- `REQUEST_RATE_LIMIT_WINDOW_MS=60000`
- `AUTHENTICATED_RATE_LIMIT_MAX=1200`

The CodeQL-recognized global limit is a coarse socket-level safety ceiling. A second authenticated guard applies the lower per-credential ceiling after authentication. `/health` and equivalent side-effect-free readiness probes may explicitly disable the global limit. OAuth callbacks and other public routes are not globally exempted merely because they are public.

#### Key generation

Use two complementary buckets so neither forwarding-header spoofing nor random invalid credentials bypasses the request boundary.

1. The global Fastify plugin keys requests by the TCP socket remote address (`request.raw.socket.remoteAddress`), not `X-Forwarded-For`. This limits unauthenticated or randomly credentialed floods before database-backed proxy authentication. Deployments behind one reverse proxy can raise the configurable coarse ceiling or use a shared production store.
2. After successful proxy authentication, a credential guard keys managed credentials by their database key ID and the global proxy credential by a fixed global bucket. No raw API key is stored in the limiter.
3. After successful admin authentication, protected `/api/*` requests use one authenticated-admin bucket.

The authenticated guards extend the existing request-rate helper with an explicit trusted key generator; they do not derive identity from forwarding headers. Changing `X-Forwarded-For` therefore cannot change either an authenticated admin or proxy bucket.

The response for exceeded limits is HTTP `429`, includes `Retry-After`, and uses the project’s JSON error style.

### 4.2 Shared URL identity boundary

Provider detection must use one shared URL parser and rule set.

The shared parser:

1. trims string input;
2. attempts `https://` for scheme-less input;
3. parses with `URL`;
4. accepts only `http:` and `https:`;
5. normalizes `hostname` and `pathname` separately;
6. never searches the full raw URL for provider substrings.

Host rules use exact equality unless an intentional subdomain family is required. The Google API family uses a label boundary:

```text
host === "googleapis.com" || host.endsWith(".googleapis.com")
```

Path rules use segment boundaries. For example, `/v1beta/openai` and `/v1beta/openai/...` match, while `/v1beta/openai-evil` does not.

OpenAI, Claude, Gemini, Gemini CLI, and AxonHub adapters reuse the shared platform hint instead of maintaining raw `includes()` checks. Test URL fixtures that branch by upstream hostname also parse and compare `URL.hostname`, preventing test-only CodeQL findings.

### 4.3 Announcement content boundary

The browser path retains the current DOM-based allowlist sanitizer for raw HTML and output from `marked.parse`.

When `DOMParser` or DOM node APIs are unavailable, the sanitizer no longer attempts to parse or strip HTML using regular expressions. It sends the entire input through plain-text rendering, which HTML-escapes the content before producing presentation markup.

This removes the overlap and malformed-tag weaknesses reported by CodeQL and establishes a simple invariant:

> No DOM parser means no trusted markup.

### 4.4 Legacy LDOH monitor removal

Remove the obsolete LDOH integration while preserving the current internal monitor.

Retained behavior:

- the `Monitors.tsx` built-in instance-health page;
- `/api/monitor/overview`;
- account health refresh;
- site, account, route, and traffic summaries.

Removed behavior:

- `/monitor-proxy/ldoh`, `/monitor-proxy/ldoh/`, and `/monitor-proxy/ldoh/*`;
- outbound requests to `ldoh.105117.xyz`;
- LDOH response-body and redirect rewriting;
- LDOH Cookie normalization, masking, persistence endpoints, and proxy forwarding;
- `/api/monitor/config` and `/api/monitor/session`;
- monitor-session cookies;
- stale web API methods for monitor config/session;
- desktop navigation exceptions for the proxy path;
- unused LDOH translations and obsolete tests.

No destructive database cleanup is performed. The generic settings row, if present, is ignored after removal.

## 5. Request Flow

### 5.1 Normal API request

1. Fastify receives a request.
2. The global plugin applies the coarse socket-address bucket before expensive work.
3. Authentication runs.
4. Successful admin authentication enters the authenticated-admin bucket.
5. Any route-specific limiter runs.
6. The route handler executes.

### 5.2 Proxy request

1. The global plugin applies the coarse socket-address bucket before database-backed credential lookup.
2. Proxy authentication validates the credential and resolves managed/global policy.
3. The authenticated proxy guard applies a bucket keyed by managed key ID or the fixed global-proxy identity.
4. Routing and upstream dispatch execute only after both ceilings permit the request.
5. Changing `X-Forwarded-For` does not change either bucket.

### 5.3 Provider detection

1. Input is parsed by the shared HTTP URL parser.
2. Host and path are matched against canonical platform rules.
3. The adapter registry receives the canonical platform identity.
4. An attacker-controlled occurrence in path, query, fragment, or userinfo has no effect.

### 5.4 Announcement rendering

1. Announcement content remains untrusted.
2. Markdown may be converted to HTML.
3. Browser environments parse and rebuild allowed DOM nodes and attributes.
4. Non-DOM environments render escaped text only.
5. React receives only sanitized markup.

## 6. Error Handling and Compatibility

- Global limiter errors return deterministic JSON, `429`, and `Retry-After`.
- Existing stricter limiters are not removed, so their localized messages and limits remain compatible.
- Current provider URLs continue to support scheme-less values where previously intended.
- Official and semantic provider paths retain their existing canonical identities.
- Legacy LDOH callers receive `404` after route removal. No visible current UI flow calls these routes.
- The built-in monitor remains fully operational.
- Stored LDOH settings are not deleted.

## 7. Test Strategy

All behavior changes follow red-green-refactor TDD.

### 7.1 Rate limiting

- repeated authenticated API/proxy requests receive `429` after the configured authenticated threshold;
- unauthenticated or invalid-credential floods are bounded by the socket-level global plugin before expensive authentication;
- `Retry-After` is present;
- distinct managed downstream credentials use distinct authenticated buckets;
- the same credential with changed forwarding headers remains in one bucket;
- health probes are exempt only where explicitly configured;
- existing route-specific limit tests remain green;
- future routes registered after the root plugin inherit the limiter without provider-specific setup.

### 7.2 URL identity

Table-driven positive and adversarial cases cover:

- official hostnames;
- scheme-less input;
- look-alike domains;
- provider strings in path, query, fragment, and userinfo;
- non-HTTP schemes;
- `.googleapis.com` label boundaries;
- path segment boundaries;
- test fixture host routing.

### 7.3 Announcement rendering

- overlapping and malformed script/style tags;
- closing-tag whitespace and attributes;
- event-handler attributes;
- `javascript:` links;
- raw HTML inside Markdown;
- code fences containing literal dangerous tags;
- no-DOM escaped-text fallback;
- jsdom sink inspection for dangerous elements and attributes.

### 7.4 Monitor removal

- removed config/session/proxy routes return `404`;
- removed routes never call outbound fetch;
- `/api/monitor/overview` remains authenticated, rate-limited, and functional;
- current monitor UI tests remain green;
- desktop navigation no longer grants a proxy-path exception.

### 7.5 Final verification

Run:

- focused security tests;
- full Vitest suite;
- all TypeScript typechecks;
- repository drift check;
- production build;
- diff-format checks;
- correctness and security review.

## 8. CodeQL Alert Disposition

Expected code fixes:

- URL validation alerts #1–#7;
- request-forgery alert #8 through sink removal;
- announcement alerts #11–#13;
- genuine missing-rate-limit findings through a CodeQL-recognized global limiter.

Confirmed false positives eligible for documented dismissal:

- #9: deterministic route-channel identity hash, not password storage;
- #10: bounded model-name cache-key hash, not password storage;
- #14 and #17: test-only Fastify apps;
- #16: server shutdown hook, not an HTTP handler.

Existing route-specific rate-limit alerts are expected to be covered by the global recognized plugin. If CodeQL still reports any after a new scan, each remaining alert must be checked against concrete route middleware before dismissal. No blanket dismissal is allowed.

Because this task does not push, code-fixed alerts will not change state on GitHub until the branch is pushed or merged and CodeQL completes a new analysis.

## 9. Delivery

1. Commit this approved design document.
2. Produce a detailed implementation plan.
3. Implement in isolated, test-driven slices.
4. Review and verify the complete patch.
5. Commit the security remediation separately from the existing AxonHub commit.
6. Report the commit IDs, verification evidence, false-positive dispositions, and any scan-dependent follow-up.
