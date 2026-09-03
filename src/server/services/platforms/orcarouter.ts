import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { assertOrcaRouterTokenTransport } from '../orcarouterTransport.js';
import { StandardApiProviderAdapterBase } from './standardApiProvider.js';

export class OrcaRouterAdapter extends StandardApiProviderAdapterBase {
  readonly platformName = 'orcarouter';

  async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }

  async getModels(baseUrl: string, apiToken: string): Promise<string[]> {
    assertOrcaRouterTokenTransport(this.platformName, baseUrl);
    return this.fetchModelsFromStandardEndpoint({
      baseUrl,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }
}
