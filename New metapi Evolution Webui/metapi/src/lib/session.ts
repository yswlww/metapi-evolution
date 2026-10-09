import { clearAuthSession, getAuthToken, persistAuthSession } from '../../../../src/web/authSession.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEYS: Record<string, string> = {
  auth_token: 'metapi-auth-token',
  auth_token_expires_at: 'metapi-auth-expires-at',
};

function sessionStorage(storage: StorageLike): StorageLike {
  return {
    getItem: (key) => storage.getItem(KEYS[key] ?? key),
    setItem: (key, value) => storage.setItem(KEYS[key] ?? key, value),
    removeItem: (key) => storage.removeItem(KEYS[key] ?? key),
  };
}

export function readSession(storage: StorageLike, now = Date.now()): string | null {
  return getAuthToken(sessionStorage(storage), now);
}

export function persistSession(storage: StorageLike, token: string, now = Date.now()): void {
  persistAuthSession(sessionStorage(storage), token, undefined, now);
}

export function clearSession(storage: StorageLike): void {
  clearAuthSession(sessionStorage(storage));
}
