import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GAME_ID_PATTERN, PLAYER_TOKEN_PATTERN } from '@axon/shared';
import { toPublicState } from '../domain/game.js';
import { GameStore, hashToken } from './gameStore.js';

function bytesOf(fill: number) {
  return (size: number) => Buffer.alloc(size, fill);
}

function sequentialBytes() {
  let counter = 0;
  return (size: number) => {
    counter += 1;
    return Buffer.alloc(size, counter);
  };
}

function aGameWithVoter(store: GameStore, voterName = 'Anna') {
  const { gameId, token } = store.createGame('Sven');
  const game = store.get(gameId)!;
  const voter = store.joinAsVoter(game, voterName);
  if (!voter.ok) {
    throw new Error('expected the voter to join');
  }
  return { game, facilitatorToken: token, voter };
}

describe('hashToken', () => {
  it('is the SHA-256 digest of the token', () => {
    expect(hashToken('abc').equals(createHash('sha256').update('abc').digest())).toBe(true);
  });
});

describe('GameStore.createGame', () => {
  it('derives the game id from 16 random bytes as 22 base64url characters', () => {
    const store = new GameStore({ randomBytes: bytesOf(0xab) });

    const { gameId } = store.createGame('Sven');

    expect(gameId).toBe(Buffer.alloc(16, 0xab).toString('base64url'));
    expect(gameId).toMatch(GAME_ID_PATTERN);
  });

  it('derives the token from 32 random bytes as 43 base64url characters', () => {
    const calls: number[] = [];
    const store = new GameStore({
      randomBytes: (size) => {
        calls.push(size);
        return Buffer.alloc(size, calls.length);
      },
    });

    const { token } = store.createGame('Sven');

    expect(calls).toEqual([16, 32]);
    expect(token).toBe(Buffer.alloc(32, 2).toString('base64url'));
    expect(token).toMatch(PLAYER_TOKEN_PATTERN);
  });

  it('changes the game id only with the random bytes', () => {
    const first = new GameStore({ randomBytes: bytesOf(1) }).createGame('Sven').gameId;
    const second = new GameStore({ randomBytes: bytesOf(1) }).createGame('Other name').gameId;
    const third = new GameStore({ randomBytes: bytesOf(2) }).createGame('Sven').gameId;

    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('draws again when the id is already taken', () => {
    const draws = [bytesOf(1)(16), bytesOf(1)(16), bytesOf(2)(16)];
    const store = new GameStore({
      randomBytes: (size) => (size === 16 ? draws.shift()! : Buffer.alloc(size, 9)),
    });
    store.createGame('Sven');

    const { gameId } = store.createGame('Anna');

    expect(gameId).toBe(Buffer.alloc(16, 2).toString('base64url'));
  });

  it('generates 10000 distinct ids', () => {
    const store = new GameStore();

    const ids = new Set(Array.from({ length: 10_000 }, () => store.createGame('Sven').gameId));

    expect(ids.size).toBe(10_000);
  });

  it('stores the facilitator with the player id from randomUUID', () => {
    const store = new GameStore({ randomUUID: () => 'uuid-1' });
    const { gameId } = store.createGame('Sven');

    expect(store.get(gameId)?.facilitatorId).toBe('uuid-1');
  });

  it('stores only the SHA-256 hash of the facilitator token', () => {
    const store = new GameStore();
    const { gameId, token } = store.createGame('Sven');
    const game = store.get(gameId)!;

    const facilitator = game.players.get(game.facilitatorId)!;

    expect(facilitator.tokenHash.equals(hashToken(token))).toBe(true);
  });

  it('never keeps the raw token in the serialized game', () => {
    const store = new GameStore();
    const { gameId, token } = store.createGame('Sven');
    const game = store.get(gameId)!;

    const serialized = JSON.stringify({ ...game, players: [...game.players.values()] });

    expect(serialized).not.toContain(token);
  });
});

describe('GameStore.exists and get', () => {
  it('knows a created game', () => {
    const store = new GameStore();
    const { gameId } = store.createGame('Sven');

    expect(store.exists(gameId)).toBe(true);
  });

  it('does not know an unknown id', () => {
    expect(new GameStore().exists('A'.repeat(22))).toBe(false);
  });

  it('returns undefined for an unknown game', () => {
    expect(new GameStore().get('A'.repeat(22))).toBeUndefined();
  });

  it('does not share games between store instances', () => {
    const { gameId } = new GameStore().createGame('Sven');

    expect(new GameStore().exists(gameId)).toBe(false);
  });
});

describe('GameStore.joinAsVoter', () => {
  it('adds a voter and returns a one-time token', () => {
    const store = new GameStore({ randomBytes: sequentialBytes() });
    const { gameId } = store.createGame('Sven');

    const result = store.joinAsVoter(store.get(gameId)!, 'Anna');

    expect(result).toMatchObject({ ok: true, player: { name: 'Anna', role: 'voter' } });
    expect(result.ok && result.token).toMatch(PLAYER_TOKEN_PATTERN);
  });

  it('stores only the hash of the voter token', () => {
    const { game, voter } = aGameWithVoter(new GameStore());

    expect(voter.player.tokenHash.equals(hashToken(voter.token))).toBe(true);
    expect(JSON.stringify({ ...game, players: [...game.players.values()] })).not.toContain(
      voter.token,
    );
  });

  it('rejects a taken name ignoring case', () => {
    const store = new GameStore();
    const { game } = aGameWithVoter(store, 'Anna');

    expect(store.joinAsVoter(game, 'ANNA')).toEqual({ ok: false, code: 'NAME_TAKEN' });
  });

  it('rejects the facilitator name', () => {
    const store = new GameStore();
    const { gameId } = store.createGame('Sven');

    expect(store.joinAsVoter(store.get(gameId)!, 'sven')).toEqual({
      ok: false,
      code: 'NAME_TAKEN',
    });
  });

  it('issues a different token to each voter', () => {
    const store = new GameStore();
    const { game, voter } = aGameWithVoter(store, 'Anna');

    const second = store.joinAsVoter(game, 'Bob');

    expect(second.ok && second.token).not.toBe(voter.token);
  });

  it('keeps voters in join order in the public state', () => {
    const store = new GameStore();
    const { game } = aGameWithVoter(store, 'Anna');
    store.joinAsVoter(game, 'Bob');

    expect(toPublicState(game).voters.map((voter) => voter.name)).toEqual(['Anna', 'Bob']);
  });
});

describe('GameStore.authenticate', () => {
  it('resolves the voter from their token', () => {
    const store = new GameStore();
    const { game, voter } = aGameWithVoter(store);

    expect(store.authenticate(game, voter.token)?.id).toBe(voter.player.id);
  });

  it('resolves the facilitator role from the creator token', () => {
    const store = new GameStore();
    const { game, facilitatorToken } = aGameWithVoter(store);

    expect(store.authenticate(game, facilitatorToken)?.role).toBe('facilitator');
  });

  it('rejects a wrong token of the same length', () => {
    const store = new GameStore();
    const { game, voter } = aGameWithVoter(store);
    const wrong = `${voter.token.slice(0, -1)}${voter.token.endsWith('A') ? 'B' : 'A'}`;

    expect(store.authenticate(game, wrong)).toBeUndefined();
  });

  it('rejects a token from another game', () => {
    const store = new GameStore();
    const { voter } = aGameWithVoter(store);
    const other = store.get(store.createGame('Eve').gameId)!;

    expect(store.authenticate(other, voter.token)).toBeUndefined();
  });
});
