import { describe, expect, it } from 'vitest';

import { buildUpdateReminder } from './updateCenterPresentation.js';

describe('updateCenterPresentation', () => {
  it('returns an unknown reminder when no candidate source data is available', () => {
    expect(buildUpdateReminder({
      currentVersion: '1.2.3',
      helper: null,
      githubRelease: null,
      dockerHubTag: null,
    })).toEqual({
      label: '无法检查更新',
      badgeClassName: 'badge badge-muted',
      detail: '暂未获取到可比较的版本信息。',
      highlight: false,
    });
  });

  it('highlights a newer GitHub release', () => {
    const reminder = buildUpdateReminder({
      currentVersion: '1.2.3',
      helper: null,
      githubRelease: { normalizedVersion: '1.3.0', displayVersion: '1.3.0', tagName: 'v1.3.0' },
      dockerHubTag: null,
    });
    expect(reminder.highlight).toBe(true);
    expect(reminder.label).toContain('新版本');
  });

  it('reports up to date when the candidate matches the running version', () => {
    const reminder = buildUpdateReminder({
      currentVersion: '1.2.3',
      helper: null,
      githubRelease: { normalizedVersion: '1.2.3', displayVersion: '1.2.3', tagName: 'v1.2.3' },
      dockerHubTag: null,
    });
    expect(reminder.highlight).toBe(false);
    expect(reminder.label).toContain('最新');
  });
});
