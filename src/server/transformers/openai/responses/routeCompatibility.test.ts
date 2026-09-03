import { describe, expect, it } from 'vitest';
import { Response } from 'undici';
import { executeEndpointFlow, type BuiltEndpointRequest } from '../../../proxy-core/orchestration/endpointFlow.js';
import { createResponsesEndpointStrategy } from './routeCompatibility.js';

function buildRequest(endpoint: 'chat' | 'messages' | 'responses'): BuiltEndpointRequest {
  return {
    endpoint,
    path: endpoint === 'responses'
      ? '/v1/responses'
      : endpoint === 'chat'
        ? '/v1/chat/completions'
        : '/v1/messages',
    headers: {
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
    },
    body: { model: 'deepseek-v4-flash', input: 'hello' },
  };
}

describe('createResponsesEndpointStrategy', () => {
  it('falls back from Responses to Chat when AxonHub returns 410 Gone', async () => {
    const attemptedPaths: string[] = [];
    const responses = [
      new Response('Gone', { status: 410 }),
      new Response(JSON.stringify({ id: 'chatcmpl_test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const dispatchRequest = async (request: BuiltEndpointRequest) => {
      attemptedPaths.push(request.path);
      return responses.shift() as Response;
    };
    const strategy = createResponsesEndpointStrategy({
      isStream: false,
      requiresNativeResponsesFileUrl: false,
      sitePlatform: 'axonhub',
      dispatchRequest,
    });

    const result = await executeEndpointFlow({
      siteUrl: 'https://hub.linux.do',
      endpointCandidates: ['responses', 'chat'],
      buildRequest,
      dispatchRequest,
      tryRecover: strategy.tryRecover,
      shouldDowngrade: strategy.shouldDowngrade,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.upstreamPath).toBe('/v1/chat/completions');
    }
    expect(attemptedPaths).toEqual(['/v1/responses', '/v1/chat/completions']);
  });
});
