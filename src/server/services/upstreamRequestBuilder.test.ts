import { afterEach, describe, expect, it } from 'vitest';

import { config } from '../config.js';
import {
  buildClaudeCountTokensUpstreamRequest,
  buildUpstreamEndpointRequest,
} from './upstreamRequestBuilder.js';
import { createEmptyPayloadRulesConfig } from './payloadRules.js';

describe('upstreamRequestBuilder', () => {
  afterEach(() => {
    (config as any).payloadRules = createEmptyPayloadRulesConfig();
  });

  it('normalizes single-message OpenAI requests to structured responses input', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'responses',
      modelName: 'upstream-gpt',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'sub2api',
      siteUrl: 'https://example.com',
      openaiBody: {
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
    });

    expect(request.path).toBe('/v1/responses');
    expect(request.headers.accept).toBe('application/json');
    expect(request.body.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      },
    ]);
    expect(request.body.store).toBe(false);
  });

  it('keeps generic OpenAI-compatible HTTP request construction unchanged', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'generic-model',
      stream: false,
      tokenValue: 'generic-key',
      sitePlatform: 'openai',
      siteUrl: 'http://generic.example.com',
      openaiBody: { model: 'generic-model', messages: [{ role: 'user', content: 'hello' }] },
      downstreamFormat: 'openai',
    });

    expect(request.path).toBe('/v1/chat/completions');
    expect(request.headers.Authorization).toBe('Bearer generic-key');
  });

  it.each(['orca-router', 'orca router'])('rejects insecure %s requests before constructing a bearer header', (sitePlatform) => {
    expect(() => buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'orcarouter/auto',
      stream: false,
      tokenValue: 'orc-builder-key',
      sitePlatform,
      siteUrl: 'http://legacy.orcarouter.example',
      openaiBody: { model: 'orcarouter/auto', messages: [{ role: 'user', content: 'hello' }] },
      downstreamFormat: 'openai',
    })).toThrow('credential-free HTTPS');
  });

  it('constructs a bearer request for a credential-free HTTPS OrcaRouter alias', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'orcarouter/auto',
      stream: false,
      tokenValue: 'orc-builder-key',
      sitePlatform: 'orca-router',
      siteUrl: 'https://custom.orcarouter.example',
      openaiBody: { model: 'orcarouter/auto', messages: [{ role: 'user', content: 'hello' }] },
      downstreamFormat: 'openai',
    });

    expect(request.headers.Authorization).toBe('Bearer orc-builder-key');
  });

  it('forces store=false for sub2api native responses passthrough bodies', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'responses',
      modelName: 'upstream-gpt',
      stream: true,
      tokenValue: 'sk-test',
      sitePlatform: 'sub2api',
      siteUrl: 'https://example.com',
      openaiBody: {},
      downstreamFormat: 'responses',
      responsesOriginalBody: {
        model: 'gpt-5.2',
        input: 'hello',
        store: true,
      },
    });

    expect(request.path).toBe('/v1/responses');
    expect(request.headers.accept).toBe('text/event-stream');
    expect(request.body.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      },
    ]);
    expect(request.body.stream).toBe(true);
    expect(request.body.store).toBe(false);
  });

  it('overrides downstream Accept so responses transport mode wins', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'responses',
      modelName: 'upstream-gpt',
      stream: true,
      tokenValue: 'sk-test',
      sitePlatform: 'openai',
      siteUrl: 'https://example.com',
      openaiBody: {
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
      downstreamHeaders: {
        accept: 'application/json',
      },
    });

    expect(request.headers.accept).toBe('text/event-stream');
  });

  it('adds MiniMax reasoning_split by default for OpenAI-compatible chat requests', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'MiniMax-M2.7',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'openai',
      siteUrl: 'https://api.minimaxi.com/v1',
      openaiBody: {
        model: 'MiniMax-M2.7',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
    });

    expect(request.body.reasoning_split).toBe(true);
  });

  it('uses Baidu CodingPlan OpenAI paths relative to the semantic base URL', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'ernie-x1-turbo-32k',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'openai',
      siteUrl: 'https://qianfan.baidubce.com/v2/coding',
      openaiBody: {
        model: 'ernie-x1-turbo-32k',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
    });

    expect(request.path).toBe('/chat/completions');
  });

  it('uses Baidu CodingPlan Claude paths relative to the semantic base URL', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'messages',
      modelName: 'ernie-x1-turbo-32k',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'claude',
      siteUrl: 'https://qianfan.baidubce.com/anthropic/coding',
      openaiBody: {
        model: 'ernie-x1-turbo-32k',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
    });

    expect(request.path).toBe('/messages');
  });

  it('does not override an explicit MiniMax reasoning_split value', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'MiniMax-M2.7',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'openai',
      siteUrl: 'https://api.minimaxi.com/v1',
      openaiBody: {
        model: 'MiniMax-M2.7',
        messages: [{ role: 'user', content: 'hello' }],
        reasoning_split: false,
      },
      downstreamFormat: 'openai',
    });

    expect(request.body.reasoning_split).toBe(false);
  });

  it('applies a sub2api-style allowlist to generic passthrough headers', () => {
    const request = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'upstream-gpt',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'sub2api',
      siteUrl: 'https://example.com',
      openaiBody: {
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
      downstreamHeaders: {
        accept: 'application/json',
        'accept-language': 'zh-CN',
        'user-agent': 'client-ua/1.0',
        originator: 'codex_cli_rs',
        session_id: 'session-123',
        conversation_id: 'conversation-123',
        'x-codex-turn-state': 'turn-state',
        'x-codex-turn-metadata': 'turn-metadata',
        origin: 'https://client.example',
        referer: 'https://client.example/chat',
        'x-forwarded-for': '203.0.113.1',
        'x-real-ip': '203.0.113.2',
        version: '0.202.0',
        'x-test-header': 'drop-me',
      },
    });

    expect(request.headers.accept).toBe('application/json');
    expect(request.headers['accept-language']).toBe('zh-CN');
    expect(request.headers['user-agent']).toBe('client-ua/1.0');
    expect(request.headers.originator).toBe('codex_cli_rs');
    expect(request.headers.session_id).toBe('session-123');
    expect(request.headers.conversation_id).toBe('conversation-123');
    expect(request.headers['x-codex-turn-state']).toBe('turn-state');
    expect(request.headers['x-codex-turn-metadata']).toBe('turn-metadata');

    expect(request.headers.origin).toBeUndefined();
    expect(request.headers.referer).toBeUndefined();
    expect(request.headers['x-forwarded-for']).toBeUndefined();
    expect(request.headers['x-real-ip']).toBeUndefined();
    expect(request.headers.version).toBeUndefined();
    expect(request.headers['x-test-header']).toBeUndefined();
  });

  it('drops responses-style continuation fields before proxying Claude count_tokens upstream', () => {
    const request = buildClaudeCountTokensUpstreamRequest({
      modelName: 'claude-opus-4-6',
      tokenValue: 'sk-test',
      sitePlatform: 'claude',
      claudeBody: {
        model: 'claude-opus-4-6',
        max_tokens: 256,
        previous_response_id: 'resp_prev_1',
        prompt_cache_key: 'cache-key-1',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(request.body).toMatchObject({
      model: 'claude-opus-4-6',
      messages: [{ role: 'user' }],
    });
    expect(request.body).not.toHaveProperty('previous_response_id');
    expect(request.body).not.toHaveProperty('prompt_cache_key');
    expect(request.body).not.toHaveProperty('max_tokens');
    expect(request.body).not.toHaveProperty('maxTokens');
  });

  it('merges body betas with existing anthropic-beta headers for Claude count_tokens', () => {
    const request = buildClaudeCountTokensUpstreamRequest({
      modelName: 'claude-opus-4-6',
      tokenValue: 'sk-test',
      sitePlatform: 'claude',
      claudeBody: {
        model: 'claude-opus-4-6',
        betas: ['beta-from-body'],
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamHeaders: {
        'anthropic-beta': 'header-beta',
      },
    });

    expect(request.headers['anthropic-beta']).toContain('header-beta');
    expect(request.headers['anthropic-beta']).toContain('beta-from-body');
  });

  it('uses Baidu CodingPlan Claude count_tokens path relative to the semantic base URL', () => {
    const request = buildClaudeCountTokensUpstreamRequest({
      modelName: 'ernie-x1-turbo-32k',
      tokenValue: 'sk-test',
      sitePlatform: 'claude',
      siteUrl: 'https://qianfan.baidubce.com/anthropic/coding',
      claudeBody: {
        model: 'ernie-x1-turbo-32k',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(request.path).toBe('/messages/count_tokens?beta=true');
  });

  it('does not apply Baidu semantic path handling to non-Baidu hosts', () => {
    const openAiRequest = buildUpstreamEndpointRequest({
      endpoint: 'chat',
      modelName: 'upstream-gpt',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'openai',
      siteUrl: 'https://proxy.example.com/v2/coding',
      openaiBody: {
        model: 'upstream-gpt',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
    });
    const claudeRequest = buildUpstreamEndpointRequest({
      endpoint: 'messages',
      modelName: 'claude-test',
      stream: false,
      tokenValue: 'sk-test',
      sitePlatform: 'claude',
      siteUrl: 'https://proxy.example.com/anthropic/coding',
      openaiBody: {
        model: 'claude-test',
        messages: [{ role: 'user', content: 'hello' }],
      },
      downstreamFormat: 'openai',
    });

    expect(openAiRequest.path).toBe('/v1/chat/completions');
    expect(claudeRequest.path).toBe('/v1/messages');
  });
});
