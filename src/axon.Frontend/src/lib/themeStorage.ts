import { parseStoredTheme, THEME_KEY, type Theme } from './theme';

// Per-page fallback for when localStorage is missing or throws; lost on reload.
let memoryTheme: Theme | null = null;

export function readStoredTheme(): Theme | null {
  try {
    const stored = parseStoredTheme(window.localStorage.getItem(THEME_KEY));
    if (stored) return stored;
  } catch {
    // Fall through to the in-memory choice.
  }
  return memoryTheme;
}

export function writeStoredTheme(theme: Theme): void {
  memoryTheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignored: the choice just will not survive a reload.
  }
}

// Simulates a page reload in tests.
export function clearThemeMemory(): void {
  memoryTheme = null;
}
