import { describe, expect, it } from 'vitest';
import { clearSession, persistSession, readSession } from './session.js';
import { resolveTheme, nextThemeMode } from './theme.js';
import { searchDestination } from './searchDestination.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('new shell parity contracts', () => {
  it('expires a login at the same twelve-hour boundary as the reference UI', () => {
    const storage = memoryStorage();
    persistSession(storage, ' token ', 100);
    expect(readSession(storage, 101)).toBe('token');
    expect(readSession(storage, 100 + 12 * 60 * 60 * 1000)).toBe(null);
    expect(storage.getItem('metapi-auth-token')).toBe(null);
  });
  it('migrates an existing new UI token without extending its expiry on every read', () => {
    const storage = memoryStorage();
    storage.setItem('metapi-auth-token', 'existing');
    expect(readSession(storage, 100)).toBe('existing');
    expect(readSession(storage, 200)).toBe('existing');
    expect(readSession(storage, 100 + 12 * 60 * 60 * 1000)).toBe(null);
  });
  it('clears both token and expiry on logout', () => {
    const storage = memoryStorage();
    persistSession(storage, 'secret', 100);
    clearSession(storage);
    expect(storage.getItem('metapi-auth-token')).toBe(null);
    expect(storage.getItem('metapi-auth-expires-at')).toBe(null);
  });
  it('follows system changes without changing the saved system preference', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(nextThemeMode('system')).toBe('light');
    expect(nextThemeMode('dark')).toBe('system');
  });
  it('retains exact model focus and account-token segment in search navigation', () => {
    expect(searchDestination('models', { name: 'gpt/a+b' })).toBe('/app/models?focusModel=gpt%2Fa%2Bb');
    expect(searchDestination('accountTokens', { id: 42 })).toBe('/app/accounts?segment=tokens&focusTokenId=42');
    expect(searchDestination('sites', { id: 12 })).toBe('/app/sites?focusSiteId=12');
  });
});
