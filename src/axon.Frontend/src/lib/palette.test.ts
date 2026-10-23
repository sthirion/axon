import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { DARK_COUNTERPART, DECORATIVE_CLASSES, PAIRS, SHADES } from './palette';

const SRC = path.resolve(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes('/test/')
      ? [full]
      : [];
  });
}

// A colour class is text|bg|border|outline followed by white or a palette shade, with any variants.
const COLOUR_CLASS =
  /(?<![\w-])((?:[\w-]+:)*)(text|bg|border|outline)-(white|(?:slate|red|green|blue|amber)-\d+)(?![\w-])/g;

describe.each(['light', 'dark'] as const)('%s theme contrast (WCAG 2.1 AA)', (theme) => {
  it.each(PAIRS.map((p) => [p.name, p] as const))('%s meets its minimum ratio', (_name, pair) => {
    const { foreground, background } = pair[theme];

    const ratio = contrastRatio(SHADES[foreground], SHADES[background]);

    expect(ratio, `${pair.name}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(
      pair.minimum,
    );
  });
});

describe('colour classes in the components', () => {
  const used = new Map<string, string>();
  for (const file of sources(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(COLOUR_CLASS)) {
      used.set(`${match[1]}${match[2]}-${match[3]}`, path.relative(SRC, file));
    }
  }

  it('finds the classes it is meant to guard', () => {
    expect(used.size).toBeGreaterThan(20);
    expect(used.has('dark:text-red-400')).toBe(true);
  });

  it.each([...used.entries()])('%s (in %s) is a known colour', (cls) => {
    const shade = /-(white|(?:slate|red|green|blue|amber)-\d+)$/.exec(cls)?.[1] as string;
    expect(Object.keys(SHADES), `${cls} is missing from palette SHADES`).toContain(shade);
  });

  it('puts the dark counterpart next to every light colour class, file by file', () => {
    const missing: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      const tokens = new Set([...text.matchAll(COLOUR_CLASS)].map((m) => `${m[1]}${m[2]}-${m[3]}`));
      for (const [light, dark] of Object.entries(DARK_COUNTERPART)) {
        if (tokens.has(light) && !tokens.has(dark))
          missing.push(`${path.relative(SRC, file)}: ${light}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('lists only decorative classes that really exist in the code', () => {
    DECORATIVE_CLASSES.forEach((cls) => expect(used.has(cls), cls).toBe(true));
  });
});
