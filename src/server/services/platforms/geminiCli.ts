import { detectPlatformByUrlHint } from '../../../shared/platformIdentity.js';
import { GeminiAdapter } from './gemini.js';

export class GeminiCliAdapter extends GeminiAdapter {
  override readonly platformName = 'gemini-cli';

  override async detect(url: string): Promise<boolean> {
    return detectPlatformByUrlHint(url) === this.platformName;
  }
}
