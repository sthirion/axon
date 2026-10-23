import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  failedAck,
  GAME_EVENTS,
  type Ack,
  type Card,
  type GameJoined,
  type PublicGameState,
} from '@axon/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { attachSocketIo } from '../src/realtime/socketServer.js';
import { GameStore } from '../src/store/gameStore.js';

const MISSING_STATIC_DIR = path.join(os.tmpdir(), 'axon-handover-spec-no-static');
const BROADCAST_BUDGET_MS = 1000;
const LINK = 'https://example.com/story';

interface Recorded {
  readonly event: string;
  readonly payload: unknown;
}

class Client {
  readonly events: Recorded[] = [];
  private readonly listeners = new Set<() => void>();
  playerId = '';
  token = '';

  constructor(readonly socket: Socket) {
    socket.onAny((event: string, ...args: unknown[]) => {
      this.events.push({ event, payload: args[0] });
      [...this.listeners].forEach((listener) => listener());
    });
  }

  of(event: string, from = 0): unknown[] {
    return this.events.slice(from).flatMap((e) => (e.event === event ? [e.payload] : []));
  }

  get states(): PublicGameState[] {
    return this.of(GAME_EVENTS.state) as PublicGameState[];
  }

  emit(event: string, payload?: unknown): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  when<T>(check: () => T | undefined, timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = (): void => {
        const value = check();
        if (value !== undefined) {
          clearTimeout(timer);
          this.listeners.delete(run);
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(run);
        reject(new Error('Timed out waiting for the expected socket event'));
      }, timeoutMs);
      this.listeners.add(run);
      run();
    });
  }

  stateWhere(predicate: (state: PublicGameState) => boolean): Promise<PublicGameState> {
    return this.when(() => this.states.find(predicate));
  }
}

describe('facilitator handover over Socket.IO (Story #23)', () => {
  let servers: SocketServer[];
  let clients: Client[];
  let store: GameStore;
  let baseUrl: string;

  async function connect(): Promise<Client> {
    const socket = ioClient(baseUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    const client = new Client(socket);
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return client;
  }

  interface Table {
    readonly gameId: string;
    readonly fran: Client;
    readonly anna: Client;
    readonly bob: Client;
    readonly all: Client[];
  }

  async function aTable(): Promise<Table> {
    const { gameId, token } = store.createGame('Fran');
    const fran = await connect();
    expect(await fran.emit(GAME_EVENTS.join, { gameId, token })).toEqual({ ok: true });
    fran.token = token;
    fran.playerId = (
      (await fran.when(
        () => fran.of(GAME_EVENTS.joined)[0] as GameJoined | undefined,
      )) as GameJoined
    ).playerId;
    const voter = async (name: string): Promise<Client> => {
      const client = await connect();
      expect(await client.emit(GAME_EVENTS.join, { gameId, name })).toEqual({ ok: true });
      const joined = await client.when(
        () => client.of(GAME_EVENTS.joined)[0] as GameJoined | undefined,
      );
      client.playerId = joined.playerId;
      client.token = joined.token as string;
      return client;
    };
    const anna = await voter('Anna');
    const bob = await voter('Bob');
    const all = [fran, anna, bob];
    await Promise.all(all.map((c) => c.stateWhere((s) => s.voters.length === 2)));
    expect(await fran.emit(GAME_EVENTS.storySet, { title: 'Login page', url: LINK })).toEqual({
      ok: true,
    });
    await Promise.all(all.map((c) => c.stateWhere((s) => s.phase === 'voting')));
    return { gameId, fran, anna, bob, all };
  }

  async function handOver(from: Client, to: Client): Promise<Ack> {
    return from.emit(GAME_EVENTS.facilitatorTransfer, { playerId: to.playerId });
  }

  async function rejoin(table: Table, client: Client): Promise<{ role: string; ack: Ack }> {
    const fresh = await connect();
    const ack = await fresh.emit(GAME_EVENTS.join, { gameId: table.gameId, token: client.token });
    if (!ack.ok) return { role: '', ack };
    const joined = await fresh.when(
      () => fresh.of(GAME_EVENTS.joined)[0] as GameJoined | undefined,
    );
    return { role: joined.role, ack };
  }

  beforeEach(async () => {
    servers = [];
    clients = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation(() => undefined);
    }
    store = new GameStore();
    const httpServer = http.createServer(createApp({ staticDir: MISSING_STATIC_DIR, store }));
    servers.push(attachSocketIo(httpServer, store));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    clients.forEach((c) => c.socket.disconnect());
    await Promise.all(servers.map((io) => io.close()));
    vi.restoreAllMocks();
  });

  it('hands the role over: ack, new roles to both players, a state for everyone within 1 s', async () => {
    const { fran, anna, bob, all } = await aTable();
    const marks = all.map((c) => c.events.length);

    const started = performance.now();
    expect(await handOver(fran, anna)).toEqual({ ok: true });
    const states = await Promise.all(
      all.map((c) => c.stateWhere((s) => s.facilitator.name === 'Anna')),
    );

    expect(performance.now() - started).toBeLessThan(BROADCAST_BUDGET_MS);
    for (const state of states) {
      expect(state.voters.map((v) => v.name)).toEqual(['Fran', 'Bob']);
      expect(state.phase).toBe('voting');
      expect(state.story).toEqual({ title: 'Login page', url: LINK });
    }
    expect(fran.of(GAME_EVENTS.joined, marks[0])).toEqual([
      { playerId: fran.playerId, role: 'voter' },
    ]);
    expect(anna.of(GAME_EVENTS.joined, marks[1])).toEqual([
      { playerId: anna.playerId, role: 'facilitator' },
    ]);
    expect(bob.of(GAME_EVENTS.joined, marks[2])).toEqual([]);
    expect(bob.of(GAME_EVENTS.voteMine, marks[2])).toEqual([]);
    expect(anna.of(GAME_EVENTS.voteMine, marks[1])).toEqual([{ card: null }]);
    expect(fran.of(GAME_EVENTS.voteMine, marks[0])).toEqual([{ card: null }]);
  });

  it('never sends a token with the new role', async () => {
    const { fran, anna } = await aTable();
    const mark = anna.events.length;

    await handOver(fran, anna);
    await anna.when(() => anna.of(GAME_EVENTS.joined, mark)[0]);

    for (const joined of [
      ...anna.of(GAME_EVENTS.joined, mark),
      ...fran.of(GAME_EVENTS.joined, 1),
    ]) {
      expect(joined).not.toHaveProperty('token');
    }
  });

  it('discards the new facilitator vote and keeps the others, also in the results', async () => {
    const { fran, anna, bob, all } = await aTable();
    expect(await anna.emit(GAME_EVENTS.voteCast, { card: 3 })).toEqual({ ok: true });
    expect(await bob.emit(GAME_EVENTS.voteCast, { card: 8 })).toEqual({ ok: true });
    await Promise.all(all.map((c) => c.stateWhere((s) => s.voters.every((v) => v.hasVoted))));

    await handOver(fran, anna);
    const state = await bob.stateWhere((s) => s.facilitator.name === 'Anna');

    expect(state.voters.find((v) => v.name === 'Bob')?.hasVoted).toBe(true);
    expect(state.voters.find((v) => v.name === 'Fran')?.hasVoted).toBe(false);
    expect(await anna.emit(GAME_EVENTS.roundReveal)).toEqual({ ok: true });
    const revealed = await bob.stateWhere((s) => s.phase === 'revealed');
    expect(revealed.voters.map((v) => [v.name, v.card])).toEqual([
      ['Fran', undefined],
      ['Bob', 8 as Card],
    ]);
  });

  it('lets the new facilitator run the round and stops the old one', async () => {
    const { fran, anna, bob } = await aTable();
    await handOver(fran, anna);
    await bob.stateWhere((s) => s.facilitator.name === 'Anna');

    expect(await fran.emit(GAME_EVENTS.roundReveal)).toEqual(failedAck('FORBIDDEN'));
    expect(await fran.emit(GAME_EVENTS.storySet, { title: 'x', url: LINK })).toEqual(
      failedAck('FORBIDDEN'),
    );
    expect(await handOver(fran, bob)).toEqual(failedAck('FORBIDDEN'));
    expect(await fran.emit(GAME_EVENTS.voteCast, { card: 5 })).toEqual({ ok: true });
    expect(await anna.emit(GAME_EVENTS.voteCast, { card: 5 })).toEqual(failedAck('FORBIDDEN'));
    expect(await anna.emit(GAME_EVENTS.roundReveal)).toEqual({ ok: true });
  });

  it('keeps roles with the tokens: after a reload each token gets its current role', async () => {
    const table = await aTable();
    const { fran, anna } = table;
    await handOver(fran, anna);
    await anna.stateWhere((s) => s.facilitator.name === 'Anna');

    expect((await rejoin(table, fran)).role).toBe('voter');
    expect((await rejoin(table, anna)).role).toBe('facilitator');
  });

  it('sends the old facilitator back as a voter with the same name, which stays taken', async () => {
    const table = await aTable();
    await handOver(table.fran, table.anna);
    const state = await table.bob.stateWhere((s) => s.facilitator.name === 'Anna');
    expect(state.voters.map((v) => v.name)).toContain('Fran');

    const late = await connect();
    expect(await late.emit(GAME_EVENTS.join, { gameId: table.gameId, name: 'fran' })).toEqual(
      failedAck('NAME_TAKEN'),
    );
  });

  it('keeps a banned token banned', async () => {
    const table = await aTable();
    const { fran, anna, bob } = table;
    expect(await fran.emit(GAME_EVENTS.playerRemove, { playerId: bob.playerId })).toEqual({
      ok: true,
    });
    await anna.stateWhere((s) => s.voters.length === 1);

    await handOver(fran, anna);

    expect((await rejoin(table, bob)).ack).toEqual(failedAck('REMOVED'));
    expect(await handOver(anna, bob)).toEqual(failedAck('INVALID_PAYLOAD'));
  });

  it('rejects the bad cases and changes nothing', async () => {
    const table = await aTable();
    const { fran, anna, bob, all } = table;
    bob.socket.disconnect();
    await anna.stateWhere((s) => s.voters.some((v) => v.name === 'Bob' && !v.connected));
    const marks = all.map((c) => c.events.length);
    const transfer = (from: Client, payload: unknown) =>
      from.emit(GAME_EVENTS.facilitatorTransfer, payload);

    const forbidden = [
      await transfer(anna, { playerId: bob.playerId }),
      await transfer(anna, { playerId: 'nobody' }),
      await transfer(anna, {}),
    ];
    const invalid = [
      await transfer(fran, { playerId: bob.playerId }), // offline
      await transfer(fran, { playerId: 'nobody' }),
      await transfer(fran, { playerId: 7 }),
      await transfer(fran, { playerId: fran.playerId }), // yourself
      await transfer(fran, {}),
      await transfer(fran, undefined), // not even an object: the shape is checked first
      await transfer(anna, undefined),
    ];

    expect(forbidden).toEqual(Array(3).fill(failedAck('FORBIDDEN')));
    expect(invalid).toEqual(Array(7).fill(failedAck('INVALID_PAYLOAD')));
    expect(fran.events.slice(marks[0]).map((e) => e.event)).toEqual([]);
    expect(anna.events.slice(marks[1]).map((e) => e.event)).toEqual([]);
    expect(store.get(table.gameId)?.facilitatorId).toBe(fran.playerId);
  });

  it('rejects an unjoined socket', async () => {
    await aTable();
    const stranger = await connect();

    expect(await stranger.emit(GAME_EVENTS.facilitatorTransfer, { playerId: 'x' })).toEqual(
      failedAck('FORBIDDEN'),
    );
  });
});
