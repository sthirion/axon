import { describe, expect, it } from 'vitest';
import { aGame, aNewPlayer } from '../testing/builders.js';
import { hashToken } from '../store/gameStore.js';
import {
  addVoter,
  castVote,
  isBanned,
  isNameTaken,
  removePlayer,
  revealRound,
  setStory,
  toPublicState,
  type Game,
} from './game.js';

const FACILITATOR = 'f1';

function aTable(): Game {
  const game = aGame({ id: FACILITATOR, name: 'Fran' });
  addVoter(game, aNewPlayer({ id: 'anna', name: 'Anna', token: 'anna-token' }));
  addVoter(game, aNewPlayer({ id: 'bob', name: 'Bob', token: 'bob-token' }));
  setStory(game, FACILITATOR, { title: 'Login page' });
  return game;
}

describe('removePlayer', () => {
  it('removes the voter, discards their vote and keeps everyone else', () => {
    const game = aTable();
    castVote(game, 'anna', 5);
    castVote(game, 'bob', 8);

    expect(removePlayer(game, FACILITATOR, 'anna')).toEqual({ ok: true, removedId: 'anna' });

    expect(game.players.has('anna')).toBe(false);
    expect(game.votes.has('anna')).toBe(false);
    expect(game.votes.get('bob')).toBe(8);
    expect(toPublicState(game).voters.map((v) => v.name)).toEqual(['Bob']);
    expect(game.phase).toBe('voting');
  });

  it('bans only that voter token and frees the name', () => {
    const game = aTable();

    removePlayer(game, FACILITATOR, 'anna');

    expect(isBanned(game, hashToken('anna-token'))).toBe(true);
    expect(isBanned(game, hashToken('bob-token'))).toBe(false);
    expect(isNameTaken(game, 'Anna')).toBe(false);
  });

  it('recalculates the results without the removed vote when revealed', () => {
    const game = aTable();
    castVote(game, 'anna', 3);
    castVote(game, 'bob', 8);
    revealRound(game, FACILITATOR);

    removePlayer(game, FACILITATOR, 'bob');

    const state = toPublicState(game);
    expect(state.phase).toBe('revealed');
    expect(state.results).toMatchObject({ average: 3, distribution: [{ card: 3, count: 1 }] });
    expect(state.voters).toEqual([
      { id: 'anna', name: 'Anna', connected: false, hasVoted: true, card: 3 },
    ]);
  });

  it('leaves an empty distribution when the only voter who voted is removed after the reveal', () => {
    const game = aTable();
    castVote(game, 'anna', 3);
    revealRound(game, FACILITATOR);

    removePlayer(game, FACILITATOR, 'anna');

    expect(toPublicState(game).results).toMatchObject({
      distribution: [],
      average: null,
      suggestedEstimate: null,
    });
  });

  it.each(['waiting', 'voting', 'revealed'] as const)('works in the %s phase', (phase) => {
    const game = aGame({ id: FACILITATOR });
    addVoter(game, aNewPlayer({ id: 'anna', name: 'Anna' }));
    if (phase !== 'waiting') setStory(game, FACILITATOR, { title: 'T' });
    if (phase === 'revealed') {
      castVote(game, 'anna', 5);
      revealRound(game, FACILITATOR);
    }

    expect(removePlayer(game, FACILITATOR, 'anna')).toEqual({ ok: true, removedId: 'anna' });
    expect(game.phase).toBe(phase);
  });

  it('rejects a voter and an unknown player with FORBIDDEN, even for a bad target', () => {
    const game = aTable();

    expect(removePlayer(game, 'bob', 'anna')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(removePlayer(game, 'bob', undefined)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(removePlayer(game, 'ghost', 'anna')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(game.players.has('anna')).toBe(true);
    expect(game.bannedTokenHashes.size).toBe(0);
  });

  it.each([
    ['a missing id', undefined],
    ['null', null],
    ['a number', 5],
    ['an object', {}],
    ['an unknown id', 'ghost'],
    ['the facilitator', FACILITATOR],
  ])('rejects %s with INVALID_PAYLOAD and changes nothing', (_label, target) => {
    const game = aTable();
    castVote(game, 'anna', 5);

    expect(removePlayer(game, FACILITATOR, target)).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });

    expect(game.players.size).toBe(3);
    expect(game.votes.size).toBe(1);
    expect(game.bannedTokenHashes.size).toBe(0);
  });

  it('rejects removing the same voter twice', () => {
    const game = aTable();
    removePlayer(game, FACILITATOR, 'anna');

    expect(removePlayer(game, FACILITATOR, 'anna')).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(game.bannedTokenHashes.size).toBe(1);
  });
});
