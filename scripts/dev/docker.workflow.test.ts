import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const composeSources = [
  ['docker/docker-compose.yml', readFileSync(resolve(process.cwd(), 'docker/docker-compose.yml'), 'utf8')],
  ['README.md', readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')],
  ['README_EN.md', readFileSync(resolve(process.cwd(), 'README_EN.md'), 'utf8')],
  ['docs/getting-started.md', readFileSync(resolve(process.cwd(), 'docs/getting-started.md'), 'utf8')],
] as const;

const expectedComposeVariables = [
  'ACCOUNT_CREDENTIAL_SECRET',
  'AUTH_TOKEN',
  'CHECKIN_CRON',
  'BALANCE_REFRESH_CRON',
  'PROXY_TOKEN',
  'PORT',
  'NOTIFY_COOLDOWN_SEC',
  'ADMIN_IP_ALLOWLIST',
  'SYSTEM_PROXY_URL',
  'TELEGRAM_ENABLED',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_API_BASE_URL',
  'TELEGRAM_MESSAGE_THREAD_ID',
  'TELEGRAM_USE_SYSTEM_PROXY',
  'TZ',
  'GEMINI_CLI_CLIENT_ID',
  'GEMINI_CLI_CLIENT_SECRET',
  'ANTIGRAVITY_CLIENT_ID',
  'ANTIGRAVITY_CLIENT_SECRET',
] as const;

const expectedComposeMappings = [
  'ACCOUNT_CREDENTIAL_SECRET: "${ACCOUNT_CREDENTIAL_SECRET:-}"',
  'CHECKIN_CRON: "${CHECKIN_CRON:-0 8 * * *}"',
  'BALANCE_REFRESH_CRON: "${BALANCE_REFRESH_CRON:-0 * * * *}"',
  'PORT: ${PORT:-4000}',
  'TZ: ${TZ:-Asia/Shanghai}',
  'NOTIFY_COOLDOWN_SEC: ${NOTIFY_COOLDOWN_SEC:-300}',
  'ADMIN_IP_ALLOWLIST: "${ADMIN_IP_ALLOWLIST:-}"',
  'SYSTEM_PROXY_URL: "${SYSTEM_PROXY_URL:-}"',
  'TELEGRAM_ENABLED: ${TELEGRAM_ENABLED:-false}',
  'TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN:-}"',
  'TELEGRAM_CHAT_ID: "${TELEGRAM_CHAT_ID:-}"',
  'TELEGRAM_API_BASE_URL: "${TELEGRAM_API_BASE_URL:-}"',
  'TELEGRAM_MESSAGE_THREAD_ID: "${TELEGRAM_MESSAGE_THREAD_ID:-}"',
  'TELEGRAM_USE_SYSTEM_PROXY: ${TELEGRAM_USE_SYSTEM_PROXY:-false}',
  'GEMINI_CLI_CLIENT_ID: "${GEMINI_CLI_CLIENT_ID:-}"',
  'GEMINI_CLI_CLIENT_SECRET: "${GEMINI_CLI_CLIENT_SECRET:-}"',
  'ANTIGRAVITY_CLIENT_ID: "${ANTIGRAVITY_CLIENT_ID:-}"',
  'ANTIGRAVITY_CLIENT_SECRET: "${ANTIGRAVITY_CLIENT_SECRET:-}"',
] as const;

describe('docker workflows', () => {
  it('publishes armv7 docker images in release workflow', () => {
    const releaseWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

    expect(releaseWorkflow).toContain('arch: armv7');
    expect(releaseWorkflow).toContain('platform: linux/arm/v7');
    expect(releaseWorkflow).toContain('"${tag}-armv7"');
  });

  it('derives Docker Hub image names from the configured username secret in release workflow', () => {
    const releaseWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

    expect(releaseWorkflow).toContain('DOCKERHUB_IMAGE: ${{ secrets.DOCKERHUB_USERNAME }}/metapi');
    expect(releaseWorkflow).not.toContain('1467078763/metapi');
  });

  it('uses an armv7-capable node base image in the Dockerfile', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'docker/Dockerfile'), 'utf8');

    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS builder');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
  });

  it('avoids buildkit-only frontend syntax so managed docker builders can parse it reliably', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'docker/Dockerfile'), 'utf8');

    expect(dockerfile).not.toContain('# syntax=docker/dockerfile:');
    expect(dockerfile).not.toContain('RUN --mount=type=cache');
  });

  it('forwards every documented compose environment variable in all compose examples', () => {
    const dockerEnvExample = readFileSync(resolve(process.cwd(), 'docker/.env.example'), 'utf8');
    const documentedVariables = dockerEnvExample
      .split('\n')
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((variable): variable is string => Boolean(variable));

    for (const variable of expectedComposeVariables) {
      expect(documentedVariables, `${variable} should be documented in docker/.env.example`).toContain(variable);
    }

    for (const [sourceName, source] of composeSources) {
      for (const variable of documentedVariables) {
        const mappingPattern = new RegExp(`^\\s*${variable}:\\s*"?\\$\\{${variable}(?=[:}])`, 'm');
        expect(source, `${sourceName} should forward ${variable}`).toMatch(mappingPattern);
      }
    }
  });

  it('uses consistent compose defaults, required token guards, and dynamic ports', () => {
    for (const [sourceName, source] of composeSources) {
      expect(source, `${sourceName} should require AUTH_TOKEN`).toContain(
        'AUTH_TOKEN: ${AUTH_TOKEN:?AUTH_TOKEN is required}',
      );
      expect(source, `${sourceName} should require PROXY_TOKEN`).toContain(
        'PROXY_TOKEN: ${PROXY_TOKEN:?PROXY_TOKEN is required}',
      );
      expect(source, `${sourceName} should publish and target PORT`).toContain(
        '"127.0.0.1:${PORT:-4000}:${PORT:-4000}"',
      );

      for (const mapping of expectedComposeMappings) {
        expect(source, `${sourceName} should include ${mapping}`).toContain(mapping);
      }
    }
  });

  it('keeps server docker builds isolated from desktop packaging dependencies', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'docker/Dockerfile'), 'utf8');

    expect(dockerfile).toContain('npm ci --ignore-scripts --no-audit --no-fund');
    expect(dockerfile).toContain('npm rebuild esbuild sharp better-sqlite3 --no-audit --no-fund');
    expect(dockerfile).not.toContain('npm ci --no-audit --no-fund');
    expect(dockerfile).toContain('RUN npm run build:web && npm run build:server');
    expect(dockerfile).toContain('npm prune --omit=dev --no-audit --no-fund');
  });

  it('forwards Google OAuth variables through hosted deployment templates without defaults', () => {
    const dockerEnvExample = readFileSync(resolve(process.cwd(), 'docker/.env.example'), 'utf8');
    const render = readFileSync(resolve(process.cwd(), 'render.yaml'), 'utf8');
    const zeabur = readFileSync(resolve(process.cwd(), 'zeabur-template.yaml'), 'utf8');
    const oauthVariables = [
      'GEMINI_CLI_CLIENT_ID',
      'GEMINI_CLI_CLIENT_SECRET',
      'ANTIGRAVITY_CLIENT_ID',
      'ANTIGRAVITY_CLIENT_SECRET',
    ] as const;

    for (const variable of oauthVariables) {
      expect(dockerEnvExample, `${variable} should be blank by default`).toMatch(
        new RegExp(`^${variable}=$`, 'm'),
      );
      expect(render, `render.yaml should expose ${variable} as a runtime secret`).toContain(
        `- key: ${variable}\n        sync: false`,
      );
      expect(zeabur, `zeabur-template.yaml should declare ${variable}`).toContain(
        `- key: ${variable}`,
      );
      expect(zeabur, `zeabur-template.yaml should inject ${variable}`).toContain(
        `          ${variable}:\n            default: \${${variable}}\n            expose: false`,
      );
    }
  });
});
