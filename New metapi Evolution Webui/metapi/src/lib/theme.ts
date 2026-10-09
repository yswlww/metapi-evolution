export type Theme = 'dark' | 'light';
export type ThemeMode = Theme | 'system';

export function resolveTheme(mode: ThemeMode, prefersLight: boolean): Theme {
  return mode === 'system' ? (prefersLight ? 'light' : 'dark') : mode;
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
}
