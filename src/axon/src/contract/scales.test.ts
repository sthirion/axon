import { describe, expect, it } from 'vitest';
import {
  cardSchema,
  cardSchemaFor,
  deckOf,
  DEFAULT_SCALE,
  ERROR_MESSAGES,
  estimateCardsOf,
  estimateSchemaFor,
  isCardOf,
  isEstimateOf,
  publicGameStateSchema,
  roundFinishPayloadSchema,
  SCALE_DESCRIPTIONS,
  SCALE_LABELS,
  scaleSchema,
  SCALES,
  type Scale,
} from '@axon/shared';

const GAME_ID = 'A'.repeat(22);

describe('the three scales', () => {
  it('are fibonacci, incremental and tshirt, with Fibonacci as the default', () => {
    expect([...SCALES]).toEqual(['fibonacci', 'incremental', 'tshirt']);
    expect(DEFAULT_SCALE).toBe('fibonacci');
  });

  it.each<[Scale, unknown[]]>([
    ['fibonacci', [1, 2, 3, 5, 8, 13, 21, '?', 'coffee']],
    ['incremental', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '?', 'coffee']],
    ['tshirt', ['XS', 'S', 'M', 'L', 'XL', '?', 'coffee']],
  ])('%s has the documented deck, in order', (scale, deck) => {
    expect(deckOf(scale)).toEqual(deck);
  });

  it.each<[Scale, unknown[]]>([
    ['fibonacci', [1, 2, 3, 5, 8, 13, 21]],
    ['incremental', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['tshirt', ['XS', 'S', 'M', 'L', 'XL']],
  ])('%s has sized cards without ? and coffee', (scale, sized) => {
    expect(estimateCardsOf(scale)).toEqual(sized);
  });

  it('has a label and a deck description for every scale', () => {
    expect(SCALE_LABELS).toEqual({
      fibonacci: 'Fibonacci',
      incremental: 'Incremental',
      tshirt: 'T-shirt sizes',
    });
    expect(SCALE_DESCRIPTIONS).toEqual({
      fibonacci: '1, 2, 3, 5, 8, 13, 21',
      incremental: '1 to 10',
      tshirt: 'XS, S, M, L, XL',
    });
  });

  it('keeps ? and coffee in every deck but never as a sized card', () => {
    for (const scale of SCALES) {
      expect(isCardOf(scale, '?')).toBe(true);
      expect(isCardOf(scale, 'coffee')).toBe(true);
      expect(isEstimateOf(scale, '?')).toBe(false);
      expect(isEstimateOf(scale, 'coffee')).toBe(false);
    }
  });
});

describe('scaleSchema', () => {
  it.each(SCALES)('accepts %s', (scale) => {
    expect(scaleSchema.safeParse(scale).success).toBe(true);
  });

  it.each([
    'Fibonacci',
    'FIBONACCI',
    't-shirt',
    'tshirts',
    '',
    ' fibonacci',
    null,
    undefined,
    1,
    true,
    {},
    [],
  ])('rejects %j', (value) => {
    expect(scaleSchema.safeParse(value).success).toBe(false);
  });

  it('has a fixed INVALID_SCALE message', () => {
    expect(ERROR_MESSAGES.INVALID_SCALE).toBe('Choose Fibonacci, incremental or t-shirt sizes.');
  });
});

describe('cards of one scale', () => {
  it.each<[Scale, unknown[], unknown[]]>([
    ['fibonacci', [1, 13, 21, '?', 'coffee'], [0, 4, 10, 'M', '5', 5.5, -1, 'xs', '']],
    ['incremental', [1, 4, 10, '?', 'coffee'], [0, 11, 13, 21, 'M', '5', 5.5, -1]],
    ['tshirt', ['XS', 'XL', '?', 'coffee'], [0, 5, 'xs', 'XXL', 'm', ' M', 'Medium', '5']],
  ])('%s accepts its cards and rejects the others', (scale, accepted, rejected) => {
    const schema = cardSchemaFor(scale);
    accepted.forEach((card) =>
      expect(schema.safeParse(card).success, `${scale} ${String(card)}`).toBe(true),
    );
    rejected.forEach((card) =>
      expect(schema.safeParse(card).success, `${scale} ${String(card)}`).toBe(false),
    );
  });

  it.each<[Scale, unknown[], unknown[]]>([
    ['fibonacci', [1, 21], ['?', 'coffee', 0, 4, 'M']],
    ['incremental', [1, 4, 10], ['?', 'coffee', 0, 11, 'M']],
    ['tshirt', ['XS', 'M', 'XL'], ['?', 'coffee', 5, 'XXL']],
  ])('%s estimates are only its sized cards', (scale, accepted, rejected) => {
    const schema = estimateSchemaFor(scale);
    accepted.forEach((card) => expect(schema.safeParse(card).success).toBe(true));
    rejected.forEach((card) => expect(schema.safeParse(card).success).toBe(false));
  });

  it('accepts a card of any scale on the wire and rejects what is in no scale', () => {
    for (const card of [1, 4, 10, 21, 'XS', 'XL', '?', 'coffee']) {
      expect(cardSchema.safeParse(card).success).toBe(true);
    }
    for (const card of ['5', 11, 'xl', 'XXL', -1, null, undefined, {}]) {
      expect(cardSchema.safeParse(card).success).toBe(false);
    }
  });

  it('accepts a size or a number as a client final estimate payload', () => {
    expect(roundFinishPayloadSchema.safeParse({ finalEstimate: 'M' }).success).toBe(true);
    expect(roundFinishPayloadSchema.safeParse({ finalEstimate: 7 }).success).toBe(true);
    expect(roundFinishPayloadSchema.safeParse({ finalEstimate: '?' }).success).toBe(false);
  });
});

describe('publicGameStateSchema and the scale', () => {
  const base = (overrides: object) => ({
    gameId: GAME_ID,
    scale: 'fibonacci',
    phase: 'waiting',
    story: null,
    facilitator: { name: 'Sven', connected: true },
    voters: [],
    history: [],
    total: 0,
    ...overrides,
  });
  const stats = (suggestedEstimate: unknown, median: unknown) => ({
    distribution: [{ card: 'M', count: 1 }],
    average: null,
    median,
    consensus: false,
    outlierIds: [],
    suggestedEstimate,
  });

  it.each(SCALES)('accepts a %s state', (scale) => {
    const state = base({ scale, total: scale === 'tshirt' ? null : 0 });

    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
  });

  it('requires the scale', () => {
    expect(publicGameStateSchema.safeParse(base({ scale: undefined })).success).toBe(false);
    expect(publicGameStateSchema.safeParse(base({ scale: 'huge' })).success).toBe(false);
  });

  it('accepts a revealed t-shirt state with sizes, a median and no average', () => {
    const state = base({
      scale: 'tshirt',
      total: null,
      phase: 'revealed',
      story: { title: 'T' },
      voters: [{ id: 'a', name: 'Anna', connected: true, hasVoted: true, card: 'M' }],
      results: stats('M', 'M'),
    });

    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
  });

  it.each([
    ['a size in a Fibonacci session', { scale: 'fibonacci', card: 'M' }],
    ['a 4 in a Fibonacci session', { scale: 'fibonacci', card: 4 }],
    ['a number in a t-shirt session', { scale: 'tshirt', card: 5 }],
    ['an 11 in an incremental session', { scale: 'incremental', card: 11 }],
  ])('rejects %s', (_label, { scale, card }) => {
    const state = base({
      scale,
      total: scale === 'tshirt' ? null : 0,
      phase: 'revealed',
      story: { title: 'T' },
      voters: [{ id: 'a', name: 'Anna', connected: true, hasVoted: true, card }],
      results: stats(null, null),
    });

    expect(publicGameStateSchema.safeParse(state).success).toBe(false);
  });

  it.each([
    [
      'a size estimate in a Fibonacci history',
      {
        scale: 'fibonacci',
        total: 0,
        history: [{ title: 'A', url: 'https://example.com/story', estimate: 'M' }],
      },
    ],
    [
      'a number estimate in a t-shirt history',
      {
        scale: 'tshirt',
        total: null,
        history: [{ title: 'A', url: 'https://example.com/story', estimate: 5 }],
      },
    ],
    [
      '? as an estimate',
      {
        scale: 'fibonacci',
        total: 0,
        history: [{ title: 'A', url: 'https://example.com/story', estimate: '?' }],
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(publicGameStateSchema.safeParse(base(overrides)).success).toBe(false);
  });

  it('accepts sizes and skipped stories in a t-shirt history', () => {
    const state = base({
      scale: 'tshirt',
      total: null,
      history: [
        { title: 'A', url: 'https://example.com/story', estimate: 'M' },
        { title: 'B', url: 'https://example.com/story', estimate: 'skipped' },
      ],
    });

    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
  });

  it('ties the total to the scale: null exactly for t-shirt', () => {
    expect(publicGameStateSchema.safeParse(base({ scale: 'tshirt', total: 0 })).success).toBe(
      false,
    );
    expect(publicGameStateSchema.safeParse(base({ scale: 'fibonacci', total: null })).success).toBe(
      false,
    );
    expect(
      publicGameStateSchema.safeParse(base({ scale: 'incremental', total: null })).success,
    ).toBe(false);
  });

  it.each([
    [
      'a size in the Fibonacci distribution',
      { scale: 'fibonacci', distribution: [{ card: 'M', count: 1 }], median: 5, suggested: 5 },
    ],
    [
      'a size as the Fibonacci median',
      { scale: 'fibonacci', distribution: [{ card: 5, count: 1 }], median: 'XL', suggested: 5 },
    ],
    [
      'a number as the t-shirt proposal',
      { scale: 'tshirt', distribution: [{ card: 'M', count: 1 }], median: 'M', suggested: 5 },
    ],
    [
      '? as the median',
      { scale: 'incremental', distribution: [{ card: 5, count: 1 }], median: '?', suggested: 5 },
    ],
    [
      'an 11 in the incremental distribution',
      { scale: 'incremental', distribution: [{ card: 11, count: 1 }], median: 5, suggested: 5 },
    ],
  ])('rejects %s in the results', (_label, { scale, distribution, median, suggested }) => {
    const state = base({
      scale,
      total: scale === 'tshirt' ? null : 0,
      phase: 'revealed',
      story: { title: 'T' },
      results: {
        distribution,
        average: null,
        median,
        consensus: false,
        outlierIds: [],
        suggestedEstimate: suggested,
      },
    });

    expect(publicGameStateSchema.safeParse(state).success).toBe(false);
  });
});
