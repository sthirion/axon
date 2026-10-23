import { z } from 'zod';

export const DECK = [0, 1, 2, 3, 5, 8, 13, 21, '?', 'coffee'] as const;

export type Card = (typeof DECK)[number];

// Exact match only: "5", 4, 5.5 and "Coffee" are not cards.
export const cardSchema = z.custom<Card>((value) => DECK.some((card) => card === value));

export type FinalEstimate = Extract<Card, number>;

export const FINAL_ESTIMATES: readonly FinalEstimate[] = DECK.filter(
  (card): card is FinalEstimate => typeof card === 'number',
);

// Only the numeric deck values: "?" and coffee cannot be the team's estimate.
export const finalEstimateSchema = z.custom<FinalEstimate>((value) =>
  FINAL_ESTIMATES.some((estimate) => estimate === value),
);
