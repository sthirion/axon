import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  DARK_QUERY,
  parseStoredTheme,
  resolveTheme,
  systemPrefersDark,
  THEME_KEY,
  type Theme,
} from '../lib/theme';
import { readStoredTheme, writeStoredTheme } from '../lib/themeStorage';

export interface ThemeState {
  readonly theme: Theme;
  readonly toggle: () => void;
}

// A stored choice wins; with none, the page follows the operating system, also while it changes.
export function useTheme(): ThemeState {
  const [stored, setStored] = useState<Theme | null>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const theme = resolveTheme(stored, systemDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // A choice made in another tab of the same browser applies here too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY) setStored(parseStoredTheme(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (stored) return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [stored]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    writeStoredTheme(next);
    setStored(next);
  }, [theme]);

  return { theme, toggle };
}
