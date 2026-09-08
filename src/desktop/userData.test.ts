import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  LEGACY_USER_DATA_DIR_NAME,
  resolvePinnedUserDataPath,
} from './userData.js';

describe('resolvePinnedUserDataPath', () => {
  it('pins userData to the legacy Metapi directory under appData', () => {
    expect(resolvePinnedUserDataPath(join('/home', 'u', '.config'))).toBe(
      join('/home', 'u', '.config', 'Metapi'),
    );
  });

  it('uses the exact directory name that shipped desktop builds created', () => {
    // productName was `Metapi` in all shipped builds, so Electron derived
    // userData from `Metapi`. Renaming productName to `Metapi-Evolution`
    // must not move the data directory.
    expect(LEGACY_USER_DATA_DIR_NAME).toBe('Metapi');
  });
});
