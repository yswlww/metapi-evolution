import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { StandardApiProviderAdapterBase } from './standardApiProvider.js';

const CLAUDE_DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

function resolveOpenAiCompatibleBaseUrl(baseUrl: string): string | null {
  const normalized = (baseUrl || '').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'qianfan.baidubce.com' && parsed.pathname.replace(/\/+$/, '') === '/anthropic/coding') {
      parsed.pathname = '/v2/coding';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {}
  const match = normalized.match(/^(.*)\/anthropic$/i);
  return match?.[1] || null;
}

export class ClaudeAdapter extends StandardApiProviderAdapterBase {
  readonly platformName = 'claude';

  async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }

  async getModels(baseUrl: string, apiToken: string): Promise<string[]> {
    const openAiCompatibleBaseUrl = resolveOpenAiCompatibleBaseUrl(baseUrl);
    try {
      const claudeModels = await this.fetchModelsFromStandardEndpoint({
        baseUrl,
        headers: {
          'x-api-key': apiToken,
          'anthropic-version': CLAUDE_DEFAULT_ANTHROPIC_VERSION,
        },
      });
      if (claudeModels.length > 0) return claudeModels;
    } catch (error) {
      if (!openAiCompatibleBaseUrl) throw error;
    }

    if (!openAiCompatibleBaseUrl) return [];

    return this.fetchModelsFromStandardEndpoint({
      baseUrl: openAiCompatibleBaseUrl,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }
}
