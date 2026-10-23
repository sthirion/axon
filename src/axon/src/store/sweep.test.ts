import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { castVote, connectSocket, disconnectSocket, setStory } from '../domain/game.js';
import { GameStore } from './gameStore.js';

const TTL = 120_000;
const MAX_AGE = 7_200_000;

let now: number;

function aStore(): GameStore {
  return new GameStore({
    now: () => now,
    lifetime: { emptyTtlMs: TTL, maxAgeMs: MAX_AGE, sweepIntervalMs: 30_000 },
  });
}

// A game with the facilitator and one voter, both connected.
function anOnlineGame(store: GameStore) {
  const { gameId, token } = store.createGame('Fran');
  const game = store.get(gameId)!;
  const joined = store.joinAsVoter(game, 'Anna');
  if (!joined.ok) throw new Error('voter did not join');
  const facilitator = store.authenticate(game, token)!;
  connectSocket(facilitator, 'f-1');
  connectSocket(joined.player, 'a-1');
  store.markConnected(game);
  return { gameId, token, game, facilitator, anna: joined.player };
}

function disconnectAll(store: GameStore, ctx: ReturnType<typeof anOnlineGame>) {
  disconnectSocket(ctx.facilitator, 'f-1');
  disconnectSocket(ctx.anna, 'a-1');
  store.markDisconnected(ctx.game);
}

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('emptiness bookkeeping', () => {
  it('records createdAt and starts a new game as empty', () => {
    const store = aStore();
    const { gameId } = store.createGame('Fran');

    expect(store.get(gameId)).toMatchObject({ createdAt: now, emptySince: now });
  });

  it('clears emptySince when a player connects and sets it when the last socket leaves', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    expect(ctx.game.emptySince).toBeUndefined();

    now += 5000;
    disconnectAll(store, ctx);

    expect(ctx.game.emptySince).toBe(now);
  });

  it('does not set emptySince while anyone is still connected', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);

    disconnectSocket(ctx.anna, 'a-1');
    store.markDisconnected(ctx.game);

    expect(ctx.game.emptySince).toBeUndefined();
  });

  it('keeps a game with a second tab alive when one tab closes', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    connectSocket(ctx.anna, 'a-2');

    disconnectSocket(ctx.anna, 'a-1');
    disconnectSocket(ctx.facilitator, 'f-1');
    store.markDisconnected(ctx.game);

    expect(ctx.game.emptySince).toBeUndefined();
  });

  it('keeps the first emptySince when markDisconnected is called again', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    disconnectAll(store, ctx);
    const first = ctx.game.emptySince;

    now += 10_000;
    store.markDisconnected(ctx.game);

    expect(ctx.game.emptySince).toBe(first);
  });
});

describe('sweep: empty games', () => {
  it('keeps a game empty for TTL minus 1 ms and deletes it at the TTL', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    disconnectAll(store, ctx);

    now += TTL - 1;
    expect(store.sweep()).toEqual([]);
    expect(store.exists(ctx.gameId)).toBe(true);

    now += 1;
    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'empty' }]);
    expect(store.exists(ctx.gameId)).toBe(false);
    expect(store.get(ctx.gameId)).toBeUndefined();
  });

  it('deletes a game nobody ever joined after the TTL', () => {
    const store = aStore();
    const { gameId } = store.createGame('Fran');

    now += TTL;

    expect(store.sweep()).toEqual([{ gameId, reason: 'empty' }]);
  });

  it('keeps the full state when a player reconnects in time and restarts the clock afterwards', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    setStory(ctx.game, ctx.facilitator.id, { title: 'Login page' });
    castVote(ctx.game, ctx.anna.id, 5);
    ctx.game.bannedTokenHashes.add('abc');
    disconnectAll(store, ctx);

    now += TTL - 1000;
    connectSocket(ctx.anna, 'a-2');
    store.markConnected(ctx.game);
    now += TTL;

    expect(store.sweep()).toEqual([]);
    expect(ctx.game.story).toEqual({ title: 'Login page' });
    expect(ctx.game.votes.get(ctx.anna.id)).toBe(5);
    expect(ctx.game.bannedTokenHashes.has('abc')).toBe(true);
    expect(ctx.game.emptySince).toBeUndefined();

    disconnectSocket(ctx.anna, 'a-2');
    store.markDisconnected(ctx.game);
    now += TTL - 1;
    expect(store.sweep()).toEqual([]);
    now += 1;
    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'empty' }]);
  });

  it('never deletes a game that has a connected player, however long', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);

    now += MAX_AGE - 1;

    expect(store.sweep()).toEqual([]);
    expect(store.exists(ctx.gameId)).toBe(true);
  });

  it('uses the sweep as a safety net when emptySince is missing', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    disconnectSocket(ctx.facilitator, 'f-1');
    disconnectSocket(ctx.anna, 'a-1');

    expect(store.sweep()).toEqual([]);
    expect(ctx.game.emptySince).toBe(now);
    now += TTL;
    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'empty' }]);
  });

  it('only deletes the games that are over', () => {
    const store = aStore();
    const old = anOnlineGame(store);
    disconnectAll(store, old);
    now += TTL - 1;
    const fresh = anOnlineGame(store);
    now += 1;

    expect(store.sweep()).toEqual([{ gameId: old.gameId, reason: 'empty' }]);
    expect(store.exists(fresh.gameId)).toBe(true);
  });
});

describe('sweep: maximum age', () => {
  it('deletes a game at the cap with players connected, in any phase', () => {
    const store = aStore();
    const voting = anOnlineGame(store);
    setStory(voting.game, voting.facilitator.id, { title: 'T' });

    now += MAX_AGE - 1;
    expect(store.sweep()).toEqual([]);
    now += 1;

    expect(store.sweep()).toEqual([{ gameId: voting.gameId, reason: 'expired' }]);
    expect(store.exists(voting.gameId)).toBe(false);
  });

  it('reports expired, not empty, when a game is both over the cap and empty', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    disconnectAll(store, ctx);

    now += MAX_AGE;

    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'expired' }]);
  });

  it('counts the age from creation, not from the last activity', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    now += MAX_AGE - 10;
    disconnectSocket(ctx.anna, 'a-1');
    connectSocket(ctx.anna, 'a-2');
    store.markConnected(ctx.game);

    now += 10;

    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'expired' }]);
  });
});

describe('lookups before the sweep runs', () => {
  it('treats a game empty for the TTL as gone for get and exists, and the sweep still reports it', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    disconnectAll(store, ctx);

    now += TTL - 1;
    expect(store.get(ctx.gameId)).toBe(ctx.game);
    now += 1;

    expect(store.get(ctx.gameId)).toBeUndefined();
    expect(store.exists(ctx.gameId)).toBe(false);
    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'empty' }]);
  });

  it('treats a game past the age cap as gone even with players connected', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);

    now += MAX_AGE - 1;
    expect(store.exists(ctx.gameId)).toBe(true);
    now += 1;

    expect(store.exists(ctx.gameId)).toBe(false);
    expect(store.sweep()).toEqual([{ gameId: ctx.gameId, reason: 'expired' }]);
  });

  it('still finds a game that was only empty for a moment', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    disconnectAll(store, ctx);
    connectSocket(ctx.anna, 'a-2');
    store.markConnected(ctx.game);

    now += TTL * 2;

    expect(store.get(ctx.gameId)).toBe(ctx.game);
  });
});

describe('sweep: logging', () => {
  it('logs the gameId and the reason only', () => {
    const store = aStore();
    const ctx = anOnlineGame(store);
    store.joinAsVoter(ctx.game, 'Secret Name');
    setStory(ctx.game, ctx.facilitator.id, { title: 'Secret story' });
    now += MAX_AGE;

    store.sweep();

    const calls = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!)).toEqual({
      level: 'info',
      event: 'game.deleted',
      gameId: ctx.gameId,
      reason: 'expired',
    });
    expect(calls[0]).not.toMatch(/Secret|Fran|Anna/);
  });
});
