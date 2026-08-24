import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { OpenAiAdapter } from './openai.js';

export class AxonHubAdapter extends OpenAiAdapter {
  readonly platformName = 'axonhub';

  async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }
}
