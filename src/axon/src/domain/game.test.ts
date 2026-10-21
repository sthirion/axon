import { describe, expect, it } from 'vitest';
import { aGame, aNewPlayer } from '../testing/builders.js';
import { hashToken } from '../store/gameStore.js';
import {
  addVoter,
  connectSocket,
  disconnectSocket,
  findPlayerByTokenHash,
  isConnected,
  isNameTaken,
  toPublicState,
} from './game.js';

describe('createGame', () => {
  it('makes the creator the facilitator', () => {
    const game = aGame({ id: 'f1', name: 'Sven' });

    expect(game.players.get(game.facilitatorId)).toMatchObject({ id: 'f1', role: 'facilitator' });
  });

  it('starts with the facilitator offline', () => {
    const game = aGame();

    expect(isConnected(game.players.get(game.facilitatorId)!)).toBe(false);
  });
});

describe('addVoter', () => {
  it('adds a voter with the voter role', () => {
    const game = aGame();

    const result = addVoter(game, aNewPlayer({ id: 'v1', name: 'Anna' }));

    expect(result).toMatchObject({ ok: true, player: { id: 'v1', role: 'voter', name: 'Anna' } });
  });

  it('stores the voter in the game', () => {
    const game = aGame();

    addVoter(game, aNewPlayer({ id: 'v1', name: 'Anna' }));

    expect(game.players.has('v1')).toBe(true);
  });

  it('rejects a name used by another voter ignoring case', () => {
    const game = aGame();
    addVoter(game, aNewPlayer({ name: 'Anna' }));

    const result = addVoter(game, aNewPlayer({ name: 'ANNA' }));

    expect(result).toEqual({ ok: false, code: 'NAME_TAKEN' });
  });

  it('rejects the facilitator name ignoring case', () => {
    const game = aGame({ name: 'Sven' });

    const result = addVoter(game, aNewPlayer({ name: 'sven' }));

    expect(result).toEqual({ ok: false, code: 'NAME_TAKEN' });
  });

  it('rejects a name that differs only by Unicode normalization', () => {
    const game = aGame({ name: 'Caf\u00e9' });

    const result = addVoter(game, aNewPlayer({ name: 'Cafe\u0301' }));

    expect(result).toEqual({ ok: false, code: 'NAME_TAKEN' });
  });

  it('does not add the player when the name is taken', () => {
    const game = aGame({ name: 'Sven' });

    addVoter(game, aNewPlayer({ name: 'sven' }));

    expect(game.players.size).toBe(1);
  });

  it("keeps an offline player's name reserved", () => {
    const game = aGame();
    addVoter(game, aNewPlayer({ name: 'Anna' }));

    expect(isNameTaken(game, 'anna')).toBe(true);
  });

  it('allows a different name', () => {
    const game = aGame({ name: 'Sven' });

    expect(isNameTaken(game, 'Anna')).toBe(false);
  });
});

describe('findPlayerByTokenHash', () => {
  it('finds the player with the matching token', () => {
    const game = aGame();
    addVoter(game, aNewPlayer({ id: 'v1', name: 'Anna', token: 'anna-token' }));

    expect(findPlayerByTokenHash(game, hashToken('anna-token'))?.id).toBe('v1');
  });

  it('finds the facilitator by their token', () => {
    const game = aGame({ id: 'f1', token: 'facilitator-token' });

    expect(findPlayerByTokenHash(game, hashToken('facilitator-token'))?.role).toBe('facilitator');
  });

  it('returns undefined for a wrong token of the same length', () => {
    const game = aGame({ token: 'aaaaaaaa' });

    expect(findPlayerByTokenHash(game, hashToken('aaaaaaab'))).toBeUndefined();
  });

  it('returns undefined for a hash of the wrong length', () => {
    const game = aGame();

    expect(findPlayerByTokenHash(game, Buffer.from('short'))).toBeUndefined();
  });

  it('does not find a token that belongs to another game', () => {
    const gameA = aGame();
    const gameB = aGame();
    addVoter(gameA, aNewPlayer({ name: 'Anna', token: 'anna-token' }));

    expect(findPlayerByTokenHash(gameB, hashToken('anna-token'))).toBeUndefined();
  });
});

describe('connected state', () => {
  it('is connected after a socket joins', () => {
    const game = aGame();
    const player = game.players.get(game.facilitatorId)!;

    connectSocket(player, 's1');

    expect(isConnected(player)).toBe(true);
  });

  it('stays connected while another socket remains', () => {
    const game = aGame();
    const player = game.players.get(game.facilitatorId)!;
    connectSocket(player, 's1');
    connectSocket(player, 's2');

    const wentOffline = disconnectSocket(player, 's1');

    expect(wentOffline).toBe(false);
    expect(isConnected(player)).toBe(true);
  });

  it('goes offline when the last socket leaves', () => {
    const game = aGame();
    const player = game.players.get(game.facilitatorId)!;
    connectSocket(player, 's1');

    const wentOffline = disconnectSocket(player, 's1');

    expect(wentOffline).toBe(true);
    expect(isConnected(player)).toBe(false);
  });

  it('reports no change for a socket that was never attached', () => {
    const game = aGame();
    const player = game.players.get(game.facilitatorId)!;

    expect(disconnectSocket(player, 'unknown')).toBe(false);
  });

  it('counts the same socket once', () => {
    const game = aGame();
    const player = game.players.get(game.facilitatorId)!;
    connectSocket(player, 's1');
    connectSocket(player, 's1');

    expect(disconnectSocket(player, 's1')).toBe(true);
  });
});

describe('toPublicState', () => {
  it('lists the facilitator separately from voters in join order', () => {
    const game = aGame({ name: 'Sven' });
    addVoter(game, aNewPlayer({ id: 'v1', name: 'Anna' }));
    addVoter(game, aNewPlayer({ id: 'v2', name: 'Bob' }));

    const state = toPublicState(game);

    expect(state.facilitator.name).toBe('Sven');
    expect(state.voters.map((voter) => voter.name)).toEqual(['Anna', 'Bob']);
  });

  it('has an empty voter list when only the facilitator exists', () => {
    expect(toPublicState(aGame()).voters).toEqual([]);
  });

  it('contains only gameId, facilitator and voters', () => {
    const game = aGame();
    addVoter(game, aNewPlayer({ id: 'v1', name: 'Anna' }));

    const state = toPublicState(game);

    expect(Object.keys(state).sort()).toEqual(['facilitator', 'gameId', 'voters']);
    expect(Object.keys(state.facilitator).sort()).toEqual(['connected', 'name']);
    expect(Object.keys(state.voters[0]!).sort()).toEqual(['connected', 'id', 'name']);
  });

  it('does not expose token hashes, socket ids or the facilitator id', () => {
    const game = aGame({ id: 'facilitator-id' });
    const voter = aNewPlayer({ id: 'v1', name: 'Anna' });
    addVoter(game, voter);
    connectSocket(game.players.get('v1')!, 'socket-1');

    const serialized = JSON.stringify(toPublicState(game));

    expect(serialized).not.toContain('socket-1');
    expect(serialized).not.toContain('facilitator-id');
    expect(serialized).not.toContain(voter.tokenHash.toString('hex'));
  });

  it('marks players connected from their sockets', () => {
    const game = aGame();
    addVoter(game, aNewPlayer({ id: 'v1', name: 'Anna' }));
    addVoter(game, aNewPlayer({ id: 'v2', name: 'Bob' }));
    connectSocket(game.players.get('v1')!, 's1');

    expect(toPublicState(game).voters.map((voter) => voter.connected)).toEqual([true, false]);
  });

  it('throws when the game has no facilitator', () => {
    const game = aGame();
    game.players.clear();

    expect(() => toPublicState(game)).toThrow('no facilitator');
  });
});
