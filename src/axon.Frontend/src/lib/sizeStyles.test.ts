import { describe, expect, it } from 'vitest';
import { SIZE_SEGMENTS, SIZE_STYLES } from './sizeStyles';

const LEVELS = [0, 1, 2, 3, 4] as const;
const HUES = ['emerald', 'lime', 'amber', 'orange', 'red'];

describe('SIZE_STYLES', () => {
  it('has five levels and five bar segments', () => {
    expect(Object.keys(SIZE_STYLES)).toEqual(['0', '1', '2', '3', '4']);
    expect(SIZE_SEGMENTS).toBe(5);
  });

  it.each(LEVELS)(
    'level %d uses its own hue, from green to red, with a dark variant for every part',
    (level) => {
      const hue = HUES[level]!;
      const { chip, selected, bar } = SIZE_STYLES[level];

      for (const part of [chip, selected, bar]) {
        expect(part).toContain(hue);
        expect(part).toContain('dark:');
        expect(part).not.toMatch(new RegExp(`(?:${HUES.filter((h) => h !== hue).join('|')})-\\d`));
      }
      expect(chip).toMatch(/border-.* bg-.* text-.*dark:border-.* dark:bg-.* dark:text-/);
      expect(selected).toMatch(/peer-checked:bg-.*dark:peer-checked:bg-/);
      expect(bar).toMatch(/^bg-.* dark:bg-/);
    },
  );

  it('gives every level a different look', () => {
    expect(new Set(LEVELS.map((l) => SIZE_STYLES[l].chip)).size).toBe(5);
    expect(new Set(LEVELS.map((l) => SIZE_STYLES[l].selected)).size).toBe(5);
    expect(new Set(LEVELS.map((l) => SIZE_STYLES[l].bar)).size).toBe(5);
  });
});
