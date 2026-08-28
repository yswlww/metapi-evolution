import { describe, expect, it } from 'vitest';
import { OrcaRouterAdapter } from './orcarouter.js';
import { StandardApiProviderAdapterBase } from './standardApiProvider.js';

class InspectableOrcaRouterAdapter extends OrcaRouterAdapter {
  requests: Array<{
    url: string;
    options: Parameters<StandardApiProviderAdapterBase['fetchJson']>[1];
  }> = [];
  response: unknown = { object: 'list', data: [] };

  protected override async fetchJson<T>(
    url: string,
    options?: Parameters<StandardApiProviderAdapterBase['fetchJson']>[1],
  ): Promise<T> {
    this.requests.push({ url, options });
    return this.response as T;
  }
}

describe('OrcaRouterAdapter', () => {
  it('detects only the official hostname without making an authenticated request', async () => {
    const adapter = new InspectableOrcaRouterAdapter();

    await expect(adapter.detect('https://api.orcarouter.ai/v1')).resolves.toBe(true);
    await expect(adapter.detect('api.orcarouter.ai/v1')).resolves.toBe(true);
    await expect(adapter.detect('https://custom.orcarouter-compatible.example/v1')).resolves.toBe(false);

    expect(adapter.requests).toEqual([]);
  });

  it('rejects unsafe token-bearing base URLs before model discovery starts', async () => {
    const adapter = new InspectableOrcaRouterAdapter();

    await expect(adapter.getModels('http://api.orcarouter.ai/v1', 'orc-key')).rejects.toThrow();
    await expect(adapter.getModels('https://key:secret@api.orcarouter.ai/v1', 'orc-key')).rejects.toThrow();
    await expect(adapter.getModels('ftp://api.orcarouter.ai/v1', 'orc-key')).rejects.toThrow();

    expect(adapter.requests).toEqual([]);
  });

  it('gets normalized model IDs from the configured OpenAI-compatible models endpoint', async () => {
    const adapter = new InspectableOrcaRouterAdapter();
    adapter.response = {
      object: 'list',
      data: [
        { id: ' orcarouter/auto ' },
        { id: 'vendor/model' },
        { id: '' },
        { id: null },
      ],
    };

    await expect(adapter.getModels('https://api.orcarouter.ai/v1/', 'orc-key')).resolves.toEqual([
      'orcarouter/auto',
      'vendor/model',
    ]);
    expect(adapter.requests).toEqual([{
      url: 'https://api.orcarouter.ai/v1/models',
      options: { headers: { Authorization: 'Bearer orc-key' } },
    }]);
  });

  it('propagates invalid models payload errors instead of accepting malformed responses', async () => {
    const adapter = new InspectableOrcaRouterAdapter();
    adapter.response = { object: 'list', data: { id: 'orcarouter/auto' } };

    await expect(adapter.getModels('https://api.orcarouter.ai/v1', 'orc-key'))
      .rejects.toThrow('invalid standard models payload');
  });

  it('uses a manually selected compatible domain for model discovery without auto-detecting it', async () => {
    const adapter = new InspectableOrcaRouterAdapter();

    await expect(adapter.detect('https://gateway.example/v1')).resolves.toBe(false);
    await adapter.getModels('https://gateway.example/custom/v1', 'manual-key');

    expect(adapter.requests).toEqual([{
      url: 'https://gateway.example/custom/v1/models',
      options: { headers: { Authorization: 'Bearer manual-key' } },
    }]);
  });
});
