import { describe, expect, it } from 'vitest';
import { hashToken } from '../store/gameStore.js';
import { aGame, aNewPlayer } from '../testing/builders.js';
import {
  addVoter,
  castVote,
  connectSocket,
  findPlayerByTokenHash,
  isBanned,
  removePlayer,
  revealRound,
  setStory,
  toPublicState,
  transferFacilitator,
  type Game,
} from './game.js';

const FACILITATOR = 'f1';

function aTable(): Game {
  const game = aGame({ id: FACILITATOR, name: 'Fran', token: 'fran-token' });
  addVoter(game, aNewPlayer({ id: 'anna', name: 'Anna', token: 'anna-token' }));
  addVoter(game, aNewPlayer({ id: 'bob', name: 'Bob', token: 'bob-token' }));
  for (const id of [FACILITATOR, 'anna', 'bob']) {
    connectSocket(game.players.get(id)!, `socket-${id}`);
  }
  setStory(game, FACILITATOR, { title: 'Login page', url: 'https://example.com/story' });
  return game;
}

describe('transferFacilitator', () => {
  it('swaps the roles and reports who is who', () => {
    const game = aTable();

    expect(transferFacilitator(game, FACILITATOR, 'anna')).toEqual({
      ok: true,
      previousId: FACILITATOR,
      newId: 'anna',
    });

    expect(game.players.get('anna')?.role).toBe('facilitator');
    expect(game.players.get(FACILITATOR)?.role).toBe('voter');
    expect(game.facilitatorId).toBe('anna');
    const state = toPublicState(game);
    expect(state.facilitator.name).toBe('Anna');
    expect(state.voters.map((v) => v.name)).toEqual(['Fran', 'Bob']);
  });

  it('keeps the phase, the story and the votes of everyone else', () => {
    const game = aTable();
    castVote(game, 'bob', 8);

    transferFacilitator(game, FACILITATOR, 'anna');

    expect(game.phase).toBe('voting');
    expect(game.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
    expect(game.votes.get('bob')).toBe(8);
    expect(game.votes.has(FACILITATOR)).toBe(false);
  });

  it('discards the new facilitator vote and recalculates revealed results without it', () => {
    const game = aTable();
    castVote(game, 'anna', 3);
    castVote(game, 'bob', 8);
    revealRound(game, FACILITATOR);

    transferFacilitator(game, FACILITATOR, 'anna');

    expect(game.votes.has('anna')).toBe(false);
    const state = toPublicState(game);
    expect(state.phase).toBe('revealed');
    expect(state.results?.distribution).toEqual([{ card: 8, count: 1 }]);
    expect(state.voters.find((v) => v.name === 'Anna')?.card).toBeUndefined();
  });

  it('lets each token find its player with the role it has now', () => {
    const game = aTable();

    transferFacilitator(game, FACILITATOR, 'anna');

    expect(findPlayerByTokenHash(game, hashToken('fran-token'))?.role).toBe('voter');
    expect(findPlayerByTokenHash(game, hashToken('anna-token'))?.role).toBe('facilitator');
  });

  it('works both ways and the old facilitator can be handed the role back', () => {
    const game = aTable();

    transferFacilitator(game, FACILITATOR, 'anna');

    expect(transferFacilitator(game, 'anna', FACILITATOR)).toEqual({
      ok: true,
      previousId: 'anna',
      newId: FACILITATOR,
    });
    expect(game.facilitatorId).toBe(FACILITATOR);
  });

  it('rejects a voter with FORBIDDEN before looking at the target', () => {
    const game = aTable();

    expect(transferFacilitator(game, 'anna', 'bob')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(transferFacilitator(game, 'anna', 'nobody')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(transferFacilitator(game, 'ghost', 'bob')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(game.facilitatorId).toBe(FACILITATOR);
  });

  it.each([
    ['an unknown player', 'nobody'],
    ['themselves', FACILITATOR],
    ['a number', 7],
    ['nothing', undefined],
    ['null', null],
    ['an object', { id: 'anna' }],
  ])('rejects handing over to %s with INVALID_PAYLOAD', (_name, target) => {
    const game = aTable();

    expect(transferFacilitator(game, FACILITATOR, target)).toEqual({
      ok: false,
      code: 'INVALID_PAYLOAD',
    });
    expect(game.facilitatorId).toBe(FACILITATOR);
  });

  it('rejects an offline voter', () => {
    const game = aTable();
    game.players.get('anna')!.socketIds.clear();

    expect(transferFacilitator(game, FACILITATOR, 'anna')).toEqual({
      ok: false,
      code: 'INVALID_PAYLOAD',
    });
    expect(game.players.get('anna')?.role).toBe('voter');
  });

  it('rejects a removed voter and keeps the ban', () => {
    const game = aTable();
    removePlayer(game, FACILITATOR, 'anna');

    expect(transferFacilitator(game, FACILITATOR, 'anna')).toEqual({
      ok: false,
      code: 'INVALID_PAYLOAD',
    });
    expect(isBanned(game, hashToken('anna-token'))).toBe(true);
  });

  it('lets the new facilitator remove players and the old one no longer', () => {
    const game = aTable();
    transferFacilitator(game, FACILITATOR, 'anna');

    expect(removePlayer(game, FACILITATOR, 'bob')).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(removePlayer(game, 'anna', 'bob')).toEqual({ ok: true, removedId: 'bob' });
  });
});
