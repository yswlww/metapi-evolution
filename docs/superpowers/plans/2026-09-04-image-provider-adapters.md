# Image Provider Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the standard OpenAI-compatible image operations through tested provider-native adapters while preserving existing OpenAI-compatible behavior.

**Architecture:** Keep `/v1/images/generations` and `/v1/images/edits` as the only public image routes. Resolve a site-level image provider per selected channel, filter incompatible channels before selection, convert the preserved neutral request for each attempt, call the provider-native endpoint, and normalize successful responses to OpenAI Images format.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, Vitest, React, existing proxy/channel routing and site endpoint pool.

**Spec:** `docs/superpowers/specs/2026-09-04-image-provider-adapters-design.md`

## Global Constraints

- Public image routes remain `/v1/images/generations` and `/v1/images/edits`; variations remain unsupported.
- `openai-compatible` is the default for existing and empty site rows.
- Provider-native endpoints are never exposed as ordinary Playground protocol choices.
- Every retry converts the original neutral input again for the newly selected provider.
- Forced incompatible channels fail without fallback or network I/O.
- Existing site proxy, custom headers, first-byte timeout, endpoint pool, concurrency, downstream-key restrictions, accounting, and logging boundaries remain active.
- Tokens and response bodies must not be added to logs.
- Secret-scanning remediation is separate; do not rewrite history or mark alerts revoked.

---

### Task 1: Merge the operation-first Playground correction

**Files:**
- Existing commit: `820004c`
- Modify: `src/web/pages/ModelTester.tsx`
- Test: `src/web/pages/modelTester.image-playground.test.tsx`

**Interfaces:**
- Produces image-mode selector labels for `/v1/images/generations` and `/v1/images/edits` while retaining `PlaygroundProtocol = 'openai'` internally.

- [ ] **Step 1:** Rebase or merge current `origin/main` into `fix/image-playground-endpoint` without dropping `820004c`.
- [ ] **Step 2:** Run `npx vitest run src/web/pages/modelTester.image-playground.test.tsx src/web/pages/modelTester.image-playground.architecture.test.tsx` and confirm all tests pass.
- [ ] **Step 3:** Run `npm run typecheck`, `npm run build`, `npm run repo:drift-check`, and `npm test`.
- [ ] **Step 4:** Push the branch and create a focused PR titled `fix: show image endpoints in Model Playground`.

---

### Task 2: Define image provider contracts and default adapter

**Files:**
- Create: `src/server/services/imageProviders/types.ts`
- Create: `src/server/services/imageProviders/registry.ts`
- Create: `src/server/services/imageProviders/openAiCompatible.ts`
- Test: `src/server/services/imageProviders/registry.test.ts`
- Test: `src/server/services/imageProviders/openAiCompatible.test.ts`

**Interfaces:**
- Produces `ImageOperation`, `ImageProviderId`, `ImageProviderAdapter`, `resolveImageProviderAdapter(id)`, `normalizeImageProviderId(value)`, and the default OpenAI-compatible adapter.

- [ ] **Step 1:** Write failing registry tests proving null/empty resolve to `openai-compatible`, invalid IDs are rejected, and operation/model support is queryable.
- [ ] **Step 2:** Run the focused tests and confirm they fail because the registry does not exist.
- [ ] **Step 3:** Implement the exact adapter contracts from the spec and a registry containing only `openai-compatible` initially.
- [ ] **Step 4:** Write failing passthrough tests for generation JSON, edit multipart, URL construction, bearer authentication, and malformed JSON response handling.
- [ ] **Step 5:** Implement `openAiCompatible` using the existing `/v1/images/generations` and `/v1/images/edits` behavior.
- [ ] **Step 6:** Run focused tests, server typecheck, and commit `feat: add image provider adapter registry`.

---

### Task 3: Persist site image-provider configuration

**Files:**
- Modify: SQLite/MySQL/Postgres site schema definitions and schema contract artifacts.
- Add migration: next repository migration adding nullable `sites.image_provider`.
- Modify: `src/server/contracts/siteRoutePayloads.ts`
- Modify: `src/server/routes/api/sites.ts`
- Modify: `src/server/services/backupService.ts`
- Modify: `src/server/services/databaseMigrationService.ts`
- Modify: `src/web/pages/helpers/sitesEditor.ts`
- Modify: `src/web/pages/Sites.tsx`
- Modify: `src/shared/siteInitializationPresets.js` and `.d.ts`
- Test: schema parity, site API, backup/import, editor, and preset tests.

**Interfaces:**
- Produces nullable `imageProvider` on site rows and payloads; empty/null normalizes to `openai-compatible` at runtime.

- [ ] **Step 1:** Write failing SQLite/MySQL/Postgres parity tests for nullable `image_provider` and old-row compatibility.
- [ ] **Step 2:** Add schema fields and migration artifacts, regenerate schema contracts, and make parity tests pass.
- [ ] **Step 3:** Write failing create/update validation tests accepting only registry IDs and returning `imageProvider` in site responses.
- [ ] **Step 4:** Extend site payload parsing/routes and make API tests pass.
- [ ] **Step 5:** Write failing backup/export/import and database migration tests preserving `imageProvider`; implement persistence.
- [ ] **Step 6:** Write failing site-editor/preset tests; add an image-provider selector and populate only official presets whose native semantics are known.
- [ ] **Step 7:** Run schema unit/parity/upgrade/runtime tests, focused UI tests, typecheck, drift, and commit `feat: persist site image provider configuration`.

---

### Task 4: Add operation-aware channel eligibility

**Files:**
- Modify: `src/server/proxy-core/channelSelection.ts`
- Modify: `src/server/services/tokenRouter.ts`
- Create: `src/server/services/imageProviderEligibility.ts`
- Test: channel selection and token-router eligibility tests.

**Interfaces:**
- Extends channel selection with optional `{ imageOperation?: ImageOperation }` and returns concrete rejection reasons for unsupported operation/model/provider.

- [ ] **Step 1:** Write failing tests where automatic routing skips an edit-incompatible provider and selects an eligible fallback.
- [ ] **Step 2:** Write failing forced-channel tests proving incompatibility returns a concrete diagnostic without fallback.
- [ ] **Step 3:** Implement pure eligibility helpers using the site `imageProvider`, adapter capabilities, and `supportsModel`.
- [ ] **Step 4:** Integrate eligibility into preferred, initial, and retry channel selection without changing conversation routing.
- [ ] **Step 5:** Run focused token-router/channel tests and commit `feat: filter image channels by provider capability`.

---

### Task 5: Refactor image orchestration around neutral requests

**Files:**
- Create: `src/server/services/imageProviderRequest.ts`
- Modify: `src/server/routes/proxy/images.ts`
- Test: `src/server/routes/proxy/images.edits.test.ts` plus new service tests.

**Interfaces:**
- Produces a neutral image request parsed once and `executeImageProviderAttempt(selected, target, neutralRequest, signal)` that resolves/converts per attempt.

- [ ] **Step 1:** Write failing tests proving retry across two providers reconstructs from the original generation JSON or multipart edit bytes.
- [ ] **Step 2:** Write failing tests proving unsupported operation fails before fetch and forced incompatible channels do not mutate failure bookkeeping.
- [ ] **Step 3:** Extract neutral request parsing and adapter invocation while leaving retries, accounting, concurrency, logging, and alerts in `images.ts`.
- [ ] **Step 4:** Replace hard-coded image URL/body construction with adapter execution and normalized responses.
- [ ] **Step 5:** Run image route tests, tester proxy tests, typecheck, and commit `refactor: route image requests through provider adapters`.

---

### Task 6: Add Zhipu, Volcengine, and MiniMax adapters

**Files:**
- Create: `src/server/services/imageProviders/zhipu.ts`
- Create: `src/server/services/imageProviders/volcengine.ts`
- Create: `src/server/services/imageProviders/minimax.ts`
- Modify: registry and tests.

**Interfaces:**
- Zhipu: generate only, `/api/paas/v4/images/generations`.
- Volcengine: generate/edit, `/api/v3/images/generations`.
- MiniMax: generate only, `/v1/image_generation`.

- [ ] **Step 1:** Write table-driven failing tests for capability/model rules, native URLs, authentication, request conversion, normalized success, and error propagation.
- [ ] **Step 2:** Implement Zhipu generation adapter with OpenAI-shaped request mapping.
- [ ] **Step 3:** Implement Volcengine generation/edit adapter, including image-to-image conversion from neutral edit input.
- [ ] **Step 4:** Implement MiniMax generation conversion including aspect ratio, response format, count, optimizer, and watermark defaults only when explicitly mapped.
- [ ] **Step 5:** Register adapters, run adapter and mixed-provider retry tests, and commit `feat: add initial native image providers`.

---

### Task 7: Add DashScope and Gemini Imagen adapters

**Files:**
- Create: `src/server/services/imageProviders/dashscope.ts`
- Create: `src/server/services/imageProviders/geminiImagen.ts`
- Modify: registry and tests.

**Interfaces:**
- DashScope selects synchronous multimodal, asynchronous text-to-image, or image-to-image paths from explicit model families.
- Gemini Imagen supports generate only and `imagen*` models via `models/{model}:predict`.

- [ ] **Step 1:** Write failing model-family tests for every native path and reject unknown DashScope mappings rather than guessing.
- [ ] **Step 2:** Implement DashScope `{ model, input, parameters }` conversion, including multipart images as data URLs and normalized task/result responses.
- [ ] **Step 3:** Write failing Gemini tests for model restriction, predict URL, request parameters, bearer/API-key transport selected by configured site semantics, and normalized predictions.
- [ ] **Step 4:** Implement Gemini Imagen generation adapter and register both providers.
- [ ] **Step 5:** Run provider tests and commit `feat: add DashScope and Gemini image providers`.

---

### Task 8: Finish UI diagnostics and complete verification

**Files:**
- Modify: `src/web/pages/ModelTester.tsx`
- Modify: site editor/preset UI tests.
- Modify: route-decision response diagnostics if required.

**Interfaces:**
- Playground remains operation-first and shows selected channel provider/native endpoint only as diagnostic metadata, not selectable protocol options.

- [ ] **Step 1:** Write failing UI tests for provider capability explanations and forced incompatible-channel diagnostics.
- [ ] **Step 2:** Add diagnostic copy without exposing provider-native URLs as normal protocol choices.
- [ ] **Step 3:** Run all adapter, image route, site persistence, backup/import, schema, and UI tests.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run build`, `npm run repo:drift-check`, SQLite/MySQL/Postgres schema parity/upgrade/runtime suites, and `git diff --check`.
- [ ] **Step 5:** Request code review, address confirmed findings, and commit `feat: complete native image provider routing`.
