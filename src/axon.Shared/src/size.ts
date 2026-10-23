import { isEstimateOf, type Card, type Scale } from './deck.js';

// How big a sized card is, from 0 (smallest) to 4 (largest). The same five steps are used for every
// scale, so the colours mean the same thing everywhere.
export const SIZE_LEVELS = ['small', 'modest', 'medium', 'large', 'huge'] as const;

export type SizeLevel = 0 | 1 | 2 | 3 | 4;

const LEVELS: Readonly<Record<Scale, ReadonlyArray<readonly [Card, SizeLevel]>>> = {
  fibonacci: [
    [1, 0],
    [2, 0],
    [3, 1],
    [5, 2],
    [8, 3],
    [13, 4],
    [21, 4],
  ],
  incremental: [
    [1, 0],
    [2, 0],
    [3, 1],
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 3],
    [8, 3],
    [9, 4],
    [10, 4],
  ],
  tshirt: [
    ['XS', 0],
    ['S', 1],
    ['M', 2],
    ['L', 3],
    ['XL', 4],
  ],
};

// The first card that is too large to take on as one story, per scale.
export const TOO_LARGE_FROM: Readonly<Record<Scale, Card>> = {
  fibonacci: 13,
  incremental: 8,
  tshirt: 'L',
};

// null for `?`, coffee and cards that are not in the scale.
export function sizeLevel(scale: Scale, card: unknown): SizeLevel | null {
  if (!isEstimateOf(scale, card)) return null;
  return LEVELS[scale].find(([candidate]) => candidate === card)?.[1] ?? null;
}

export function isTooLarge(scale: Scale, card: unknown): boolean {
  if (!isEstimateOf(scale, card)) return false;
  const sized = LEVELS[scale].map(([candidate]) => candidate);
  return sized.indexOf(card) >= sized.indexOf(TOO_LARGE_FROM[scale]);
}
