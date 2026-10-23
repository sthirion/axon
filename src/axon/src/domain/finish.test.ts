import { describe, expect, it } from 'vitest';
import { aGame, aNewPlayer } from '../testing/builders.js';
import {
  addVoter,
  castVote,
  finishRound,
  getVote,
  revealRound,
  revoteRound,
  setStory,
  toPublicState,
  type Game,
} from './game.js';

const FACILITATOR = 'f1';

function aVotingGame(): Game {
  const game = aGame({ id: FACILITATOR });
  addVoter(game, aNewPlayer({ id: 'anna', name: 'Anna' }));
  addVoter(game, aNewPlayer({ id: 'bob', name: 'Bob' }));
  setStory(game, FACILITATOR, { title: 'Login page', url: 'https://e.com/1' });
  return game;
}

function aRevealedGame(): Game {
  const game = aVotingGame();
  castVote(game, 'anna', 3);
  castVote(game, 'bob', 8);
  revealRound(game, FACILITATOR);
  return game;
}

describe('revoteRound', () => {
  it('clears every vote, hides votes again and keeps the story and history', () => {
    const game = aRevealedGame();

    expect(revoteRound(game, FACILITATOR)).toEqual({ ok: true });

    expect(game.phase).toBe('voting');
    expect(game.votes.size).toBe(0);
    expect(game.story).toEqual({ title: 'Login page', url: 'https://e.com/1' });
    const state = toPublicState(game);
    expect(state.results).toBeUndefined();
    expect(state.voters.every((v) => !v.hasVoted && !('card' in v))).toBe(true);
  });

  it('lets voters vote and the facilitator reveal again afterwards', () => {
    const game = aRevealedGame();
    revoteRound(game, FACILITATOR);

    expect(castVote(game, 'anna', 5)).toEqual({ ok: true });
    expect(revealRound(game, FACILITATOR)).toEqual({ ok: true });
    expect(getVote(game, 'bob')).toBeNull();
  });

  it('rejects a voter and an unknown player with FORBIDDEN, before the phase check', () => {
    const game = aVotingGame();

    expect(revoteRound(game, 'anna')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(revoteRound(game, 'ghost')).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it.each(['waiting', 'voting'] as const)(
    'rejects a re-vote while %s with WRONG_PHASE',
    (phase) => {
      const game = phase === 'voting' ? aVotingGame() : aGame({ id: FACILITATOR });
      castVote(game, 'anna', 3);

      expect(revoteRound(game, FACILITATOR)).toEqual({ ok: false, code: 'WRONG_PHASE' });
      expect(game.phase).toBe(phase);
    },
  );
});

describe('finishRound with a final estimate', () => {
  it.each([1, 2, 3, 5, 8, 13, 21])('records %d and returns to waiting', (finalEstimate) => {
    const game = aRevealedGame();

    expect(finishRound(game, FACILITATOR, { finalEstimate })).toEqual({ ok: true });

    expect(game.phase).toBe('waiting');
    expect(game.story).toBeUndefined();
    expect(game.votes.size).toBe(0);
    expect(game.history).toEqual([
      { title: 'Login page', url: 'https://e.com/1', estimate: finalEstimate },
    ]);
  });

  it.each([
    ['?', '?'],
    ['coffee', 'coffee'],
    ['4', 4],
    ['a string number', '5'],
    ['5.5', 5.5],
    ['-1', -1],
    ['null', null],
    ['true', true],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s with INVALID_CARD and changes nothing', (_label, finalEstimate) => {
    const game = aRevealedGame();

    expect(finishRound(game, FACILITATOR, { finalEstimate })).toEqual({
      ok: false,
      code: 'INVALID_CARD',
    });
    expect(game.phase).toBe('revealed');
    expect(game.history).toEqual([]);
    expect(game.votes.size).toBe(2);
  });

  it.each(['waiting', 'voting'] as const)(
    'rejects an estimate while %s with WRONG_PHASE',
    (phase) => {
      const game = phase === 'voting' ? aVotingGame() : aGame({ id: FACILITATOR });

      expect(finishRound(game, FACILITATOR, { finalEstimate: 5 })).toEqual({
        ok: false,
        code: 'WRONG_PHASE',
      });
      expect(game.history).toEqual([]);
    },
  );

  it('checks phase before value', () => {
    expect(finishRound(aVotingGame(), FACILITATOR, { finalEstimate: 'coffee' })).toEqual({
      ok: false,
      code: 'WRONG_PHASE',
    });
  });

  it('rejects a second finish with WRONG_PHASE', () => {
    const game = aRevealedGame();
    finishRound(game, FACILITATOR, { finalEstimate: 5 });

    expect(finishRound(game, FACILITATOR, { finalEstimate: 5 })).toEqual({
      ok: false,
      code: 'WRONG_PHASE',
    });
    expect(game.history).toHaveLength(1);
  });

  it('rejects a voter with FORBIDDEN, even with an invalid estimate', () => {
    const game = aRevealedGame();

    expect(finishRound(game, 'anna', { finalEstimate: 'coffee' })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(finishRound(game, 'anna', { skip: true })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(game.phase).toBe('revealed');
  });
});

describe('finishRound with skip', () => {
  it.each(['voting', 'revealed'] as const)('skips from %s as "skipped"', (phase) => {
    const game = phase === 'voting' ? aVotingGame() : aRevealedGame();

    expect(finishRound(game, FACILITATOR, { skip: true })).toEqual({ ok: true });

    expect(game.phase).toBe('waiting');
    expect(game.history).toEqual([
      { title: 'Login page', url: 'https://e.com/1', estimate: 'skipped' },
    ]);
    expect(game.votes.size).toBe(0);
  });

  it('rejects a skip while waiting with WRONG_PHASE', () => {
    const game = aGame({ id: FACILITATOR });

    expect(finishRound(game, FACILITATOR, { skip: true })).toEqual({
      ok: false,
      code: 'WRONG_PHASE',
    });
    expect(game.history).toEqual([]);
  });
});

describe('the next round and the public state', () => {
  it('starts the next story with no votes, no cards and no results', () => {
    const game = aRevealedGame();
    finishRound(game, FACILITATOR, { finalEstimate: 5 });

    setStory(game, FACILITATOR, { title: 'Checkout', url: 'https://example.com/story' });

    const state = toPublicState(game);
    expect(state.phase).toBe('voting');
    expect(state.voters.every((v) => !v.hasVoted)).toBe(true);
    expect(state.results).toBeUndefined();
  });

  it('lists the history oldest first with a story without a link as-is, and totals numbers only', () => {
    const game = aRevealedGame();
    finishRound(game, FACILITATOR, { finalEstimate: 5 });
    setStory(game, FACILITATOR, { title: 'Checkout', url: 'https://example.com/story' });
    finishRound(game, FACILITATOR, { skip: true });
    setStory(game, FACILITATOR, { title: 'Search', url: 'https://example.com/story' });
    castVote(game, 'anna', 8);
    revealRound(game, FACILITATOR);
    finishRound(game, FACILITATOR, { finalEstimate: 8 });

    const state = toPublicState(game);

    expect(state.history).toEqual([
      { title: 'Login page', url: 'https://e.com/1', estimate: 5 },
      { title: 'Checkout', url: 'https://example.com/story', estimate: 'skipped' },
      { title: 'Search', url: 'https://example.com/story', estimate: 8 },
    ]);
    expect(state.total).toBe(13);
    expect(state.story).toBeNull();
  });

  it('has an empty history and a total of 0 for a new game', () => {
    const state = toPublicState(aGame());

    expect(state.history).toEqual([]);
    expect(state.total).toBe(0);
  });

  it('exposes copies, so changing the state never changes the game history', () => {
    const game = aRevealedGame();
    finishRound(game, FACILITATOR, { finalEstimate: 5 });

    const state = toPublicState(game);
    (state.history[0] as { title: string }).title = 'Hacked';

    expect(game.history[0]?.title).toBe('Login page');
  });
});
