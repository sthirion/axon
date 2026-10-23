export type Theme = 'light' | 'dark';

export const THEME_KEY = 'axon.theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

// Only the two exact strings are a choice; anything else counts as "no choice".
export function parseStoredTheme(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

// A stored choice wins; otherwise follow the operating system.
export function resolveTheme(stored: Theme | null, systemDark: boolean): Theme {
  return stored ?? (systemDark ? 'dark' : 'light');
}

// The class drives Tailwind's `dark:` styles; color-scheme makes native controls match.
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}
