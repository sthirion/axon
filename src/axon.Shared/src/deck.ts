import { z } from 'zod';

export const SCALES = ['fibonacci', 'incremental', 'tshirt'] as const;

export type Scale = (typeof SCALES)[number];

export const DEFAULT_SCALE: Scale = 'fibonacci';

// Exact strings only: "Fibonacci", "t-shirt" and "" are not scales.
export const scaleSchema = z.enum(SCALES);

const FIBONACCI = [0, 1, 2, 3, 5, 8, 13, 21] as const;
const INCREMENTAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
// Deck order is size order: XS < S < M < L < XL.
const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;
// Present in every scale; never an estimate.
const SPECIAL = ['?', 'coffee'] as const;

export type SpecialCard = (typeof SPECIAL)[number];

// A card that can be the team's estimate: a number or a size.
export type EstimateCard =
  (typeof FIBONACCI)[number] | (typeof INCREMENTAL)[number] | (typeof SIZES)[number];

// Every card of every scale: what can travel on the wire.
export type Card = EstimateCard | SpecialCard;

export const ESTIMATE_CARDS: Readonly<Record<Scale, readonly EstimateCard[]>> = {
  fibonacci: FIBONACCI,
  incremental: INCREMENTAL,
  tshirt: SIZES,
};

export const DECKS: Readonly<Record<Scale, readonly Card[]>> = {
  fibonacci: [...FIBONACCI, ...SPECIAL],
  incremental: [...INCREMENTAL, ...SPECIAL],
  tshirt: [...SIZES, ...SPECIAL],
};

// The default (Fibonacci) deck.
export const DECK = DECKS.fibonacci;

export const SCALE_LABELS: Readonly<Record<Scale, string>> = {
  fibonacci: 'Fibonacci',
  incremental: 'Incremental',
  tshirt: 'T-shirt sizes',
};

export const SCALE_DESCRIPTIONS: Readonly<Record<Scale, string>> = {
  fibonacci: '0, 1, 2, 3, 5, 8, 13, 21',
  incremental: '0 to 10',
  tshirt: 'XS, S, M, L, XL',
};

export function deckOf(scale: Scale): readonly Card[] {
  return DECKS[scale];
}

export function estimateCardsOf(scale: Scale): readonly EstimateCard[] {
  return ESTIMATE_CARDS[scale];
}

// Strict equality on purpose: "5", 4 in Fibonacci, 5.5, "m" and "Coffee" are not cards.
export function isCardOf(scale: Scale, value: unknown): value is Card {
  return DECKS[scale].some((card) => card === value);
}

export function isEstimateOf(scale: Scale, value: unknown): value is EstimateCard {
  return ESTIMATE_CARDS[scale].some((card) => card === value);
}

const isAnyCard = (value: unknown): value is Card => SCALES.some((scale) => isCardOf(scale, value));

const isAnyEstimate = (value: unknown): value is EstimateCard =>
  SCALES.some((scale) => isEstimateOf(scale, value));

// Wire format: any card of any scale. The session's scale is checked where the scale is known.
export const cardSchema = z.custom<Card>(isAnyCard);

// Any card that can be an estimate in some scale (numbers and sizes, never "?" or coffee).
export const estimateCardSchema = z.custom<EstimateCard>(isAnyEstimate);

export const cardSchemaFor = (scale: Scale) => z.custom<Card>((value) => isCardOf(scale, value));

export const estimateSchemaFor = (scale: Scale) =>
  z.custom<EstimateCard>((value) => isEstimateOf(scale, value));
