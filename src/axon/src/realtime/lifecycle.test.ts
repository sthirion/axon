import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStore } from '../store/gameStore.js';
import { connectSocket } from '../domain/game.js';
import { gameRoom, registerGateway } from './gateway.js';
import { endAllGames, registerShutdown, startSweeper } from './lifecycle.js';
import { FakeIo } from './testing/fakes.js';

const TTL = 120_000;
const MAX_AGE = 7_200_000;
const INTERVAL = 30_000;

let now: number;

function aStore() {
  return new GameStore({
    now: () => now,
    lifetime: { emptyTtlMs: TTL, maxAgeMs: MAX_AGE, sweepIntervalMs: INTERVAL },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  now = Date.now();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Fake timers move Date.now, so the store's clock follows them.
const clock = () => Date.now();
function aTimedStore() {
  return new GameStore({
    now: clock,
    lifetime: { emptyTtlMs: TTL, maxAgeMs: MAX_AGE, sweepIntervalMs: INTERVAL },
  });
}

describe('startSweeper', () => {
  it('deletes an empty game at the first sweep after the TTL, not before', () => {
    const io = new FakeIo();
    const store = aTimedStore();
    const { gameId } = store.createGame('Fran');
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);

    vi.advanceTimersByTime(TTL - 1);
    expect(store.exists(gameId)).toBe(true);
    vi.advanceTimersByTime(INTERVAL);

    expect(store.exists(gameId)).toBe(false);
    expect(io.broadcasts).toEqual([]);
    sweeper.stop();
  });

  it('sweeps repeatedly on the interval', () => {
    const io = new FakeIo();
    const store = aTimedStore();
    const sweep = vi.spyOn(store, 'sweep');
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);

    vi.advanceTimersByTime(INTERVAL * 3);

    expect(sweep).toHaveBeenCalledTimes(3);
    sweeper.stop();
  });

  it('keeps a game whose player reconnected before the TTL', () => {
    const io = new FakeIo();
    const store = aTimedStore();
    const { gameId } = store.createGame('Fran');
    const game = store.get(gameId)!;
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);

    vi.advanceTimersByTime(TTL - INTERVAL);
    connectSocket(game.players.get(game.facilitatorId)!, 's1');
    store.markConnected(game);
    vi.advanceTimersByTime(INTERVAL * 10);

    expect(store.exists(gameId)).toBe(true);
    sweeper.stop();
  });

  it('tells the room and disconnects it when a game hits the age cap, once', () => {
    const io = new FakeIo();
    const store = aTimedStore();
    registerGateway(io.asServer(), store);
    const { gameId, token } = store.createGame('Fran');
    io.connect('fran').sendJoin({ gameId, token });
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);
    io.timeline.length = 0;
    io.broadcasts.length = 0;

    vi.advanceTimersByTime(MAX_AGE);
    vi.advanceTimersByTime(INTERVAL * 3);

    expect(store.exists(gameId)).toBe(false);
    expect(io.broadcasts).toEqual([
      { room: gameRoom(gameId), event: 'game:ended', payload: { reason: 'expired' } },
    ]);
    expect(io.disconnected).toEqual([gameRoom(gameId)]);
    expect(io.timeline).toEqual(['broadcast:game:ended', 'disconnect']);
    sweeper.stop();
  });

  it('survives a failing sweep, logs it without data and keeps sweeping', () => {
    const io = new FakeIo();
    const store = aTimedStore();
    const sweep = vi
      .spyOn(store, 'sweep')
      .mockImplementationOnce(() => {
        throw new Error('boom: secret name');
      })
      .mockReturnValue([]);
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);

    vi.advanceTimersByTime(INTERVAL * 3);

    expect(sweep).toHaveBeenCalledTimes(3);
    const line = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({ level: 'warn', event: 'sweep.failed' });
    expect(line).not.toMatch(/secret|boom/);
    sweeper.stop();
  });

  it('does not run after stop()', () => {
    const io = new FakeIo();
    const store = aTimedStore();
    const sweep = vi.spyOn(store, 'sweep');
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);

    vi.advanceTimersByTime(INTERVAL);
    sweeper.stop();
    vi.advanceTimersByTime(INTERVAL * 10);

    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it('creates an interval that does not keep the process alive', () => {
    const unref = vi.fn();
    const realSetInterval = globalThis.setInterval;
    const spy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((...args: unknown[]) => {
      const timer = (realSetInterval as (...a: unknown[]) => NodeJS.Timeout)(...args);
      timer.unref = (() => {
        unref();
        return timer;
      }) as NodeJS.Timeout['unref'];
      return timer;
    }) as unknown as typeof setInterval);

    startSweeper(new FakeIo().asServer(), aTimedStore(), INTERVAL).stop();

    expect(unref).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('endAllGames', () => {
  it('emits game:ended to everyone before it disconnects everyone, and logs counts only', async () => {
    const io = new FakeIo();
    io.connect('a');
    io.connect('b');
    io.timeline.length = 0;

    await endAllGames(io.asServer(), 'server-restart');

    expect(io.broadcasts).toEqual([
      { room: '*', event: 'game:ended', payload: { reason: 'server-restart' } },
    ]);
    expect(io.timeline).toEqual(['emit:game:ended', 'disconnect:*']);
    const line = JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0]));
    expect(line).toEqual({
      level: 'info',
      event: 'games.ended',
      reason: 'server-restart',
      count: 2,
    });
  });
});

describe('registerShutdown', () => {
  function aShutdown() {
    const io = new FakeIo();
    const store = aStore();
    const sweeper = startSweeper(io.asServer(), store, INTERVAL);
    const stop = vi.spyOn(sweeper, 'stop');
    const httpServer = { listening: true, close: vi.fn() };
    const exit = vi.fn();
    const unregister = registerShutdown(
      { io: io.asServer(), httpServer: httpServer as never, sweeper, exit },
      ['SIGUSR2'],
    );
    return { io, stop, httpServer, exit, unregister };
  }

  it('stops the sweeper, tells players, closes the servers and exits 0 on the signal', async () => {
    const { io, stop, httpServer, exit, unregister } = aShutdown();
    io.connect('a');
    io.timeline.length = 0;

    process.emit('SIGUSR2');
    await vi.advanceTimersByTimeAsync(0);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(io.timeline).toEqual(['emit:game:ended', 'disconnect:*', 'close']);
    expect(httpServer.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    unregister();
  });

  it('forces the exit after 5 seconds if closing hangs', async () => {
    const { io, exit, unregister } = aShutdown();
    vi.spyOn(io, 'close').mockReturnValue(new Promise(() => undefined));

    process.emit('SIGUSR2');
    await vi.advanceTimersByTimeAsync(4999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(exit).toHaveBeenCalledWith(0);
    unregister();
  });

  it('exits at once on a second signal and ends the games only once', async () => {
    const { io, exit, unregister } = aShutdown();
    vi.spyOn(io, 'close').mockReturnValue(new Promise(() => undefined));

    process.emit('SIGUSR2');
    process.emit('SIGUSR2');
    await vi.advanceTimersByTimeAsync(0);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(io.broadcasts.filter((b) => b.event === 'game:ended')).toHaveLength(1);
    unregister();
  });

  it('stops listening once unregistered', () => {
    const { exit, unregister } = aShutdown();
    unregister();

    process.emit('SIGUSR2');

    expect(exit).not.toHaveBeenCalled();
  });
});
