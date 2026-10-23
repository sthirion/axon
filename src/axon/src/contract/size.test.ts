import { describe, expect, it } from 'vitest';
import {
  estimateCardsOf,
  isTooLarge,
  SCALES,
  SIZE_LEVELS,
  sizeLevel,
  TOO_LARGE_FROM,
  type Card,
  type Scale,
  type SizeLevel,
} from '@axon/shared';

const TABLE: ReadonlyArray<readonly [Scale, Card, SizeLevel, boolean]> = [
  ['fibonacci', 1, 0, false],
  ['fibonacci', 2, 0, false],
  ['fibonacci', 3, 1, false],
  ['fibonacci', 5, 2, false],
  ['fibonacci', 8, 3, false],
  ['fibonacci', 13, 4, true],
  ['fibonacci', 21, 4, true],
  ['incremental', 1, 0, false],
  ['incremental', 2, 0, false],
  ['incremental', 3, 1, false],
  ['incremental', 4, 1, false],
  ['incremental', 5, 2, false],
  ['incremental', 6, 2, false],
  ['incremental', 7, 3, false],
  ['incremental', 8, 3, true],
  ['incremental', 9, 4, true],
  ['incremental', 10, 4, true],
  ['tshirt', 'XS', 0, false],
  ['tshirt', 'S', 1, false],
  ['tshirt', 'M', 2, false],
  ['tshirt', 'L', 3, true],
  ['tshirt', 'XL', 4, true],
];

describe('sizeLevel and isTooLarge: every sized card of every scale', () => {
  it.each(TABLE)('%s %j has level %d, too large: %s', (scale, card, level, tooLarge) => {
    expect(sizeLevel(scale, card)).toBe(level);
    expect(isTooLarge(scale, card), `${scale} ${String(card)}`).toBe(tooLarge);
  });

  it('covers exactly the sized cards of each scale, once', () => {
    for (const scale of SCALES) {
      const covered = TABLE.filter(([s]) => s === scale).map(([, card]) => card);
      expect(covered).toEqual([...estimateCardsOf(scale)]);
    }
  });

  it('never goes down as the card gets bigger, and uses every one of the five levels', () => {
    for (const scale of SCALES) {
      const levels = estimateCardsOf(scale).map((card) => sizeLevel(scale, card) as number);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
      expect(new Set(levels)).toEqual(new Set([0, 1, 2, 3, 4]));
    }
  });

  it('flags a card and every bigger one, never a smaller one', () => {
    for (const scale of SCALES) {
      const flags = estimateCardsOf(scale).map((card) => isTooLarge(scale, card));
      const first = flags.indexOf(true);
      expect(first).toBeGreaterThan(0);
      expect(flags.slice(first).every(Boolean)).toBe(true);
      expect(flags.slice(0, first).some(Boolean)).toBe(false);
      expect(estimateCardsOf(scale)[first]).toBe(TOO_LARGE_FROM[scale]);
    }
  });

  it.each(SCALES)('has no level and is never too large for ? and coffee in %s', (scale) => {
    for (const card of ['?', 'coffee']) {
      expect(sizeLevel(scale, card)).toBeNull();
      expect(isTooLarge(scale, card)).toBe(false);
    }
  });

  it.each<[Scale, unknown]>([
    ['fibonacci', 'M'],
    ['fibonacci', 4],
    ['fibonacci', 0],
    ['fibonacci', 10],
    ['incremental', 'XL'],
    ['incremental', 11],
    ['incremental', 21],
    ['tshirt', 5],
    ['tshirt', 'XXL'],
    ['tshirt', 'xl'],
    ['fibonacci', '13'],
    ['fibonacci', null],
    ['tshirt', undefined],
    ['incremental', {}],
  ])('has no level and is not too large for %s card %j', (scale, card) => {
    expect(sizeLevel(scale, card)).toBeNull();
    expect(isTooLarge(scale, card)).toBe(false);
  });

  it('names the five levels', () => {
    expect([...SIZE_LEVELS]).toEqual(['small', 'modest', 'medium', 'large', 'huge']);
  });
});
