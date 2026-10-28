# Keep the Docker base on Node 22 because the official Node 24+ images no
# longer publish linux/arm/v7 manifests, which breaks our armv7 Docker jobs.
# Pin the exact patch so a security release is a deliberate, reviewable bump
# rather than a silent drift of the floating tag.
FROM node:22.23.4-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python3

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm rebuild esbuild sharp better-sqlite3 --no-audit --no-fund

COPY . .
RUN npm run build:web && npm run build:server
RUN npm prune --omit=dev --no-audit --no-fund
RUN node scripts/release/buildBundle.mjs --manifest-only

# Release assets and the runtime image share this exact native build and Node
# executable, including both frontend entrypoints and generated DB assets.
FROM builder AS bundle-builder
ARG TARGETARCH
ARG METAPI_BUNDLE_VERSION
RUN node scripts/release/buildBundle.mjs --arch "$TARGETARCH" --version "${METAPI_BUNDLE_VERSION:-$(node -p 'require("./package.json").version')}" --out /release-bundles

FROM scratch AS server-bundle
COPY --from=bundle-builder /release-bundles/ /

FROM node:22.23.4-bookworm-slim AS runtime

WORKDIR /app

ARG TARGETARCH
ARG TARGETVARIANT

# No kubectl or helm here any more: local runtime upgrades (#622) replace the
# Kubernetes deploy helper, so the runtime image carries no cluster tooling.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tar gzip \
  && rm -rf /var/lib/apt/lists/* \
  && case "$TARGETARCH" in \
    amd64|arm64) ;; \
    arm) \
      if [ "${TARGETVARIANT:-}" != "v7" ]; then \
        echo "Unsupported TARGETARCH/TARGETVARIANT: $TARGETARCH/${TARGETVARIANT:-}" >&2; exit 1; \
      fi ;; \
    *) echo "Unsupported TARGETARCH/TARGETVARIANT: $TARGETARCH/${TARGETVARIANT:-}" >&2; exit 1 ;; \
  esac

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/runtime-manifest.json ./runtime-manifest.json

# Image-owned supervisor primitives are stable while current/previous point at
# downloaded releases. Keep the source layout so relative imports stay valid.
COPY --from=builder /app/scripts/release/runtimeRunner.mjs ./scripts/release/runtimeRunner.mjs
COPY --from=builder /app/src/shared/localUpdate*.js ./src/shared/

RUN mkdir -p /app/data

EXPOSE 4000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV METAPI_IMAGE_ROOT=/app

CMD ["node", "/app/scripts/release/runtimeRunner.mjs"]
