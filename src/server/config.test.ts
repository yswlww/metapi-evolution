import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildConfig, buildFastifyOptions } from './config.js';

describe('buildConfig', () => {
  it('uses safe request rate-limit defaults', () => {
    const config = buildConfig({});

    expect(config.requestRateLimitMax).toBe(12_000);
    expect(config.requestRateLimitWindowMs).toBe(60_000);
    expect(config.authenticatedRateLimitMax).toBe(1_200);
  });

  it('normalizes request rate-limit environment overrides', () => {
    const config = buildConfig({
      REQUEST_RATE_LIMIT_MAX: '2400',
      REQUEST_RATE_LIMIT_WINDOW_MS: '30000',
      AUTHENTICATED_RATE_LIMIT_MAX: '300',
    });

    expect(config.requestRateLimitMax).toBe(2_400);
    expect(config.requestRateLimitWindowMs).toBe(30_000);
    expect(config.authenticatedRateLimitMax).toBe(300);
  });

  it('defaults to external listen host for server deployments', () => {
    const config = buildConfig({});

    expect(config.listenHost).toBe('0.0.0.0');
    expect(config.port).toBe(4000);
    expect(config.dataDir).toBe('./data');
  });

  it('aligns desktop deployments with server deployments for listen host', () => {
    const config = buildConfig({
      HOST: '0.0.0.0',
      METAPI_DESKTOP: '1',
      PORT: '4312',
      DATA_DIR: '/tmp/metapi-data',
    });

    expect(config.listenHost).toBe('0.0.0.0');
    expect(config.port).toBe(4312);
    expect(config.dataDir).toBe('/tmp/metapi-data');
  });

  it('honors explicit loopback host outside desktop mode', () => {
    const config = buildConfig({
      HOST: '127.0.0.1',
    });

    expect(config.listenHost).toBe('127.0.0.1');
  });

  it('defaults telegram api base url to the official endpoint', () => {
    const config = buildConfig({});

    expect(config.telegramApiBaseUrl).toBe('https://api.telegram.org');
    expect(config.telegramMessageThreadId).toBe('');
  });

  it('normalizes telegram api base url from environment', () => {
    const config = buildConfig({
      TELEGRAM_API_BASE_URL: ' https://tg.example/api/// ',
    });

    expect(config.telegramApiBaseUrl).toBe('https://tg.example/api');
  });

  it('uses the official telegram endpoint for a blank override', () => {
    const config = buildConfig({
      TELEGRAM_API_BASE_URL: '   ',
    });

    expect(config.telegramApiBaseUrl).toBe('https://api.telegram.org');
  });

  it('accepts telegram message thread id from environment', () => {
    const config = buildConfig({
      TELEGRAM_MESSAGE_THREAD_ID: '77',
    });

    expect(config.telegramMessageThreadId).toBe('77');
  });

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

  it('preserves the default Codex OAuth client ID', () => {
    const config = buildConfig({});

    expect(config.codexClientId).toBe('app_EMoamEEZ73f0CkXaXp7hrann');
  });

  it('preserves the default Claude OAuth client ID', () => {
    const config = buildConfig({});

    expect(config.claudeClientId).toBe('9d1c250a-e61b-44d9-88ed-5944d1962f5e');
  });

  it('preserves the default Codex websocket beta value', () => {
    const config = buildConfig({});

    expect(config.codexResponsesWebsocketBeta).toBe('responses_websockets=2026-02-06');
  });

  it('allows overriding the codex websocket beta gate from environment', () => {
    const config = buildConfig({
      CODEX_RESPONSES_WEBSOCKET_BETA: 'responses_websockets=2099-01-01',
    });

    expect(config.codexResponsesWebsocketBeta).toBe('responses_websockets=2099-01-01');
  });

  it('accepts JSON request bodies larger than Fastify default 1 MiB', async () => {
    const app = Fastify(buildFastifyOptions(buildConfig({})));
    const largeText = 'a'.repeat(2 * 1024 * 1024);

    app.post('/echo', async (request) => {
      const body = request.body as { text?: string };
      return { textLength: body.text?.length ?? 0 };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: { text: largeText },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ textLength: largeText.length });
    await app.close();
  });

  it('trusts forwarded client IP headers for reverse-proxy deployments', async () => {
    const app = Fastify(buildFastifyOptions(buildConfig({})));

    app.get('/ip', async (request) => ({
      ip: request.ip,
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '10.0.0.8',
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.8',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ip: '203.0.113.5' });
    await app.close();
  });
});
