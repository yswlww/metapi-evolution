import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { NewApiAdapter } from './newApi.js';

export class AnyRouterAdapter extends NewApiAdapter {
  readonly platformName = 'anyrouter';

  async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }
}
