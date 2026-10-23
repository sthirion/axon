import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme } from './theme';

const SCRIPT = readFileSync(
  path.resolve(import.meta.dirname, '../../public/theme-init.js'),
  'utf8',
);

function runScript() {
  // Same global scope as the page, as a classic script would run.
  new Function(SCRIPT)();
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
});

describe('public/theme-init.js', () => {
  // The same cases as resolveTheme and parseStoredTheme, so the two cannot drift.
  it.each([
    [null, true],
    [null, false],
    ['light', true],
    ['light', false],
    ['dark', true],
    ['dark', false],
    ['blue', true],
    ['blue', false],
    ['', true],
    ['DARK', false],
  ] as const)('stored %j with system dark %s agrees with resolveTheme', (stored, systemDark) => {
    vi.stubGlobal('matchMedia', () => ({ matches: systemDark }));
    if (stored !== null) window.localStorage.setItem('axon.theme', stored);
    const expected = resolveTheme(
      stored === 'light' || stored === 'dark' ? stored : null,
      systemDark,
    );

    runScript();

    expect(document.documentElement.classList.contains('dark')).toBe(expected === 'dark');
    expect(document.documentElement.style.colorScheme).toBe(expected);
  });

  it('falls back to the system when storage throws', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    runScript();

    expect(document.documentElement).toHaveClass('dark');
  });

  it('does not throw and stays light when both storage and matchMedia are unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(runScript).not.toThrow();
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('is a plain classic script: no arrow functions, let/const, template strings or modules', () => {
    expect(SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`|\bimport\b|\bexport\b/);
  });

  it('is loaded as a blocking classic script in the head of index.html', () => {
    const html = readFileSync(path.resolve(import.meta.dirname, '../../index.html'), 'utf8');
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

    expect(head).toContain('<script src="/theme-init.js"></script>');
    expect(head).not.toMatch(/theme-init\.js"[^>]*(defer|async|type="module")/);
  });
});
