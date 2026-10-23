import { describe, expect, it } from 'vitest';
import type { Card } from '@axon/shared';
import { calculateStats } from './results.js';

function votesOf(...cards: Card[]): Map<string, Card> {
  return new Map(cards.map((card, i) => [`v${i + 1}`, card]));
}

describe('calculateStats', () => {
  it.each<[string, Card[], number | null, boolean, string[], number | null]>([
    ['5, 5, 5', [5, 5, 5], 5, true, [], 5],
    ['3, 5, 8', [3, 5, 8], 5.3, false, ['v1', 'v3'], 5],
    ['5, ?, coffee', [5, '?', 'coffee'], 5, false, [], 5],
    ['?, coffee', ['?', 'coffee'], null, false, [], null],
    ['2, 3', [2, 3], 2.5, false, ['v1', 'v2'], 3],
    ['a single numeric vote', [5], 5, false, [], 5],
    ['1, 2 (tie goes higher)', [1, 2], 1.5, false, ['v1', 'v2'], 2],
    ['0, 0', [0, 0], 0, true, [], 0],
    ['1, 1, 2', [1, 1, 2], 1.3, false, ['v1', 'v2', 'v3'], 1],
    ['13, 21 (equally close)', [13, 21], 17, false, ['v1', 'v2'], 21],
  ])('%s', (_label, cards, average, consensus, outlierIds, suggestedEstimate) => {
    expect(calculateStats(votesOf(...cards))).toMatchObject({
      average,
      consensus,
      outlierIds,
      suggestedEstimate,
    });
  });

  it.each<[Card[], number]>([
    [[2, 2, 3], 2.3],
    [[0, 0, 1], 0.3],
    [[1, 2, 2, 2], 1.8],
    [[1, 1, 1, 2], 1.3],
    [[0, 1, 1, 1, 1, 1, 1, 1], 0.9],
  ])('rounds the average of %j half up to %d', (cards, average) => {
    expect(calculateStats(votesOf(...cards)).average).toBe(average);
  });

  it('lists only cards with votes, in deck order', () => {
    const stats = calculateStats(votesOf('coffee', 8, 3, '?', 8, 3, 8));

    expect(stats.distribution).toEqual([
      { card: 3, count: 2 },
      { card: 8, count: 3 },
      { card: '?', count: 1 },
      { card: 'coffee', count: 1 },
    ]);
  });

  it('returns an empty result for no votes', () => {
    expect(calculateStats(new Map())).toEqual({
      distribution: [],
      average: null,
      consensus: false,
      outlierIds: [],
      suggestedEstimate: null,
    });
  });

  it('marks every voter sharing the lowest or the highest vote as an outlier', () => {
    expect(calculateStats(votesOf(2, 5, 2, 8, 8, '?')).outlierIds).toEqual([
      'v1',
      'v3',
      'v4',
      'v5',
    ]);
  });

  it('ignores ? and coffee for consensus and outliers', () => {
    const stats = calculateStats(votesOf(5, 5, '?', 'coffee'));

    expect(stats.consensus).toBe(true);
    expect(stats.outlierIds).toEqual([]);
    expect(stats.average).toBe(5);
  });
});
