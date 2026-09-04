# Image Provider Adapter Architecture Design

**Date:** 2026-09-04
**Status:** Approved
**Repository:** `yswlww/metapi-evolution`

## Goal

Keep the public image API operation-first and OpenAI-compatible while adding truthful provider-native image routing behind it. Clients continue to call `POST /v1/images/generations` and `POST /v1/images/edits`; metapi selects an eligible channel, translates the request for that provider, calls its native endpoint, and normalizes the response.

## Current State

`src/server/routes/proxy/images.ts` forwards generation JSON and edit multipart data to the same OpenAI-compatible path on every selected site. Channel selection is model-based and has no image modality capability filter. `ModelTester` previously showed conversation protocol choices in image modes even though its request builder already used the image routes.

The first corrective slice is complete locally as commit `820004c`: image generation displays `/v1/images/generations`, image editing displays `/v1/images/edits`, and saved Claude or Responses protocol state cannot make an image mode display a chat endpoint.

Research against `QuantumNous/new-api` at commit `3a9f41ee85cc369f5b8d7fe6e62ff4e7bf3a9ec8` confirms the correct boundary: expose standardized image operations publicly, then use provider adapters internally. Provider-native paths are not interchangeable user-facing choices.

## Decisions

### Public API and Playground

- Preserve `/v1/images/generations` and `/v1/images/edits` as the only public image operations.
- Keep `/v1/images/variations` unsupported.
- Playground labels are operation-first, not provider-first.
- Provider-native URLs never appear as ordinary protocol choices.
- The forced-channel diagnostic selector remains available and shows why a channel is or is not image-capable.

### Capability Model

Create an image-specific registry separate from conversation provider profiles.

```ts
export type ImageOperation = 'generate' | 'edit';
export type ImageProviderId =
  | 'openai-compatible'
  | 'zhipu'
  | 'volcengine'
  | 'minimax'
  | 'dashscope'
  | 'gemini-imagen';

export type ImageProviderCapabilities = {
  generate: boolean;
  edit: boolean;
};
```

Each adapter exposes:

```ts
export type PrepareImageRequestInput = {
  operation: ImageOperation;
  baseUrl: string;
  modelName: string;
  tokenValue: string;
  jsonBody?: Record<string, unknown>;
  multipartForm?: FormData;
  signal?: AbortSignal;
};

export type PreparedImageRequest = {
  url: string;
  init: RequestInit;
  responseMode: 'openai-json' | 'provider-json';
};

export type ImageProviderAdapter = {
  id: ImageProviderId;
  capabilities: ImageProviderCapabilities;
  supportsModel(modelName: string): boolean;
  prepareRequest(input: PrepareImageRequestInput): Promise<PreparedImageRequest>;
  normalizeResponse(input: {
    operation: ImageOperation;
    modelName: string;
    status: number;
    headers: Headers;
    bodyText: string;
  }): { ok: true; value: unknown } | { ok: false; message: string };
};
```

`openai-compatible` is the default and preserves current behavior. A site-level `imageProvider` field selects a native adapter. Existing rows with null or empty values resolve to `openai-compatible`.

### Initial Provider Matrix

| Provider | Generate | Edit | Native path |
|---|---:|---:|---|
| OpenAI-compatible | yes | yes | `/v1/images/generations`, `/v1/images/edits` |
| Zhipu | yes | no | `/api/paas/v4/images/generations` |
| Volcengine / Doubao | yes | yes | `/api/v3/images/generations` |
| MiniMax | yes | no | `/v1/image_generation` |
| Alibaba DashScope | yes | yes | model-dependent DashScope AIGC paths |
| Gemini / Vertex Imagen | yes | no | `models/{imagen-model}:predict` |

Baidu V2 and Cloudflare are excluded because the reference implementation does not implement image conversion. Replicate, SiliconFlow, xAI, and Jimeng are deferred until the first matrix is stable.

### Selection and Retry

Image capability filtering occurs before a channel is selected. Eligibility requires:

1. the route/model already passes existing token-router checks;
2. the site's resolved image provider supports the requested operation;
3. the adapter accepts the selected upstream model.

A forced incompatible channel fails with a concrete diagnostic and does not fall back. Automatic routing excludes incompatible channels and may choose another candidate. Every retry reruns adapter resolution and request conversion from the preserved original downstream payload; a converted provider request is never reused for another provider.

### Request and Response Pipeline

Refactor `images.ts` so orchestration owns retries, accounting, concurrency, logging, and downstream policy, while adapters own native URL, headers, request conversion, and response normalization. Image inputs are parsed once into a provider-neutral request. Multipart bytes and filenames must survive retries.

Normalized successful responses use OpenAI Images shape:

```json
{ "created": 0, "data": [{ "url": "..." }] }
```

or `b64_json`. Provider errors preserve status and a useful raw message for retry policy and logs. Unsupported operations fail before network I/O.

### Configuration and Persistence

Add nullable `sites.image_provider` through the SQLite/MySQL/Postgres schema parity process and migration artifacts. Extend site create/update payloads, API responses, backup/export/import, desktop/site editor state, and official initialization presets. Validation accepts only the registry IDs. Empty values retain `openai-compatible` compatibility.

Official presets may populate the provider only when their endpoint semantics are known:

- Zhipu -> `zhipu`
- Doubao/Volcengine -> `volcengine`
- MiniMax -> `minimax`
- Alibaba Cloud -> `dashscope`
- Gemini Imagen sites -> `gemini-imagen`

Generic relay platforms remain `openai-compatible`; platform name alone must not imply native image support.

### Security and Operational Constraints

- Adapters must use the existing site proxy, custom headers, first-byte timeout, endpoint pool, transport checks, downstream-key restrictions, accounting, and tester forced-channel trust boundary.
- Provider tokens and response bodies must not be added to logs.
- No provider-native endpoint is exposed as a general downstream route.
- Existing OpenAI-compatible image behavior remains the fallback and requires no migration action from users.
- Secret-scanning remediation is separate. Alerts #1-#4 point only to preserved historical commits; current source no longer embeds those Google OAuth credentials. History will not be rewritten and alerts must not be falsely marked revoked.

## Components

- `src/server/services/imageProviders/types.ts`: shared adapter contracts.
- `src/server/services/imageProviders/registry.ts`: validation and adapter resolution.
- `src/server/services/imageProviders/openAiCompatible.ts`: current passthrough behavior.
- Provider files for Zhipu, Volcengine, MiniMax, DashScope, and Gemini Imagen.
- `src/server/services/imageProviderRequest.ts`: neutral request construction and adapter invocation.
- `src/server/proxy-core/channelSelection.ts` and token-router eligibility: image operation filtering and diagnostics.
- `src/server/routes/proxy/images.ts`: orchestration only.
- Site schema/contracts/editor/presets: persist `imageProvider`.
- `src/web/pages/ModelTester.tsx`: operation endpoint labels plus provider/channel diagnostic text.

## Testing

Every adapter requires request URL, headers, body conversion, normalized success, upstream error, unsupported operation, and model eligibility tests. Route tests cover mixed-provider retry, forced incompatible channels, multipart edit preservation, concurrency, custom headers, proxy use, and unchanged OpenAI-compatible behavior. Schema tests cover all three databases, backup/import, and old-row defaults. UI tests cover site configuration and operation-first Playground labels.

## Delivery Order

1. Merge the completed Playground endpoint correction.
2. Add registry, types, and OpenAI-compatible adapter with no behavior change.
3. Persist site image-provider configuration and expose it in UI/presets.
4. Add operation-aware channel filtering and retry-safe neutral requests.
5. Add Zhipu, Volcengine, and MiniMax adapters.
6. Add DashScope and Gemini Imagen adapters.
7. Run full tests, typecheck, builds, drift, schema parity, and provider-specific integration tests before merge.

## Success Criteria

- Image modes never show chat endpoints.
- Existing OpenAI-compatible generation/editing remains unchanged.
- Incompatible channels are never contacted.
- Automatic retries can cross providers because conversion is repeated per attempt.
- All supported native providers return OpenAI-compatible image responses.
- Site configuration, presets, backup/import, and all database backends preserve `imageProvider`.
- No UI option claims support without a registered, tested adapter.
