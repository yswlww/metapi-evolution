import { describe, expect, it } from 'vitest';
import { Response } from 'undici';
import { executeEndpointFlow, type BuiltEndpointRequest } from '../../proxy-core/orchestration/endpointFlow.js';
import { createChatEndpointStrategy } from './chatEndpointStrategy.js';

const endpointCandidates: Array<'chat' | 'responses'> = ['chat', 'responses'];

function buildRequest(endpoint: 'chat' | 'messages' | 'responses'): BuiltEndpointRequest {
  return {
    endpoint,
    path: endpoint === 'chat' ? '/v1/chat/completions' : '/v1/responses',
    headers: {
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
    },
    body: { model: 'deepseek-v4-flash' },
  };
}

async function runGoneFlow(sitePlatform: string) {
  const attemptedPaths: string[] = [];
  const responses = [
    new Response('Gone', { status: 410 }),
    new Response(JSON.stringify({ id: 'resp_test' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ];
  const dispatchRequest = async (request: BuiltEndpointRequest) => {
    attemptedPaths.push(request.path);
    return responses.shift() as Response;
  };
  const candidates = [...endpointCandidates];
  const strategy = createChatEndpointStrategy({
    downstreamFormat: 'openai',
    endpointCandidates: candidates,
    modelName: 'deepseek-v4-flash',
    requestedModelHint: 'deepseek-v4-flash',
    sitePlatform,
    isStream: false,
    buildRequest: ({ endpoint }) => buildRequest(endpoint),
    dispatchRequest,
  });
  const result = await executeEndpointFlow({
    siteUrl: 'https://hub.linux.do',
    endpointCandidates: candidates,
    buildRequest,
    dispatchRequest,
    tryRecover: strategy.tryRecover,
    shouldDowngrade: strategy.shouldDowngrade,
  });

  return { attemptedPaths, result };
}

describe('createChatEndpointStrategy', () => {
  it('falls back from Chat to Responses when AxonHub returns 410 Gone', async () => {
    const { attemptedPaths, result } = await runGoneFlow('axonhub');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.upstreamPath).toBe('/v1/responses');
    }
    expect(attemptedPaths).toEqual(['/v1/chat/completions', '/v1/responses']);
  });

  it('repairs existing generic OpenAI-compatible sites through an actual fallback dispatch', async () => {
    const { attemptedPaths, result } = await runGoneFlow('openai');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.upstreamPath).toBe('/v1/responses');
    }
    expect(attemptedPaths).toEqual(['/v1/chat/completions', '/v1/responses']);
  });

  it('does not broaden empty 410 fallback to unrelated platforms', async () => {
    const { attemptedPaths, result } = await runGoneFlow('new-api');

    expect(result.ok).toBe(false);
    expect(attemptedPaths).toEqual(['/v1/chat/completions']);
  });
});
