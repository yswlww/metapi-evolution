import { describe, expect, it } from 'vitest';

import { clearAuthSession, getAuthToken, hasValidAuthSession, persistAuthSession, AUTH_SESSION_DURATION_MS } from './authSession.js';

function memoryStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('shared administration session storage', () => {
  it('keeps the legacy session authoritative when both shells have stored credentials', () => {
    const storage = memoryStorage({
      auth_token: 'legacy-token',
      auth_token_expires_at: String(1_000 + AUTH_SESSION_DURATION_MS),
      'metapi-auth-token': 'new-shell-token',
      'metapi-auth-expires-at': String(1_000 + AUTH_SESSION_DURATION_MS),
    });
    expect(getAuthToken(storage, 1_000)).toBe('legacy-token');
  });

  it('authenticates the new shell from the legacy session without copying the token', () => {
    const storage = memoryStorage({
      auth_token: 'legacy-token',
      auth_token_expires_at: String(1_000 + AUTH_SESSION_DURATION_MS),
    });
    expect(getAuthToken(storage, 1_000)).toBe('legacy-token');
    expect(storage.getItem('metapi-auth-token')).toBeNull();
    expect(hasValidAuthSession(storage, 1_000)).toBe(true);
  });

  it('lets the new shell session stand in when no legacy session exists', () => {
    const storage = memoryStorage({
      'metapi-auth-token': 'new-shell-token',
      'metapi-auth-expires-at': String(1_000 + AUTH_SESSION_DURATION_MS),
    });
    expect(getAuthToken(storage, 1_000)).toBe('new-shell-token');
  });

  it('expires the new shell session instead of adopting it past its deadline', () => {
    const storage = memoryStorage({
      'metapi-auth-token': 'new-shell-token',
      'metapi-auth-expires-at': String(1_000),
    });
    expect(getAuthToken(storage, 1_001)).toBeNull();
    expect(storage.getItem('metapi-auth-token')).toBeNull();
    expect(storage.getItem('metapi-auth-expires-at')).toBeNull();
    expect(hasValidAuthSession(storage, 1_001)).toBe(false);
  });

  it('clears both shells when the shared session is invalidated', () => {
    const storage = memoryStorage({
      auth_token: 'legacy-token',
      auth_token_expires_at: '9999999999999',
      'metapi-auth-token': 'new-shell-token',
      'metapi-auth-expires-at': '9999999999999',
    });
    clearAuthSession(storage);
    expect(storage.getItem('auth_token')).toBeNull();
    expect(storage.getItem('auth_token_expires_at')).toBeNull();
    expect(storage.getItem('metapi-auth-token')).toBeNull();
    expect(storage.getItem('metapi-auth-expires-at')).toBeNull();
  });

  it('writes only legacy keys when a shell persists a new session', () => {
    const storage = memoryStorage();
    persistAuthSession(storage, ' issued-token ', AUTH_SESSION_DURATION_MS, 1_000);
    expect(storage.getItem('auth_token')).toBe('issued-token');
    expect(storage.getItem('auth_token_expires_at')).toBe(String(1_000 + AUTH_SESSION_DURATION_MS));
    expect(storage.getItem('metapi-auth-token')).toBeNull();
  });

  it('adopts an unmarked new shell session with the standard twelve-hour lifetime exactly once', () => {
    const storage = memoryStorage({ 'metapi-auth-token': 'unmarked-token' });
    expect(getAuthToken(storage, 1_000)).toBe('unmarked-token');
    expect(Number(storage.getItem('metapi-auth-expires-at'))).toBe(1_000 + AUTH_SESSION_DURATION_MS);
    expect(getAuthToken(storage, 1_000 + AUTH_SESSION_DURATION_MS)).toBeNull();
  });
});