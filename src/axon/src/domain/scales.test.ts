import { describe, expect, it } from 'vitest';
import { SCALES, deckOf, estimateCardsOf, type Card, type Scale } from '@axon/shared';
import { aNewPlayer } from '../testing/builders.js';
import {
  addVoter,
  castVote,
  createGame,
  finishRound,
  revealRound,
  setStory,
  toPublicState,
  type Game,
} from './game.js';

const FACILITATOR = 'f1';

function aVotingGame(scale?: Scale): Game {
  const game = createGame('G'.repeat(22), aNewPlayer({ id: FACILITATOR, name: 'Fran' }), 0, scale);
  addVoter(game, aNewPlayer({ id: 'anna', name: 'Anna' }));
  addVoter(game, aNewPlayer({ id: 'bob', name: 'Bob' }));
  setStory(game, FACILITATOR, { title: 'Login page' });
  return game;
}

describe('a new game and its scale', () => {
  it('defaults to Fibonacci and keeps the scale it was created with', () => {
    expect(aVotingGame().scale).toBe('fibonacci');
    for (const scale of SCALES) {
      expect(aVotingGame(scale).scale).toBe(scale);
    }
  });

  it('puts the scale in the public state from the start', () => {
    for (const scale of SCALES) {
      expect(toPublicState(aVotingGame(scale)).scale).toBe(scale);
    }
  });
});

describe('castVote per scale', () => {
  it.each(SCALES.flatMap((scale) => deckOf(scale).map((card) => [scale, card] as const)))(
    '%s accepts its card %j',
    (scale, card) => {
      const game = aVotingGame(scale);

      expect(castVote(game, 'anna', card)).toEqual({ ok: true });
      expect(game.votes.get('anna')).toBe(card);
    },
  );

  it.each<[Scale, Card[]]>([
    ['fibonacci', ['M', 'XS', 4, 10] as Card[]],
    ['incremental', ['M', 11, 13, 21] as Card[]],
    ['tshirt', [0, 5, 13, 'XXL', 'm'] as Card[]],
  ])('%s rejects cards of other scales with INVALID_CARD and keeps the vote', (scale, foreign) => {
    const game = aVotingGame(scale);
    castVote(game, 'anna', '?');

    for (const card of foreign) {
      expect(castVote(game, 'anna', card), String(card)).toEqual({
        ok: false,
        code: 'INVALID_CARD',
      });
    }
    expect(game.votes.get('anna')).toBe('?');
  });

  it.each(SCALES)('%s lets a voter withdraw', (scale) => {
    const game = aVotingGame(scale);
    castVote(game, 'anna', deckOf(scale)[0] as Card);

    expect(castVote(game, 'anna', null)).toEqual({ ok: true });
    expect(game.votes.has('anna')).toBe(false);
  });
});

describe('finishRound per scale', () => {
  const reveal = (game: Game) => {
    castVote(game, 'anna', estimateCardsOf(game.scale)[1] as Card);
    revealRound(game, FACILITATOR);
  };

  it.each(SCALES.flatMap((scale) => estimateCardsOf(scale).map((card) => [scale, card] as const)))(
    '%s records its sized card %j',
    (scale, card) => {
      const game = aVotingGame(scale);
      reveal(game);

      expect(finishRound(game, FACILITATOR, { finalEstimate: card })).toEqual({ ok: true });
      expect(game.history).toEqual([{ title: 'Login page', estimate: card }]);
    },
  );

  it.each<[Scale, unknown[]]>([
    ['fibonacci', ['?', 'coffee', 4, 'M', 10]],
    ['incremental', ['?', 'coffee', 11, 'M', 21]],
    ['tshirt', ['?', 'coffee', 0, 5, 'XXL', 'm']],
  ])('%s rejects everything else with INVALID_CARD and records nothing', (scale, bad) => {
    const game = aVotingGame(scale);
    reveal(game);

    for (const finalEstimate of bad) {
      expect(finishRound(game, FACILITATOR, { finalEstimate }), String(finalEstimate)).toEqual({
        ok: false,
        code: 'INVALID_CARD',
      });
    }
    expect(game.history).toEqual([]);
    expect(game.phase).toBe('revealed');
  });

  it.each(SCALES)('%s can skip', (scale) => {
    const game = aVotingGame(scale);

    expect(finishRound(game, FACILITATOR, { skip: true })).toEqual({ ok: true });
    expect(game.history[0]?.estimate).toBe('skipped');
  });
});

describe('toPublicState totals per scale', () => {
  function played(scale: Scale, estimates: Array<Card | 'skip'>): Game {
    const game = aVotingGame(scale);
    estimates.forEach((estimate, i) => {
      if (i > 0) setStory(game, FACILITATOR, { title: `Story ${i + 1}` });
      if (estimate === 'skip') {
        finishRound(game, FACILITATOR, { skip: true });
        return;
      }
      castVote(game, 'anna', estimate);
      revealRound(game, FACILITATOR);
      finishRound(game, FACILITATOR, { finalEstimate: estimate });
    });
    return game;
  }

  it.each<[Scale, Array<Card | 'skip'>, number]>([
    ['fibonacci', [5, 'skip', 8], 13],
    ['incremental', [4, 10, 'skip', 1], 15],
    ['fibonacci', [], 0],
    ['incremental', ['skip'], 0],
  ])('adds up the numbers of a %s session (%j)', (scale, estimates, total) => {
    expect(toPublicState(played(scale, estimates)).total).toBe(total);
  });

  it('has no total for a t-shirt session, even with estimates', () => {
    const state = toPublicState(played('tshirt', ['M', 'skip', 'XL']));

    expect(state.total).toBeNull();
    expect(state.history.map((entry) => entry.estimate)).toEqual(['M', 'skipped', 'XL']);
  });

  it('shows revealed cards and results in the scale of the game', () => {
    const game = aVotingGame('tshirt');
    castVote(game, 'anna', 'S');
    castVote(game, 'bob', 'XL');
    revealRound(game, FACILITATOR);

    const state = toPublicState(game);

    expect(state.voters.map((v) => v.card)).toEqual(['S', 'XL']);
    expect(state.results).toMatchObject({ average: null, median: 'XL', suggestedEstimate: 'XL' });
  });
});
