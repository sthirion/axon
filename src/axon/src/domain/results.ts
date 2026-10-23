import {
  deckOf,
  estimateCardsOf,
  isEstimateOf,
  type Card,
  type EstimateCard,
  type RoundStats,
  type Scale,
} from '@axon/shared';

// Mean rounded half up to one decimal, using integers so 1.75 never becomes 1.7 through float error.
function roundedMean(sum: number, count: number): number {
  return Math.floor((20 * sum + count) / (2 * count)) / 10;
}

type NumericCard = Extract<EstimateCard, number>;

const isNumeric = (card: EstimateCard): card is NumericCard => typeof card === 'number';

// The numeric card closest to the exact mean; a tie goes to the higher card.
function closestCard(cards: readonly NumericCard[], sum: number, count: number): NumericCard {
  let best = cards[0] as NumericCard;
  for (const card of cards) {
    // Compare |card * count - sum| to stay exact; `<=` lets the higher card win a tie.
    if (Math.abs(card * count - sum) <= Math.abs(best * count - sum)) {
      best = card;
    }
  }
  return best;
}

const EMPTY: Omit<RoundStats, 'distribution'> = {
  average: null,
  median: null,
  consensus: false,
  outlierIds: [],
  suggestedEstimate: null,
};

// `?` and coffee are counted in the distribution only. Cards are ordered by their place in the
// deck, which is value order for numbers and size order for t-shirt sizes.
export function calculateStats(votes: ReadonlyMap<string, Card>, scale: Scale): RoundStats {
  const deck = deckOf(scale);
  const rank = (card: Card) => deck.indexOf(card);

  const counts = new Map<Card, number>();
  const sized: Array<{ id: string; card: EstimateCard }> = [];
  for (const [id, card] of votes) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
    if (isEstimateOf(scale, card)) {
      sized.push({ id, card });
    }
  }

  const distribution = deck.flatMap((card) => {
    const count = counts.get(card);
    return count === undefined ? [] : [{ card, count }];
  });

  if (sized.length === 0) {
    return { distribution, ...EMPTY };
  }

  const ordered = [...sized].sort((a, b) => rank(a.card) - rank(b.card));
  const lowest = (ordered[0] as { card: EstimateCard }).card;
  const highest = (ordered[ordered.length - 1] as { card: EstimateCard }).card;
  const distinct = lowest !== highest;
  const consensus = sized.length >= 2 && !distinct;
  // With an even count this is the higher of the two middle cards.
  const median = (ordered[Math.floor(ordered.length / 2)] as { card: EstimateCard }).card;
  const outlierIds = distinct
    ? sized.filter((vote) => vote.card === lowest || vote.card === highest).map((vote) => vote.id)
    : [];

  if (scale === 'tshirt') {
    return {
      distribution,
      average: null,
      median,
      consensus,
      outlierIds,
      suggestedEstimate: consensus ? lowest : median,
    };
  }

  const sum = sized.reduce((total, vote) => total + (vote.card as number), 0);
  return {
    distribution,
    average: roundedMean(sum, sized.length),
    median,
    consensus,
    outlierIds,
    suggestedEstimate: consensus
      ? lowest
      : closestCard(estimateCardsOf(scale).filter(isNumeric), sum, sized.length),
  };
}
