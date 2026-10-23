import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThemeMemory, readStoredTheme, writeStoredTheme } from './themeStorage';

beforeEach(() => {
  window.localStorage.clear();
  clearThemeMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('themeStorage', () => {
  it('has no choice by default', () => {
    expect(readStoredTheme()).toBeNull();
  });

  it('writes the exact string under axon.theme and reads it back', () => {
    writeStoredTheme('dark');

    expect(window.localStorage.getItem('axon.theme')).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it.each(['blue', '', 'DARK'])('ignores the stored value %j', (value) => {
    window.localStorage.setItem('axon.theme', value);

    expect(readStoredTheme()).toBeNull();
  });

  it('keeps the choice in memory when storage throws, without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => writeStoredTheme('light')).not.toThrow();
    expect(readStoredTheme()).toBe('light');
  });
});
