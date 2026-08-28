import { describe, expect, it } from 'vitest';
import * as baseModule from './base.js';
import { BasePlatformAdapter, type BalanceInfo, type CheckinResult } from './base.js';
import { VeloeraAdapter } from './veloera.js';

class TestBaseAdapter extends BasePlatformAdapter {
  readonly platformName = 'test-base';

  async detect(): Promise<boolean> {
    return true;
  }

  async checkin(): Promise<CheckinResult> {
    return { success: true, message: 'ok' };
  }

  async getBalance(): Promise<BalanceInfo> {
    return { balance: 0, used: 0, quota: 0 };
  }

  async getModels(): Promise<string[]> {
    return [];
  }

  protected override async fetchJson(): Promise<unknown> {
    return { success: true, data: { token: 'base-token', id: 80305 } };
  }
}

class TestVeloeraAdapter extends VeloeraAdapter {
  protected override async fetchJson(): Promise<unknown> {
    return { success: true, data: { token: 'veloera-token', id: '80306' } };
  }
}

type LoginIdExtractor = (payload: unknown) => number | undefined;

function getLoginIdExtractor(): LoginIdExtractor | undefined {
  return (baseModule as typeof baseModule & {
    extractPlatformUserIdFromLoginPayload?: LoginIdExtractor;
  }).extractPlatformUserIdFromLoginPayload;
}

describe('login platform user ID extraction', () => {
  it('accepts only positive safe integer IDs from known login response positions', () => {
    const extract = getLoginIdExtractor();

    expect(extract).toBeTypeOf('function');
    const cases: Array<{ payload: unknown; expected: number | undefined }> = [
      { payload: { data: { id: 80305 } }, expected: 80305 },
      { payload: { data: { user: { id: '80306' } } }, expected: 80306 },
      { payload: { user: { id: '80307' } }, expected: 80307 },
      { payload: { id: 80308 }, expected: 80308 },
      { payload: { data: { id: '80305abc' } }, expected: undefined },
      { payload: { data: { id: '80305.9' } }, expected: undefined },
      { payload: { data: { id: 0 } }, expected: undefined },
      { payload: { data: { id: -1 } }, expected: undefined },
      { payload: { data: { id: Number.POSITIVE_INFINITY } }, expected: undefined },
      { payload: { data: { id: Number.MAX_SAFE_INTEGER + 1 } }, expected: undefined },
      { payload: { data: { id: true } }, expected: undefined },
      { payload: { data: { id: {} } }, expected: undefined },
      { payload: { data: { id: [] } }, expected: undefined },
    ];

    for (const { payload, expected } of cases) {
      expect(extract?.(payload)).toBe(expected);
    }
  });

  it('returns data.id from base adapter login', async () => {
    const result = await new TestBaseAdapter().login('https://example.com', 'demo', 'password');

    expect(result).toEqual({
      success: true,
      accessToken: 'base-token',
      username: 'demo',
      platformUserId: 80305,
    });
  });

  it('returns an ID through the inherited Veloera base login', async () => {
    const result = await new TestVeloeraAdapter().login('https://example.com', 'demo', 'password');

    expect(result).toEqual({
      success: true,
      accessToken: 'veloera-token',
      username: 'demo',
      platformUserId: 80306,
    });
  });
});
