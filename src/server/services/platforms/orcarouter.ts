import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { StandardApiProviderAdapterBase } from './standardApiProvider.js';

function assertSecureOrcaRouterBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('OrcaRouter API key requests require a credential-free HTTPS base URL');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('OrcaRouter API key requests require a credential-free HTTPS base URL');
  }
}

export class OrcaRouterAdapter extends StandardApiProviderAdapterBase {
  readonly platformName = 'orcarouter';

  async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }

  async getModels(baseUrl: string, apiToken: string): Promise<string[]> {
    assertSecureOrcaRouterBaseUrl(baseUrl);
    return this.fetchModelsFromStandardEndpoint({
      baseUrl,
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  }
}
