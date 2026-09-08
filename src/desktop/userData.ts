import { join } from 'node:path';

/**
 * Shipped desktop builds (productName `Metapi`) derived their Electron
 * userData directory from the product name. The product is now
 * `Metapi-Evolution`; pinning userData to the legacy name keeps existing
 * server data and logs visible to the new build.
 */
export const LEGACY_USER_DATA_DIR_NAME = 'Metapi';

export function resolvePinnedUserDataPath(appDataPath: string): string {
  return join(appDataPath, LEGACY_USER_DATA_DIR_NAME);
}
