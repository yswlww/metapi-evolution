import { describe, it, expect } from 'vitest';
import {
  fetchLatestStableGitHubRelease,
  selectLatestStableGitHubRelease,
} from './updateCenterVersionService.js';

describe('updateCenterVersionService evolution contract', () => {
  it('selects latest stable release from evolution release list', () => {
    const releases = [
      { tag_name: 'v1.3.0', html_url: 'https://github.com/yswlww/metapi-evolution/releases/tag/v1.3.0', draft: false, prerelease: false },
      { tag_name: 'v1.4.0', html_url: 'https://github.com/yswlww/metapi-evolution/releases/tag/v1.4.0', draft: false, prerelease: false },
      { tag_name: 'v1.5.0-beta.1', html_url: 'https://github.com/yswlww/metapi-evolution/releases/tag/v1.5.0-beta.1', draft: false, prerelease: true },
    ];
    const candidate = selectLatestStableGitHubRelease(releases);
    expect(candidate).not.toBeNull();
    expect(candidate?.normalizedVersion).toBe('1.4.0');
    expect(candidate?.url).toBe('https://github.com/yswlww/metapi-evolution/releases/tag/v1.4.0');
    expect(candidate?.source).toBe('github-release');
  });
});
