import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, parseStoredTheme, resolveTheme, systemPrefersDark } from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
});

describe('parseStoredTheme', () => {
  it.each(['light', 'dark'])('accepts %s', (value) => {
    expect(parseStoredTheme(value)).toBe(value);
  });

  it.each(['DARK', 'Light', 'blue', '', ' dark', 'dark ', null, undefined, 1, true, {}])(
    'treats %j as no choice',
    (value) => {
      expect(parseStoredTheme(value)).toBeNull();
    },
  );
});

describe('resolveTheme', () => {
  it.each([
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
    [null, true, 'dark'],
    [null, false, 'light'],
  ] as const)('stored %s with system dark %s gives %s', (stored, systemDark, expected) => {
    expect(resolveTheme(stored, systemDark)).toBe(expected);
  });
});

describe('applyTheme', () => {
  it('sets the dark class and color-scheme, and removes them again', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('keeps other classes on the root element', () => {
    document.documentElement.className = 'keep';

    applyTheme('dark');
    applyTheme('light');

    expect(document.documentElement).toHaveClass('keep');
  });
});

describe('systemPrefersDark', () => {
  it('reads the media query', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(systemPrefersDark()).toBe(true);
  });

  it('is false when matchMedia is missing or throws', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
    vi.stubGlobal('matchMedia', () => {
      throw new Error('blocked');
    });
    expect(systemPrefersDark()).toBe(false);
  });
});
