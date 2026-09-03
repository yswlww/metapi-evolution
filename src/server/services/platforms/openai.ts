import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { StandardApiProviderAdapterBase } from './standardApiProvider.js';

export class OpenAiAdapter extends StandardApiProviderAdapterBase {
  readonly platformName: string = 'openai';

  async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }

  async getModels(baseUrl: string, apiToken: string): Promise<string[]> {
    return this.fetchModelsFromStandardEndpoint({
      baseUrl,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }
}
