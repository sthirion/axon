import { describe, expect, it } from 'vitest';
import type { Card, Scale } from '@axon/shared';
import { calculateStats } from './results.js';

function votesOf(...cards: Card[]): Map<string, Card> {
  return new Map(cards.map((card, i) => [`v${i + 1}`, card]));
}

type Row = [string, Scale, Card[], number | null, Card | null, boolean, string[], Card | null];

describe('calculateStats: every row of the table in the requirements', () => {
  it.each<Row>([
    ['fibonacci 5, 5, 5', 'fibonacci', [5, 5, 5], 5, 5, true, [], 5],
    ['fibonacci 3, 5, 8', 'fibonacci', [3, 5, 8], 5.3, 5, false, ['v1', 'v3'], 5],
    ['fibonacci 5, ?, coffee', 'fibonacci', [5, '?', 'coffee'], 5, 5, false, [], 5],
    ['fibonacci ?, coffee', 'fibonacci', ['?', 'coffee'], null, null, false, [], null],
    ['fibonacci 2, 3', 'fibonacci', [2, 3], 2.5, 3, false, ['v1', 'v2'], 3],
    ['fibonacci a single sized vote', 'fibonacci', [5], 5, 5, false, [], 5],
    ['fibonacci 1, 2 (tie goes higher)', 'fibonacci', [1, 2], 1.5, 2, false, ['v1', 'v2'], 2],
    ['fibonacci 1, 1', 'fibonacci', [1, 1], 1, 1, true, [], 1],
    ['fibonacci 1, 1, 2', 'fibonacci', [1, 1, 2], 1.3, 1, false, ['v1', 'v2', 'v3'], 1],
    ['fibonacci 13, 21 (equally close)', 'fibonacci', [13, 21], 17, 21, false, ['v1', 'v2'], 21],
    ['incremental 4, 6', 'incremental', [4, 6], 5, 6, false, ['v1', 'v2'], 5],
    ['incremental 7, 7, 7', 'incremental', [7, 7, 7], 7, 7, true, [], 7],
    [
      'incremental 1, 10 (tie goes higher)',
      'incremental',
      [1, 10],
      5.5,
      10,
      false,
      ['v1', 'v2'],
      6,
    ],
    ['incremental 3, 4 (tie goes higher)', 'incremental', [3, 4], 3.5, 4, false, ['v1', 'v2'], 4],
    ['incremental 9, 10, ?', 'incremental', [9, 10, '?'], 9.5, 10, false, ['v1', 'v2'], 10],
    ['tshirt M, M, M', 'tshirt', ['M', 'M', 'M'], null, 'M', true, [], 'M'],
    ['tshirt S, M, XL', 'tshirt', ['S', 'M', 'XL'], null, 'M', false, ['v1', 'v3'], 'M'],
    ['tshirt S, L', 'tshirt', ['S', 'L'], null, 'L', false, ['v1', 'v2'], 'L'],
    ['tshirt M, ?, coffee', 'tshirt', ['M', '?', 'coffee'], null, 'M', false, [], 'M'],
    ['tshirt ?, coffee', 'tshirt', ['?', 'coffee'], null, null, false, [], null],
    [
      'tshirt XS, S, M, L (higher middle)',
      'tshirt',
      ['XS', 'S', 'M', 'L'],
      null,
      'M',
      false,
      ['v1', 'v4'],
      'M',
    ],
    ['tshirt a single size', 'tshirt', ['XL'], null, 'XL', false, [], 'XL'],
    [
      'tshirt L, L, XL, XL',
      'tshirt',
      ['L', 'L', 'XL', 'XL'],
      null,
      'XL',
      false,
      ['v1', 'v2', 'v3', 'v4'],
      'XL',
    ],
  ])('%s', (_label, scale, cards, average, median, consensus, outlierIds, suggestedEstimate) => {
    expect(calculateStats(votesOf(...cards), scale)).toMatchObject({
      average,
      median,
      consensus,
      outlierIds,
      suggestedEstimate,
    });
  });
});

describe('calculateStats: numeric scales', () => {
  it.each<[Scale, Card[], number]>([
    ['fibonacci', [2, 2, 3], 2.3],
    ['fibonacci', [1, 1, 1, 2], 1.3],
    ['fibonacci', [1, 2, 2, 2], 1.8],
    ['incremental', [1, 1, 1, 2], 1.3],
    ['incremental', [1, 2, 2, 2, 2, 2, 2, 2], 1.9],
    ['incremental', [10, 10, 9], 9.7],
  ])('rounds the %s average of %j half up to %d', (scale, cards, average) => {
    expect(calculateStats(votesOf(...cards), scale).average).toBe(average);
  });

  it('proposes a card of the scale: the closest incremental card to 5.5 is 6 (tie goes higher)', () => {
    expect(calculateStats(votesOf(5, 6), 'incremental').suggestedEstimate).toBe(6);
  });

  it('treats a card of another scale as unsized and never proposes it', () => {
    const stats = calculateStats(votesOf(4, 4), 'fibonacci');

    expect(stats.suggestedEstimate).toBeNull();
    expect(stats.average).toBeNull();
  });
});

describe('calculateStats: distribution', () => {
  it.each<[Scale, Card[], Array<[Card, number]>]>([
    [
      'fibonacci',
      ['coffee', 8, 3, '?', 8, 3, 8],
      [
        [3, 2],
        [8, 3],
        ['?', 1],
        ['coffee', 1],
      ],
    ],
    [
      'tshirt',
      ['XL', 'S', 'coffee', 'S', 'M'],
      [
        ['S', 2],
        ['M', 1],
        ['XL', 1],
        ['coffee', 1],
      ],
    ],
    [
      'incremental',
      [10, 1, 10, '?'],
      [
        [1, 1],
        [10, 2],
        ['?', 1],
      ],
    ],
  ])('lists only cards with votes, in deck order (%s)', (scale, cards, expected) => {
    expect(calculateStats(votesOf(...cards), scale).distribution).toEqual(
      expected.map(([card, count]) => ({ card, count })),
    );
  });
});

describe('calculateStats: edge cases', () => {
  it.each<Scale>(['fibonacci', 'incremental', 'tshirt'])(
    'returns an empty result for no votes (%s)',
    (scale) => {
      expect(calculateStats(new Map(), scale)).toEqual({
        distribution: [],
        average: null,
        median: null,
        consensus: false,
        outlierIds: [],
        suggestedEstimate: null,
      });
    },
  );

  it('marks every voter sharing the lowest or the highest size as an outlier', () => {
    expect(calculateStats(votesOf('S', 'M', 'S', 'XL', 'XL', '?'), 'tshirt').outlierIds).toEqual([
      'v1',
      'v3',
      'v4',
      'v5',
    ]);
  });

  it('ignores ? and coffee for consensus and outliers', () => {
    const stats = calculateStats(votesOf('M', 'M', '?', 'coffee'), 'tshirt');

    expect(stats.consensus).toBe(true);
    expect(stats.outlierIds).toEqual([]);
    expect(stats.median).toBe('M');
  });

  it('never reports an average for t-shirt sizes', () => {
    expect(calculateStats(votesOf('S', 'M', 'L'), 'tshirt').average).toBeNull();
  });
});
