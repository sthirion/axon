import { z } from 'zod';

export const DECK = [0, 1, 2, 3, 5, 8, 13, 21, '?', 'coffee'] as const;

export type Card = (typeof DECK)[number];

// Exact match only: "5", 4, 5.5 and "Coffee" are not cards.
export const cardSchema = z.custom<Card>((value) => DECK.some((card) => card === value));
