import { DECK, type Card, type RoundStats } from '@axon/shared';

type NumericCard = Extract<Card, number>;

function isNumeric(card: Card): card is NumericCard {
  return typeof card === 'number';
}

const NUMERIC_DECK: readonly NumericCard[] = DECK.filter(isNumeric);

// Mean rounded half up to one decimal, using integers so 1.75 never becomes 1.7 through float error.
function roundedMean(sum: number, count: number): number {
  return Math.floor((20 * sum + count) / (2 * count)) / 10;
}

// Closest numeric deck value to the exact mean; a tie goes to the higher value.
function closestDeckValue(sum: number, count: number): number {
  let best: number = NUMERIC_DECK[0];
  for (const value of NUMERIC_DECK) {
    // Compare |value * count - sum| to stay exact; `<=` lets the higher value win a tie.
    if (Math.abs(value * count - sum) <= Math.abs(best * count - sum)) {
      best = value;
    }
  }
  return best;
}

export function calculateStats(votes: ReadonlyMap<string, Card>): RoundStats {
  const counts = new Map<Card, number>();
  const numeric: Array<{ id: string; value: number }> = [];
  for (const [id, card] of votes) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
    if (isNumeric(card)) {
      numeric.push({ id, value: card });
    }
  }

  const distribution = DECK.flatMap((card) => {
    const count = counts.get(card);
    return count === undefined ? [] : [{ card, count }];
  });

  if (numeric.length === 0) {
    return {
      distribution,
      average: null,
      consensus: false,
      outlierIds: [],
      suggestedEstimate: null,
    };
  }

  const sum = numeric.reduce((total, vote) => total + vote.value, 0);
  const min = Math.min(...numeric.map((vote) => vote.value));
  const max = Math.max(...numeric.map((vote) => vote.value));
  const distinct = min !== max;
  const consensus = numeric.length >= 2 && !distinct;

  return {
    distribution,
    average: roundedMean(sum, numeric.length),
    consensus,
    outlierIds: distinct
      ? numeric.filter((vote) => vote.value === min || vote.value === max).map((vote) => vote.id)
      : [],
    suggestedEstimate: consensus ? min : closestDeckValue(sum, numeric.length),
  };
}
