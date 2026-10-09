const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
const AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY = 'auth_token_expires_at';
// The Evolution shell keeps its own pair of keys. The two interfaces share one
// backend and one administrator token, so a session established in either shell
// must authenticate the other without copying the credential between stores.
const EVOLUTION_AUTH_TOKEN_STORAGE_KEY = 'metapi-auth-token';
const EVOLUTION_AUTH_EXPIRES_AT_STORAGE_KEY = 'metapi-auth-expires-at';
export const AUTH_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

type StoredSession = { token: string; expiresAtRaw: string | null; storage: StorageLike; tokenKey: string; expiresKey: string };

function readStoredSession(storage: StorageLike, tokenKey: string, expiresKey: string): StoredSession {
  return {
    token: (storage.getItem(tokenKey) || '').trim(),
    expiresAtRaw: storage.getItem(expiresKey),
    storage,
    tokenKey,
    expiresKey,
  };
}

function resolveSession(target: StorageLike): StoredSession | null {
  const legacy = readStoredSession(target, AUTH_TOKEN_STORAGE_KEY, AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY);
  if (legacy.token) return legacy;
  const evolution = readStoredSession(target, EVOLUTION_AUTH_TOKEN_STORAGE_KEY, EVOLUTION_AUTH_EXPIRES_AT_STORAGE_KEY);
  return evolution.token ? evolution : null;
}

export function clearAuthSession(storage?: StorageLike | null): void {
  const target = resolveStorage(storage);
  if (!target) return;
  for (const [tokenKey, expiresKey] of [
    [AUTH_TOKEN_STORAGE_KEY, AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY],
    [EVOLUTION_AUTH_TOKEN_STORAGE_KEY, EVOLUTION_AUTH_EXPIRES_AT_STORAGE_KEY],
  ] as const) {
    target.removeItem(tokenKey);
    target.removeItem(expiresKey);
  }
}

export function persistAuthSession(
  storage: StorageLike | null | undefined,
  token: string,
  ttlMs = AUTH_SESSION_DURATION_MS,
  nowMs = Date.now(),
): void {
  const target = resolveStorage(storage);
  if (!target) return;

  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    clearAuthSession(target);
    return;
  }

  const expiresAt = nowMs + Math.max(1, Math.trunc(ttlMs));
  target.setItem(AUTH_TOKEN_STORAGE_KEY, cleanToken);
  target.setItem(AUTH_TOKEN_EXPIRES_AT_STORAGE_KEY, String(expiresAt));
}

export function getAuthToken(storage?: StorageLike | null, nowMs = Date.now()): string | null {
  const target = resolveStorage(storage);
  if (!target) return null;

  const session = resolveSession(target);
  if (!session) return null;
  const { token, expiresAtRaw, storage: store, tokenKey, expiresKey } = session;

  if (!expiresAtRaw) {
    // First read of a session stored without a deadline: apply the standard
    // lifetime once, in whichever shell's own keys hold it.
    store.setItem(expiresKey, String(nowMs + Math.max(1, Math.trunc(AUTH_SESSION_DURATION_MS))));
    return token;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    store.removeItem(tokenKey);
    store.removeItem(expiresKey);
    return null;
  }

  return token;
}

export function hasValidAuthSession(storage?: StorageLike | null, nowMs = Date.now()): boolean {
  return !!getAuthToken(storage, nowMs);
}
