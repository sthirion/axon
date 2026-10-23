import { describe, expect, it } from 'vitest';
import { DECK } from '@axon/shared';
import { aGame, aNewPlayer } from '../testing/builders.js';
import { addVoter, castVote, getVote, setStory, toPublicState, type Game } from './game.js';

const FACILITATOR = 'f1';

function aGameWithVoters(): Game {
  const game = aGame({ id: FACILITATOR });
  addVoter(game, aNewPlayer({ id: 'anna', name: 'Anna' }));
  addVoter(game, aNewPlayer({ id: 'bob', name: 'Bob' }));
  return game;
}

function aVotingGame(): Game {
  const game = aGameWithVoters();
  setStory(game, FACILITATOR, { title: 'Login page' });
  return game;
}

describe('a new game', () => {
  it('is waiting with no story and no votes', () => {
    const game = aGame();

    expect(game.phase).toBe('waiting');
    expect(game.story).toBeUndefined();
    expect(game.votes.size).toBe(0);
  });
});

describe('setStory', () => {
  it('opens voting and stores the story', () => {
    const game = aGameWithVoters();

    const result = setStory(game, FACILITATOR, { title: ' Login page ', url: 'https://e.com/1' });

    expect(result).toEqual({ ok: true });
    expect(game.phase).toBe('voting');
    expect(game.story).toEqual({ title: 'Login page', url: 'https://e.com/1' });
  });

  it('stores no url when the link is blank', () => {
    const game = aGameWithVoters();

    setStory(game, FACILITATOR, { title: 'T', url: '  ' });

    expect(game.story).toStrictEqual({ title: 'T' });
  });

  it('replaces the story while voting, keeps the phase and removes a link that is not sent again', () => {
    const game = aVotingGame();
    setStory(game, FACILITATOR, { title: 'A', url: 'https://e.com/a' });

    const result = setStory(game, FACILITATOR, { title: 'B' });

    expect(result).toEqual({ ok: true });
    expect(game.phase).toBe('voting');
    expect(game.story).toStrictEqual({ title: 'B' });
  });

  it('keeps every vote when the story is edited', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 5);
    castVote(game, 'bob', '?');

    setStory(game, FACILITATOR, { title: 'Edited' });

    expect(getVote(game, 'anna')).toBe(5);
    expect(getVote(game, 'bob')).toBe('?');
  });

  it('rejects a voter with FORBIDDEN and changes nothing', () => {
    const game = aGameWithVoters();

    const result = setStory(game, 'anna', { title: 'Mine' });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(game.phase).toBe('waiting');
    expect(game.story).toBeUndefined();
  });

  it('rejects a voter with FORBIDDEN even for an invalid story (role before value)', () => {
    expect(setStory(aGameWithVoters(), 'anna', { title: '' })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('rejects an unknown player with FORBIDDEN', () => {
    expect(setStory(aGameWithVoters(), 'ghost', { title: 'T' })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it.each([
    ['an empty title', { title: '' }],
    ['a missing title', {}],
    ['an unsafe link', { title: 'T', url: 'javascript:alert(1)' }],
    ['a null link', { title: 'T', url: null }],
  ])('rejects %s with INVALID_STORY and stays waiting', (_label, input) => {
    const game = aGameWithVoters();

    expect(setStory(game, FACILITATOR, input)).toEqual({ ok: false, code: 'INVALID_STORY' });
    expect(game.phase).toBe('waiting');
    expect(game.story).toBeUndefined();
  });

  it('keeps the previous story and votes when an edit is invalid', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 5);

    const result = setStory(game, FACILITATOR, { title: '' });

    expect(result).toEqual({ ok: false, code: 'INVALID_STORY' });
    expect(game.story).toEqual({ title: 'Login page' });
    expect(getVote(game, 'anna')).toBe(5);
  });
});

describe('castVote', () => {
  it.each([...DECK])('stores card %j for the voter', (card) => {
    const game = aVotingGame();

    expect(castVote(game, 'anna', card)).toEqual({ ok: true });
    expect(getVote(game, 'anna')).toBe(card);
  });

  it('changes an existing vote', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 3);

    castVote(game, 'anna', 8);

    expect(getVote(game, 'anna')).toBe(8);
    expect(game.votes.size).toBe(1);
  });

  it('withdraws a vote with null', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 3);

    expect(castVote(game, 'anna', null)).toEqual({ ok: true });
    expect(getVote(game, 'anna')).toBeNull();
    expect(game.votes.has('anna')).toBe(false);
  });

  it('is idempotent when withdrawing without a vote', () => {
    const game = aVotingGame();

    expect(castVote(game, 'anna', null)).toEqual({ ok: true });
    expect(game.votes.size).toBe(0);
  });

  it('is idempotent when casting the same card again', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 5);

    expect(castVote(game, 'anna', 5)).toEqual({ ok: true });
    expect(getVote(game, 'anna')).toBe(5);
    expect(game.votes.size).toBe(1);
  });

  it('keeps votes of different voters apart', () => {
    const game = aVotingGame();

    castVote(game, 'anna', 5);
    castVote(game, 'bob', 13);

    expect(getVote(game, 'anna')).toBe(5);
    expect(getVote(game, 'bob')).toBe(13);
  });

  it.each([
    ['null', null],
    ['a card', 5],
    ['an invalid card', 4],
  ])('rejects the facilitator with FORBIDDEN for %s and stores nothing', (_label, input) => {
    const game = aVotingGame();

    expect(castVote(game, FACILITATOR, input)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(game.votes.size).toBe(0);
  });

  it('rejects an unknown player with FORBIDDEN', () => {
    expect(castVote(aVotingGame(), 'ghost', 5)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it.each([
    ['a card', 5],
    ['null', null],
    ['an invalid card', 4],
  ])('rejects %s while waiting with WRONG_PHASE', (_label, input) => {
    const game = aGameWithVoters();

    expect(castVote(game, 'anna', input)).toEqual({ ok: false, code: 'WRONG_PHASE' });
    expect(game.votes.size).toBe(0);
  });

  it.each([4, '5', 5.5, -1, 'Coffee', '☕', '', true, {}, [], undefined])(
    'rejects %j with INVALID_CARD and keeps the previous vote',
    (input) => {
      const game = aVotingGame();
      castVote(game, 'anna', 3);

      expect(castVote(game, 'anna', input)).toEqual({ ok: false, code: 'INVALID_CARD' });
      expect(getVote(game, 'anna')).toBe(3);
    },
  );
});

describe('votes and connections', () => {
  it('survive the voter going offline and rejoining', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 8);
    const anna = game.players.get('anna')!;
    anna.socketIds.add('s1');
    anna.socketIds.delete('s1');
    anna.socketIds.add('s2');

    expect(getVote(game, 'anna')).toBe(8);
    expect(toPublicState(game).voters[0]).toMatchObject({ connected: true, hasVoted: true });
  });
});

describe('getVote', () => {
  it('returns null for a voter who has not voted', () => {
    expect(getVote(aVotingGame(), 'anna')).toBeNull();
  });
});

describe('toPublicState with story and votes', () => {
  it('is waiting with a null story and nobody voted', () => {
    const state = toPublicState(aGameWithVoters());

    expect(state.phase).toBe('waiting');
    expect(state.story).toBeNull();
    expect(state.voters.map((voter) => voter.hasVoted)).toEqual([false, false]);
  });

  it('is voting with the story and omits the url when there is no link', () => {
    const game = aVotingGame();

    const state = toPublicState(game);

    expect(state.phase).toBe('voting');
    expect(state.story).toStrictEqual({ title: 'Login page' });
  });

  it('includes the url when there is a link', () => {
    const game = aGameWithVoters();
    setStory(game, FACILITATOR, { title: 'T', url: 'https://e.com/1' });

    expect(toPublicState(game).story).toEqual({ title: 'T', url: 'https://e.com/1' });
  });

  it('derives hasVoted per voter and clears it on withdraw', () => {
    const game = aVotingGame();
    castVote(game, 'anna', 5);

    expect(toPublicState(game).voters.map((voter) => voter.hasVoted)).toEqual([true, false]);

    castVote(game, 'anna', null);

    expect(toPublicState(game).voters.map((voter) => voter.hasVoted)).toEqual([false, false]);
  });

  it('returns a copy of the story so callers cannot change the game', () => {
    const game = aVotingGame();

    (toPublicState(game).story as { title: string }).title = 'Hacked';

    expect(game.story?.title).toBe('Login page');
  });

  it.each([...DECK])('never contains a card key or the value of card %j', (card) => {
    const game = aVotingGame();
    castVote(game, 'anna', card);
    castVote(game, 'bob', card);

    const state = toPublicState(game);

    expect(Object.keys(state).sort()).toEqual([
      'facilitator',
      'gameId',
      'phase',
      'story',
      'voters',
    ]);
    expect(state.voters.map((voter) => Object.keys(voter).sort())).toEqual([
      ['connected', 'hasVoted', 'id', 'name'],
      ['connected', 'hasVoted', 'id', 'name'],
    ]);
    expect(JSON.stringify(state)).not.toMatch(/"(card|vote|votes|value)"/);
    expect(Object.values(state.voters[0]!)).not.toContain(card);
  });
});
