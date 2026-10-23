import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThemeMemory } from '../lib/themeStorage';
import { useTheme } from './useTheme';

type Listener = (event: { matches: boolean }) => void;

function stubSystem(initialDark: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initialDark,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    listeners,
    change(matches: boolean) {
      query.matches = matches;
      listeners.forEach((l) => l({ matches }));
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  clearThemeMemory();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.className = '';
});

describe('useTheme', () => {
  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('follows the system on a first visit (dark %s)', (dark, expected) => {
    stubSystem(dark);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe(expected);
    expect(document.documentElement.classList.contains('dark')).toBe(dark);
  });

  it('prefers a stored choice over the system', () => {
    stubSystem(true);
    window.localStorage.setItem('axon.theme', 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('ignores an invalid stored value and uses the system', () => {
    stubSystem(true);
    window.localStorage.setItem('axon.theme', 'blue');

    expect(renderHook(() => useTheme()).result.current.theme).toBe('dark');
  });

  it('toggles immediately, applies the class and remembers the choice', () => {
    stubSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('axon.theme')).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem('axon.theme')).toBe('light');
  });

  it('follows system changes only until the player has chosen', () => {
    const system = stubSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => system.change(true));
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(system.listeners.size).toBe(0);
    act(() => system.change(true));
    expect(result.current.theme).toBe('light');
  });

  it('removes its system listener on unmount', () => {
    const system = stubSystem(false);
    const { unmount } = renderHook(() => useTheme());
    expect(system.listeners.size).toBe(1);

    unmount();

    expect(system.listeners.size).toBe(0);
  });

  it('still toggles when storage throws, without an error', () => {
    stubSystem(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useTheme());

    expect(() => act(() => result.current.toggle())).not.toThrow();

    expect(result.current.theme).toBe('dark');
  });

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
  });

  it('follows a choice made in another tab through the storage event', () => {
    stubSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'axon.theme', newValue: 'dark' }));
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores storage events for other keys and invalid values', () => {
    stubSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'dark' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'axon.theme', newValue: 'blue' }));
    });

    expect(result.current.theme).toBe('light');
  });

  it('removes the storage listener on unmount', () => {
    stubSystem(false);
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useTheme());

    unmount();

    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
