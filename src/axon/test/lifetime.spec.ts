import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_EVENTS, type GameEnded, type PublicGameState } from '@axon/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { endAllGames, startSweeper, type Sweeper } from '../src/realtime/lifecycle.js';
import { attachSocketIo } from '../src/realtime/socketServer.js';
import { GameStore } from '../src/store/gameStore.js';

const MISSING_STATIC_DIR = path.join(os.tmpdir(), 'axon-lifetime-spec-no-static');
const SERVER_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/server.ts');
const EMPTY_TTL = 120_000;
const MAX_AGE = 7_200_000;
const SWEEP_MS = 15;

interface Seat {
  readonly socket: Socket;
  readonly events: Array<{ event: string; payload: unknown }>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
    await wait(10);
  }
}

function connectTo(baseUrl: string): Promise<Seat> {
  const socket = ioClient(baseUrl, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  const seat: Seat = { socket, events: [] };
  socket.onAny((event: string, ...args: unknown[]) =>
    seat.events.push({ event, payload: args[0] }),
  );
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(seat));
    socket.once('connect_error', reject);
  });
}

function joinWith(seat: Seat, payload: unknown): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolve) => seat.socket.emit(GAME_EVENTS.join, payload, resolve));
}

function emitWithAck(seat: Seat, event: string, payload?: unknown): Promise<{ ok: boolean }> {
  return new Promise((resolve) => seat.socket.emit(event, payload, resolve));
}

const ended = (seat: Seat): GameEnded | undefined =>
  seat.events.find((e) => e.event === GAME_EVENTS.ended)?.payload as GameEnded | undefined;
const lastState = (seat: Seat): PublicGameState | undefined =>
  seat.events.filter((e) => e.event === GAME_EVENTS.state).at(-1)?.payload as PublicGameState;

describe('game lifetime over Socket.IO', () => {
  let now: number;
  let store: GameStore;
  let io: SocketServer;
  let baseUrl: string;
  let sweeper: Sweeper | undefined;
  let seats: Seat[];
  let httpServer: http.Server;

  async function exists(gameId: string): Promise<boolean> {
    const res = await fetch(`${baseUrl}/api/games/${gameId}/exists`);
    return ((await res.json()) as { exists: boolean }).exists;
  }

  async function aGame(name = 'Fran') {
    const { gameId, token } = store.createGame(name);
    const seat = await connectTo(baseUrl);
    seats.push(seat);
    expect(await joinWith(seat, { gameId, token })).toEqual({ ok: true });
    return { gameId, token, facilitator: seat };
  }

  async function aVoter(gameId: string, name: string) {
    const seat = await connectTo(baseUrl);
    seats.push(seat);
    expect(await joinWith(seat, { gameId, name })).toEqual({ ok: true });
    await until(() => seat.events.some((e) => e.event === GAME_EVENTS.joined));
    const joined = seat.events.find((e) => e.event === GAME_EVENTS.joined)?.payload as {
      token: string;
    };
    return { seat, token: joined.token };
  }

  beforeEach(async () => {
    now = 1_000_000;
    seats = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store = new GameStore({
      now: () => now,
      lifetime: { emptyTtlMs: EMPTY_TTL, maxAgeMs: MAX_AGE, sweepIntervalMs: SWEEP_MS },
    });
    httpServer = http.createServer(createApp({ staticDir: MISSING_STATIC_DIR, store }));
    io = attachSocketIo(httpServer, store);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    sweeper = startSweeper(io, store, SWEEP_MS);
  });

  afterEach(async () => {
    sweeper?.stop();
    seats.forEach((seat) => seat.socket.disconnect());
    await io.close();
    vi.restoreAllMocks();
  });

  describe('empty games', () => {
    it('deletes a game everybody left once the TTL passed: it does not exist and cannot be joined', async () => {
      // Given
      const { gameId, token, facilitator } = await aGame();
      facilitator.socket.disconnect();
      await until(() => store.get(gameId)?.emptySince !== undefined);

      // When
      now += EMPTY_TTL;
      await until(async () => !(await exists(gameId)));

      // Then
      const stranger = await connectTo(baseUrl);
      seats.push(stranger);
      expect(await joinWith(stranger, { gameId, token })).toMatchObject({
        ok: false,
        code: 'GAME_NOT_FOUND',
      });
      expect(await joinWith(stranger, { gameId, name: 'Anna' })).toMatchObject({
        ok: false,
        code: 'GAME_NOT_FOUND',
      });
    });

    it('keeps the game while it has been empty for less than the TTL', async () => {
      const { gameId, facilitator } = await aGame();
      facilitator.socket.disconnect();
      await until(() => store.get(gameId)?.emptySince !== undefined);

      now += EMPTY_TTL - 1;
      await wait(SWEEP_MS * 4);

      expect(await exists(gameId)).toBe(true);
    });

    it('keeps the votes, history and removed-token ban when a player rejoins in time', async () => {
      // Given a game with a story, a vote, a recorded story and a removed voter
      const { gameId, facilitator, token } = await aGame();
      const anna = await aVoter(gameId, 'Anna');
      const bob = await aVoter(gameId, 'Bob');
      await emitWithAck(facilitator, GAME_EVENTS.storySet, { title: 'First' });
      await emitWithAck(anna.seat, GAME_EVENTS.voteCast, { card: 5 });
      await emitWithAck(facilitator, GAME_EVENTS.roundReveal);
      await emitWithAck(facilitator, GAME_EVENTS.roundFinish, { finalEstimate: 5 });
      await emitWithAck(facilitator, GAME_EVENTS.storySet, { title: 'Second' });
      await emitWithAck(anna.seat, GAME_EVENTS.voteCast, { card: 8 });
      const bobId =
        store.get(gameId)!.players.size &&
        [...store.get(gameId)!.players.values()].find((p) => p.name === 'Bob')!.id;
      await emitWithAck(facilitator, GAME_EVENTS.playerRemove, { playerId: bobId });
      [facilitator, anna.seat].forEach((seat) => seat.socket.disconnect());
      await until(() => store.get(gameId)?.emptySince !== undefined);

      // When Anna comes back before the TTL and a lot of time passes
      now += EMPTY_TTL - 1000;
      const back = await connectTo(baseUrl);
      seats.push(back);
      expect(await joinWith(back, { gameId, token: anna.token })).toEqual({ ok: true });
      now += EMPTY_TTL * 5;
      await wait(SWEEP_MS * 6);

      // Then nothing was lost
      expect(await exists(gameId)).toBe(true);
      const mine = back.events.find((e) => e.event === GAME_EVENTS.voteMine)?.payload;
      expect(mine).toEqual({ card: 8 });
      await until(() => lastState(back)?.history.length === 1);
      expect(lastState(back)).toMatchObject({
        phase: 'voting',
        story: { title: 'Second' },
        history: [{ title: 'First', estimate: 5 }],
        total: 5,
      });
      const bobBack = await connectTo(baseUrl);
      seats.push(bobBack);
      expect(await joinWith(bobBack, { gameId, token: bob.token })).toMatchObject({
        code: 'REMOVED',
      });
      expect(token).toBeTruthy();
    });

    it('keeps a game with a second tab open after the first tab closes', async () => {
      const { gameId, token, facilitator } = await aGame();
      const tab = await connectTo(baseUrl);
      seats.push(tab);
      await joinWith(tab, { gameId, token });

      facilitator.socket.disconnect();
      now += EMPTY_TTL * 3;
      await wait(SWEEP_MS * 5);

      expect(await exists(gameId)).toBe(true);
    });
  });

  describe('age cap', () => {
    it('deletes a game with players connected, tells them game:ended expired and disconnects them', async () => {
      // Given a game being played
      const { gameId, facilitator } = await aGame();
      const anna = await aVoter(gameId, 'Anna');
      await emitWithAck(facilitator, GAME_EVENTS.storySet, { title: 'Login page' });
      await emitWithAck(anna.seat, GAME_EVENTS.voteCast, { card: 5 });

      // When it passes the cap
      now += MAX_AGE;
      await until(async () => !(await exists(gameId)));

      // Then every player is told and dropped
      for (const seat of [facilitator, anna.seat]) {
        await until(() => ended(seat) !== undefined);
        expect(ended(seat)).toEqual({ reason: 'expired' });
        await until(() => !seat.socket.connected);
        expect(JSON.stringify(seat.events.find((e) => e.event === GAME_EVENTS.ended))).not.toMatch(
          /Login|Anna|Fran/,
        );
      }
    });

    it('keeps a game at the cap minus 1 ms, whatever its state', async () => {
      const { gameId, facilitator } = await aGame();
      const anna = await aVoter(gameId, 'Anna');
      await emitWithAck(facilitator, GAME_EVENTS.storySet, { title: 'T' });
      await emitWithAck(anna.seat, GAME_EVENTS.voteCast, { card: 5 });
      await emitWithAck(facilitator, GAME_EVENTS.roundReveal);

      now += MAX_AGE - 1;
      await wait(SWEEP_MS * 5);

      expect(await exists(gameId)).toBe(true);
      expect(ended(facilitator)).toBeUndefined();
    });

    it('only ends the games that are over and leaves other rooms alone', async () => {
      const old = await aGame('Old');
      now += MAX_AGE - 1000;
      const fresh = await aGame('Fresh');

      now += 1000;
      await until(async () => !(await exists(old.gameId)));
      await wait(SWEEP_MS * 3);

      expect(ended(old.facilitator)).toEqual({ reason: 'expired' });
      expect(ended(fresh.facilitator)).toBeUndefined();
      expect(await exists(fresh.gameId)).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('endAllGames tells every connected player game:ended server-restart before disconnecting them', async () => {
      const first = await aGame('One');
      const second = await aGame('Two');
      const voter = await aVoter(second.gameId, 'Anna');

      await endAllGames(io, 'server-restart');

      for (const seat of [first.facilitator, second.facilitator, voter.seat]) {
        await until(() => !seat.socket.connected);
        const kinds = seat.events.map((e) => e.event);
        expect(ended(seat)).toEqual({ reason: 'server-restart' });
        expect(kinds.indexOf(GAME_EVENTS.ended)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe('the real server process', () => {
  let child: ChildProcess | undefined;
  const logs: string[] = [];

  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    });
  }

  function start(env: Record<string, string>): {
    port: Promise<number>;
    exit: Promise<number | null>;
  } {
    logs.length = 0;
    return {
      port: freePort().then((port) => {
        child = spawn(process.execPath, ['--import', 'tsx', '--conditions=source', SERVER_ENTRY], {
          env: { ...process.env, PORT: String(port), STATIC_DIR: MISSING_STATIC_DIR, ...env },
          cwd: path.dirname(SERVER_ENTRY),
        });
        child.stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
        child.stderr?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
        return port;
      }),
      exit: new Promise((resolve) => {
        const poll = setInterval(() => {
          if (child) {
            clearInterval(poll);
            child.once('exit', (code) => resolve(code));
          }
        }, 5);
      }),
    };
  }

  afterEach(() => {
    child?.kill('SIGKILL');
    child = undefined;
  });

  it('on SIGTERM tells connected players the server restarted, disconnects them and exits 0', async () => {
    // Given a running server with a connected player
    const started = start({});
    const port = await started.port;
    await until(() => logs.join('').includes('server.listening'), 20_000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = (await (
      await fetch(`${baseUrl}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fran' }),
      })
    ).json()) as { gameId: string; token: string };
    const seat = await connectTo(baseUrl);
    expect(await joinWith(seat, created)).toEqual({ ok: true });

    // When
    child!.kill('SIGTERM');

    // Then
    await until(() => ended(seat) !== undefined);
    expect(ended(seat)).toEqual({ reason: 'server-restart' });
    await until(() => !seat.socket.connected);
    expect(await started.exit).toBe(0);
  }, 40_000);

  it('refuses to start with a bad lifetime setting and names the variable', async () => {
    const started = start({ GAME_MAX_AGE_MS: 'soon' });
    await started.port;

    const code = await started.exit;

    expect(code).not.toBe(0);
    expect(logs.join('')).toMatch(/Invalid GAME_MAX_AGE_MS/);
  }, 40_000);
});
