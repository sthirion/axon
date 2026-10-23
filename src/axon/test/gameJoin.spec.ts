import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  errorBody,
  failedAck,
  GAME_EVENTS,
  type Ack,
  type ErrorCode,
  type GameJoined,
  type PublicGameState,
} from '@axon/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { attachSocketIo } from '../src/realtime/socketServer.js';
import { GameStore } from '../src/store/gameStore.js';

const MISSING_STATIC_DIR = path.join(os.tmpdir(), 'axon-game-join-spec-no-static');
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const UNKNOWN_GAME_ID = 'A'.repeat(22);
const WELL_FORMED_RANDOM_TOKEN = 'B'.repeat(43);
const BROADCAST_BUDGET_MS = 1000;

type Seen =
  | { kind: 'ack'; data: Ack }
  | { kind: 'joined'; data: GameJoined }
  | { kind: 'state'; data: PublicGameState };

interface TestServer {
  readonly store: GameStore;
  readonly io: SocketServer;
  readonly baseUrl: string;
  close(): Promise<void>;
}

class TestClient {
  readonly seen: Seen[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(readonly socket: Socket) {
    socket.on(GAME_EVENTS.joined, (data: GameJoined) => this.push({ kind: 'joined', data }));
    socket.on(GAME_EVENTS.state, (data: PublicGameState) => this.push({ kind: 'state', data }));
  }

  get states(): PublicGameState[] {
    return this.seen.flatMap((e) => (e.kind === 'state' ? [e.data] : []));
  }

  get joined(): GameJoined[] {
    return this.seen.flatMap((e) => (e.kind === 'joined' ? [e.data] : []));
  }

  join(payload: unknown): Promise<Ack> {
    return new Promise((resolve) => {
      this.socket.emit(GAME_EVENTS.join, payload, (ack: Ack) => {
        this.push({ kind: 'ack', data: ack });
        resolve(ack);
      });
    });
  }

  when<T>(check: () => T | undefined, timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.listeners.delete(run);
      };
      const run = (): void => {
        const value = check();
        if (value !== undefined) {
          cleanup();
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for the expected socket event'));
      }, timeoutMs);
      this.listeners.add(run);
      run();
    });
  }

  stateWhere(predicate: (state: PublicGameState) => boolean): Promise<PublicGameState> {
    return this.when(() => this.states.find(predicate));
  }

  private push(entry: Seen): void {
    this.seen.push(entry);
    [...this.listeners].forEach((listener) => listener());
  }
}

function hasVoter(name: string, connected: boolean) {
  return (state: PublicGameState): boolean =>
    state.voters.some((v) => v.name === name && v.connected === connected);
}

function voterNames(state: PublicGameState): string[] {
  return state.voters.map((v) => v.name);
}

describe('game join over Socket.IO', () => {
  let servers: TestServer[];
  let clients: TestClient[];
  let logged: string[];
  let probeCount: number;
  let server: TestServer;

  async function startServer(store = new GameStore()): Promise<TestServer> {
    const app = createApp({ staticDir: MISSING_STATIC_DIR, store });
    const httpServer = http.createServer(app);
    const io = attachSocketIo(httpServer, store);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    let closed = false;
    const started: TestServer = {
      store,
      io,
      baseUrl,
      async close() {
        if (!closed) {
          closed = true;
          await io.close();
        }
      },
    };
    servers.push(started);
    return started;
  }

  async function connect(target: TestServer = server): Promise<TestClient> {
    const socket = ioClient(target.baseUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    const client = new TestClient(socket);
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return client;
  }

  interface Table {
    readonly gameId: string;
    readonly facilitatorToken: string;
    readonly facilitator: TestClient;
  }

  async function aTable(facilitatorName = 'Sven'): Promise<Table> {
    const { gameId, token } = server.store.createGame(facilitatorName);
    const facilitator = await connect();
    const ack = await facilitator.join({ gameId, token });
    expect(ack).toEqual({ ok: true });
    await facilitator.when(() => facilitator.states[0]);
    return { gameId, facilitatorToken: token, facilitator };
  }

  async function aVoter(gameId: string, name: string) {
    const client = await connect();
    const ack = await client.join({ gameId, name });
    expect(ack).toEqual({ ok: true });
    const joined = await client.when(() => client.joined[0]);
    await client.stateWhere(hasVoter(name.trim(), true));
    return { client, joined, token: joined.token as string };
  }

  // A successful join by a probe proves every earlier broadcast on this connection already arrived.
  async function probe(gameId: string, observer: TestClient) {
    const mark = observer.states.length;
    const name = `Probe${++probeCount}`;
    await aVoter(gameId, name);
    await observer.stateWhere(hasVoter(name, true));
    const newStates = observer.states.slice(mark);
    return { newStates, last: newStates[newStates.length - 1] as PublicGameState, name };
  }

  async function waitForServerSockets(count: number): Promise<void> {
    await vi.waitFor(() => expect(server.io.of('/').sockets.size).toBe(count));
  }

  beforeEach(async () => {
    servers = [];
    clients = [];
    logged = [];
    probeCount = 0;
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      });
    }
    server = await startServer();
  });

  afterEach(async () => {
    clients.forEach((c) => c.socket.disconnect());
    await Promise.all(servers.map((s) => s.close()));
    vi.restoreAllMocks();
  });

  describe('successful join with a name (AC-4)', () => {
    it('game:join with a padded valid name acks ok and joins as a trimmed voter', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const client = await connect();

      // When
      const ack = await client.join({ gameId, name: '  Anna  ' });
      const state = await facilitator.stateWhere(hasVoter('Anna', true));

      // Then
      expect(ack).toEqual({ ok: true });
      expect(state.voters).toHaveLength(1);
      expect(state.facilitator).toEqual({ name: 'Sven', connected: true });
    });

    it('game:join delivers ack, then game:joined, then game:state to the joiner', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();

      // When
      await client.join({ gameId, name: 'Anna' });
      await client.when(() => client.states[0]);

      // Then
      expect(client.seen.map((e) => e.kind)).toEqual(['ack', 'joined', 'state']);
    });

    it('game:joined carries playerId, voter role and a 43-char token only', async () => {
      // Given
      const { gameId } = await aTable();

      // When
      const { joined } = await aVoter(gameId, 'Anna');

      // Then
      expect(Object.keys(joined).sort()).toEqual(['playerId', 'role', 'token']);
      expect(joined.role).toBe('voter');
      expect(joined.token).toMatch(TOKEN_FORMAT);
      expect(joined.playerId).toEqual(expect.any(String));
    });

    it('game:state lists voters in join order and the facilitator separately', async () => {
      // Given
      const { gameId, facilitator } = await aTable();

      // When
      await aVoter(gameId, 'Anna');
      await aVoter(gameId, 'Bob');
      const state = await facilitator.stateWhere(hasVoter('Bob', true));

      // Then
      expect(voterNames(state)).toEqual(['Anna', 'Bob']);
      expect(state.facilitator).toEqual({ name: 'Sven', connected: true });
      expect(Object.keys(state).sort()).toEqual([
        'facilitator',
        'gameId',
        'phase',
        'story',
        'voters',
      ]);
      expect(state.phase).toBe('waiting');
      expect(state.story).toBeNull();
      expect(state.gameId).toBe(gameId);
    });

    it('game:join with a 30 code point emoji name acks ok', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();

      // When
      const ack = await client.join({ gameId, name: '😀'.repeat(30) });

      // Then
      expect(ack).toEqual({ ok: true });
    });

    it('game:join with an HTML name stores and broadcasts it as literal text', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const name = '<img src=x onerror=alert(1)>';

      // When
      await aVoter(gameId, name);
      const state = await facilitator.stateWhere(hasVoter(name, true));

      // Then
      expect(voterNames(state)).toEqual([name]);
    });
  });

  describe('invalid name (AC-4)', () => {
    const invalidNames: ReadonlyArray<readonly [string, unknown]> = [
      ['an empty', ''],
      ['a whitespace-only', '   '],
      ['a 31 character', '1234567890123456789012345678901'],
      ['a 31 code point emoji', '😀'.repeat(31)],
      ['a tab-containing', 'tab\tname'],
      ['a newline-containing', 'a\nb'],
      ['a bell-containing', 'a\u0007b'],
      ['a numeric', 42],
      ['a null', null],
      ['an object', {}],
    ];

    it.each(invalidNames)(
      'game:join with %s name acks INVALID_NAME, adds nobody and broadcasts nothing',
      async (_label, name) => {
        // Given
        const { gameId, facilitator } = await aTable();
        const client = await connect();

        // When
        const ack = await client.join({ gameId, name });
        const probed = await probe(gameId, facilitator);

        // Then
        expect(ack).toEqual(failedAck('INVALID_NAME'));
        expect(client.states).toHaveLength(0);
        expect(probed.newStates).toHaveLength(1);
        expect(voterNames(probed.last)).toEqual([probed.name]);
      },
    );
  });

  describe('name already taken (AC-4)', () => {
    it.each([
      ['anna', 'anna'],
      ['ANNA', 'ANNA'],
      ['padded ANNA', '  ANNA '],
      ['the facilitator name in lower case', 'sven'],
      ['the facilitator name', 'Sven'],
    ])('game:join with %s acks NAME_TAKEN and broadcasts nothing', async (_label, name) => {
      // Given
      const { gameId, facilitator } = await aTable();
      await aVoter(gameId, 'Anna');
      const client = await connect();

      // When
      const ack = await client.join({ gameId, name });
      const probed = await probe(gameId, facilitator);

      // Then
      expect(ack).toEqual(failedAck('NAME_TAKEN'));
      expect(client.states).toHaveLength(0);
      expect(probed.newStates).toHaveLength(1);
      expect(voterNames(probed.last)).toEqual(['Anna', probed.name]);
    });

    it('game:join with a differently composed unicode name acks NAME_TAKEN', async () => {
      // Given
      const { gameId } = await aTable();
      await aVoter(gameId, 'Am\u00e9lie');
      const client = await connect();

      // When
      const ack = await client.join({ gameId, name: 'Ame\u0301lie' });

      // Then
      expect(ack).toEqual(failedAck('NAME_TAKEN'));
    });

    it('game:join succeeds with a changed name after a NAME_TAKEN rejection on the same socket', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      await aVoter(gameId, 'Anna');
      const client = await connect();
      await client.join({ gameId, name: 'anna' });

      // When
      const ack = await client.join({ gameId, name: 'Anna B' });
      const state = await facilitator.stateWhere(hasVoter('Anna B', true));

      // Then
      expect(ack).toEqual({ ok: true });
      expect(voterNames(state)).toEqual(['Anna', 'Anna B']);
    });

    it('game:join with a name taken only in another game succeeds', async () => {
      // Given
      await aTable('Sven');
      const other = await aTable('Olga');
      const client = await connect();

      // When
      const ack = await client.join({ gameId: other.gameId, name: 'sven' });

      // Then
      expect(ack).toEqual({ ok: true });
    });
  });

  describe('invalid payloads (AC-11)', () => {
    const rows: ReadonlyArray<{
      label: string;
      payload: (gameId: string) => unknown;
      code: ErrorCode;
    }> = [
      { label: 'a string', payload: () => 'hello', code: 'INVALID_PAYLOAD' },
      { label: 'null', payload: () => null, code: 'INVALID_PAYLOAD' },
      { label: 'undefined', payload: () => undefined, code: 'INVALID_PAYLOAD' },
      { label: 'an array', payload: () => [], code: 'INVALID_PAYLOAD' },
      {
        label: 'a numeric gameId',
        payload: () => ({ gameId: 123, name: 'Anna' }),
        code: 'INVALID_PAYLOAD',
      },
      { label: 'a missing gameId', payload: () => ({ name: 'Anna' }), code: 'INVALID_PAYLOAD' },
      {
        label: 'a short gameId',
        payload: () => ({ gameId: 'abc', name: 'Anna' }),
        code: 'GAME_NOT_FOUND',
      },
      {
        label: 'an empty gameId',
        payload: () => ({ gameId: '', name: 'Anna' }),
        code: 'GAME_NOT_FOUND',
      },
      {
        label: 'a script gameId',
        payload: () => ({ gameId: '<script>', name: 'Anna' }),
        code: 'GAME_NOT_FOUND',
      },
      {
        label: 'an unknown 22-char gameId',
        payload: () => ({ gameId: UNKNOWN_GAME_ID, name: 'Anna' }),
        code: 'GAME_NOT_FOUND',
      },
      {
        label: 'a numeric token',
        payload: (gameId) => ({ gameId, token: 5 }),
        code: 'INVALID_TOKEN',
      },
      {
        label: 'a null token',
        payload: (gameId) => ({ gameId, token: null }),
        code: 'INVALID_TOKEN',
      },
      {
        label: 'a short token',
        payload: (gameId) => ({ gameId, token: 'short' }),
        code: 'INVALID_TOKEN',
      },
      {
        label: 'a token with illegal characters',
        payload: (gameId) => ({ gameId, token: '!'.repeat(43) }),
        code: 'INVALID_TOKEN',
      },
      {
        label: 'a well-formed unknown token',
        payload: (gameId) => ({ gameId, token: WELL_FORMED_RANDOM_TOKEN }),
        code: 'INVALID_TOKEN',
      },
      { label: 'neither token nor name', payload: (gameId) => ({ gameId }), code: 'INVALID_NAME' },
      {
        label: 'a bad token and a valid name',
        payload: (gameId) => ({ gameId, token: 5, name: 'Anna' }),
        code: 'INVALID_TOKEN',
      },
    ];

    it.each(rows)(
      'game:join with $label acks $code with a fixed message and broadcasts nothing',
      async ({ payload, code }) => {
        // Given
        const { gameId, facilitator } = await aTable();
        const client = await connect();

        // When
        const ack = await client.join(payload(gameId));
        const probed = await probe(gameId, facilitator);

        // Then
        expect(ack).toEqual({ ok: false, ...errorBody(code) });
        expect(client.states).toHaveLength(0);
        expect(client.joined).toHaveLength(0);
        expect(probed.newStates).toHaveLength(1);
        expect(voterNames(probed.last)).toEqual([probed.name]);
      },
    );

    it('game:join with an invalid payload keeps the socket usable for a valid join', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();
      await client.join('hello');

      // When
      const ack = await client.join({ gameId, name: 'Anna' });

      // Then
      expect(ack).toEqual({ ok: true });
    });

    it('game:join without an ack callback does not crash and the next join succeeds', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();
      client.socket.emit(GAME_EVENTS.join, 'hello');
      client.socket.emit(GAME_EVENTS.join, { gameId, name: '' });
      client.socket.emit(GAME_EVENTS.join, undefined);

      // When
      const other = await connect();
      const ack = await other.join({ gameId, name: 'Anna' });

      // Then
      expect(ack).toEqual({ ok: true });
      expect(client.socket.connected).toBe(true);
      expect(client.states).toHaveLength(0);
    });

    it('game:join with a valid name and no ack callback still joins the player', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const client = await connect();

      // When
      client.socket.emit(GAME_EVENTS.join, { gameId, name: 'Anna' });
      const state = await facilitator.stateWhere(hasVoter('Anna', true));

      // Then
      expect(voterNames(state)).toEqual(['Anna']);
    });

    it('game:join with __proto__ and extra fields strips them', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();
      const payload = JSON.parse(
        `{"gameId":"${gameId}","name":"Eve","__proto__":{"role":"facilitator"},"extra":1}`,
      ) as unknown;

      // When
      const ack = await client.join(payload);
      const joined = await client.when(() => client.joined[0]);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(joined.role).toBe('voter');
    });
  });

  describe('second join on the same socket (AC-11)', () => {
    it('game:join after a successful join acks ALREADY_JOINED and changes nothing', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const { client } = await aVoter(gameId, 'Anna');
      const mark = client.states.length;

      // When
      const sameName = await client.join({ gameId, name: 'Anna' });
      const otherName = await client.join({ gameId, name: 'Bob' });
      const probed = await probe(gameId, facilitator);
      await client.stateWhere(hasVoter(probed.name, true));

      // Then
      expect(sameName).toEqual(failedAck('ALREADY_JOINED'));
      expect(otherName).toEqual(failedAck('ALREADY_JOINED'));
      expect(probed.newStates).toHaveLength(1);
      expect(voterNames(probed.last)).toEqual(['Anna', probed.name]);
      expect(client.states.slice(mark)).toHaveLength(1);
    });

    it('game:join for another game after a successful join acks ALREADY_JOINED', async () => {
      // Given
      const { gameId } = await aTable();
      const other = await aTable('Olga');
      const { client } = await aVoter(gameId, 'Anna');

      // When
      const ack = await client.join({ gameId: other.gameId, name: 'Anna' });

      // Then
      expect(ack).toEqual(failedAck('ALREADY_JOINED'));
    });
  });

  describe('rejoin with a token (AC-6)', () => {
    it('game:join with a voter token restores the same playerId, role and name without a new token', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const first = await aVoter(gameId, 'Anna');
      first.client.socket.disconnect();
      await facilitator.stateWhere(hasVoter('Anna', false));
      const returning = await connect();

      // When
      const ack = await returning.join({ gameId, token: first.token });
      const joined = await returning.when(() => returning.joined[0]);
      const state = await returning.when(() => returning.states[0]);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(joined.playerId).toBe(first.joined.playerId);
      expect(joined.role).toBe('voter');
      expect(joined).not.toHaveProperty('token');
      expect(state.voters).toEqual([
        { id: first.joined.playerId, name: 'Anna', connected: true, hasVoted: false },
      ]);
      expect(returning.seen.map((e) => e.kind)).toEqual(['ack', 'joined', 'state']);
    });

    it('game:join with a voter token does not create a duplicate player', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const first = await aVoter(gameId, 'Anna');
      const returning = await connect();

      // When
      await returning.join({ gameId, token: first.token });
      const probed = await probe(gameId, facilitator);

      // Then
      expect(voterNames(probed.last)).toEqual(['Anna', probed.name]);
    });

    it('game:join with the facilitator token restores the facilitator role', async () => {
      // Given
      const { gameId, facilitatorToken, facilitator } = await aTable();
      const original = facilitator.states[0] as PublicGameState;
      facilitator.socket.disconnect();
      const returning = await connect();

      // When
      const ack = await returning.join({ gameId, token: facilitatorToken });
      const joined = await returning.when(() => returning.joined[0]);
      const state = await returning.when(() => returning.states[0]);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(joined.role).toBe('facilitator');
      expect(joined).not.toHaveProperty('token');
      expect(state.facilitator).toEqual({ name: 'Sven', connected: true });
      expect(state.voters).toEqual(original.voters);
    });

    it('game:join with a token and a role field ignores the role', async () => {
      // Given
      const { gameId } = await aTable();
      const first = await aVoter(gameId, 'Anna');
      const returning = await connect();

      // When
      await returning.join({ gameId, token: first.token, role: 'facilitator' });
      const joined = await returning.when(() => returning.joined[0]);

      // Then
      expect(joined.role).toBe('voter');
    });

    it('game:join with a token from game A for game B acks INVALID_TOKEN and changes neither game', async () => {
      // Given
      const a = await aTable('Sven');
      const b = await aTable('Olga');
      const anna = await aVoter(a.gameId, 'Anna');
      const intruder = await connect();

      // When
      const withVoterToken = await intruder.join({ gameId: b.gameId, token: anna.token });
      const withFacilitatorToken = await intruder.join({
        gameId: b.gameId,
        token: a.facilitatorToken,
      });
      const probedA = await probe(a.gameId, a.facilitator);
      const probedB = await probe(b.gameId, b.facilitator);

      // Then
      expect(withVoterToken).toEqual(failedAck('INVALID_TOKEN'));
      expect(withFacilitatorToken).toEqual(failedAck('INVALID_TOKEN'));
      expect(intruder.states).toHaveLength(0);
      expect(voterNames(probedA.last)).toEqual(['Anna', probedA.name]);
      expect(probedB.newStates).toHaveLength(1);
      expect(voterNames(probedB.last)).toEqual([probedB.name]);
    });

    it('game:join with an unknown well-formed token acks INVALID_TOKEN and can still join by name', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();
      const rejected = await client.join({ gameId, token: WELL_FORMED_RANDOM_TOKEN });

      // When
      const ack = await client.join({ gameId, name: 'Anna' });

      // Then
      expect(rejected).toEqual(failedAck('INVALID_TOKEN'));
      expect(ack).toEqual({ ok: true });
    });
  });

  describe('role and authorization (AC-6)', () => {
    it('game:join with a role field in the name payload joins as a voter and keeps the facilitator', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const client = await connect();

      // When
      const ack = await client.join({ gameId, name: 'Eve', role: 'facilitator' });
      const joined = await client.when(() => client.joined[0]);
      const state = await facilitator.stateWhere(hasVoter('Eve', true));

      // Then
      expect(ack).toEqual({ ok: true });
      expect(joined.role).toBe('voter');
      expect(state.facilitator.name).toBe('Sven');
      expect(voterNames(state)).toEqual(['Eve']);
    });

    it('game:join with the facilitator name as a voter acks NAME_TAKEN', async () => {
      // Given
      const { gameId } = await aTable('Sven');
      const client = await connect();

      // When
      const ack = await client.join({ gameId, name: 'SVEN' });

      // Then
      expect(ack).toEqual(failedAck('NAME_TAKEN'));
    });
  });

  describe('broadcast to the room (AC-5)', () => {
    it('game:join delivers game:state listing the new voter to all 20 sockets within 1000 ms', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const existing = await Promise.all(
        Array.from({ length: 18 }, async (_unused, i) => {
          const client = await connect();
          expect(await client.join({ gameId, name: `Voter${i + 1}` })).toEqual({ ok: true });
          return client;
        }),
      );
      const zoe = await connect();
      const everyone = [facilitator, ...existing, zoe];

      // When
      const ack = await zoe.join({ gameId, name: 'Zoe' });
      const startedAt = performance.now();
      const states = await Promise.all(everyone.map((c) => c.stateWhere(hasVoter('Zoe', true))));
      const elapsedMs = performance.now() - startedAt;

      // Then
      expect(ack).toEqual({ ok: true });
      expect(everyone).toHaveLength(20);
      expect(states).toHaveLength(20);
      expect(elapsedMs).toBeLessThan(BROADCAST_BUDGET_MS);
    });

    it('game:state reaches the joiner too', async () => {
      // Given
      const { gameId } = await aTable();
      const client = await connect();

      // When
      await client.join({ gameId, name: 'Anna' });
      const state = await client.stateWhere(hasVoter('Anna', true));

      // Then
      expect(state.gameId).toBe(gameId);
    });

    it('sockets in another game receive no game:state when a voter joins this game', async () => {
      // Given
      const a = await aTable('Sven');
      const b = await aTable('Olga');
      const markB = b.facilitator.states.length;

      // When
      await aVoter(a.gameId, 'Anna');
      const probedB = await probe(b.gameId, b.facilitator);

      // Then
      expect(b.facilitator.states.slice(markB)).toHaveLength(1);
      expect(probedB.newStates.every((s) => s.gameId === b.gameId)).toBe(true);
      expect(voterNames(probedB.last)).toEqual([probedB.name]);
    });

    it('a failed join broadcasts game:state to nobody in any game', async () => {
      // Given
      const a = await aTable('Sven');
      const b = await aTable('Olga');
      await aVoter(a.gameId, 'Anna');
      const rejected = await connect();
      const marks = [a.facilitator.states.length, b.facilitator.states.length];

      // When
      const ack = await rejected.join({ gameId: a.gameId, name: 'anna' });
      const probedA = await probe(a.gameId, a.facilitator);
      const probedB = await probe(b.gameId, b.facilitator);

      // Then
      expect(ack).toEqual(failedAck('NAME_TAKEN'));
      expect(a.facilitator.states.slice(marks[0])).toHaveLength(1);
      expect(b.facilitator.states.slice(marks[1])).toHaveLength(1);
      expect(probedA.newStates).toHaveLength(1);
      expect(probedB.newStates).toHaveLength(1);
    });
  });

  describe('online and offline status (AC-8)', () => {
    it('last socket closing broadcasts connected:false to the others within 1000 ms and keeps the player listed', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const anna = await aVoter(gameId, 'Anna');
      const bob = await aVoter(gameId, 'Bob');

      // When
      anna.client.socket.disconnect();
      const startedAt = performance.now();
      const [forFacilitator, forBob] = await Promise.all([
        facilitator.stateWhere(hasVoter('Anna', false)),
        bob.client.stateWhere(hasVoter('Anna', false)),
      ]);
      const elapsedMs = performance.now() - startedAt;

      // Then
      expect(elapsedMs).toBeLessThan(BROADCAST_BUDGET_MS);
      expect(voterNames(forFacilitator)).toEqual(['Anna', 'Bob']);
      expect(forBob.voters.find((v) => v.name === 'Bob')?.connected).toBe(true);
    });

    it('a facilitator disconnect broadcasts facilitator connected:false', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const anna = await aVoter(gameId, 'Anna');

      // When
      facilitator.socket.disconnect();
      const state = await anna.client.stateWhere((s) => !s.facilitator.connected);

      // Then
      expect(state.facilitator.name).toBe('Sven');
    });

    it('a player reconnecting with the token broadcasts connected:true again', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const anna = await aVoter(gameId, 'Anna');
      anna.client.socket.disconnect();
      await facilitator.stateWhere(hasVoter('Anna', false));
      const returning = await connect();
      const mark = facilitator.states.length;

      // When
      await returning.join({ gameId, token: anna.token });
      const state = await facilitator.when(() =>
        facilitator.states.slice(mark).find(hasVoter('Anna', true)),
      );

      // Then
      expect(state.voters).toHaveLength(1);
    });

    it('two sockets with one token: the second gets no token and closing one keeps the player online', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const first = await aVoter(gameId, 'Anna');
      const second = await connect();

      // When
      const statesBeforeSecond = facilitator.states.length;
      const ack = await second.join({ gameId, token: first.token });
      const secondJoined = await second.when(() => second.joined[0]);
      await second.when(() => second.states[0]);
      await facilitator.when(() =>
        facilitator.states.length > statesBeforeSecond ? true : undefined,
      );
      const socketsBefore = server.io.of('/').sockets.size;
      const mark = facilitator.states.length;
      first.client.socket.disconnect();
      await waitForServerSockets(socketsBefore - 1);
      const probed = await probe(gameId, facilitator);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(secondJoined.playerId).toBe(first.joined.playerId);
      expect(secondJoined).not.toHaveProperty('token');
      expect(facilitator.states.slice(mark)).toHaveLength(1);
      expect(probed.last.voters.filter((v) => v.name === 'Anna')).toEqual([
        { id: first.joined.playerId, name: 'Anna', connected: true, hasVoted: false },
      ]);
    });

    it('closing the second of two sockets with one token marks the player offline', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const first = await aVoter(gameId, 'Anna');
      const second = await connect();
      await second.join({ gameId, token: first.token });
      await second.when(() => second.states[0]);
      first.client.socket.disconnect();
      await waitForServerSockets(2);

      // When
      second.socket.disconnect();
      const state = await facilitator.stateWhere(hasVoter('Anna', false));

      // Then
      expect(voterNames(state)).toEqual(['Anna']);
    });

    it('a socket that never joined disconnecting broadcasts nothing', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const lurker = await connect();
      await waitForServerSockets(2);
      const mark = facilitator.states.length;

      // When
      lurker.socket.disconnect();
      await waitForServerSockets(1);
      const probed = await probe(gameId, facilitator);

      // Then
      expect(facilitator.states.slice(mark)).toHaveLength(1);
      expect(probed.newStates).toHaveLength(1);
    });

    it('a socket whose join was rejected disconnecting broadcasts nothing', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const rejected = await connect();
      await rejected.join({ gameId, name: '' });
      const mark = facilitator.states.length;

      // When
      rejected.socket.disconnect();
      await waitForServerSockets(1);
      const probed = await probe(gameId, facilitator);

      // Then
      expect(facilitator.states.slice(mark)).toHaveLength(1);
      expect(probed.newStates).toHaveLength(1);
    });
  });

  describe('cookies (AC-2)', () => {
    it('GET /socket.io polling handshake returns no Set-Cookie header', async () => {
      // Given
      const target = '/socket.io/?EIO=4&transport=polling';

      // When
      const res = await request(server.baseUrl).get(target);

      // Then
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('restart (AC-10)', () => {
    it('game:join with an old token against a fresh store acks GAME_NOT_FOUND and exists is false', async () => {
      // Given
      const { gameId, facilitator } = await aTable();
      const anna = await aVoter(gameId, 'Anna');
      await facilitator.stateWhere(hasVoter('Anna', true));
      clients.forEach((c) => c.socket.disconnect());
      await server.close();
      const restarted = await startServer(new GameStore());
      const returning = await connect(restarted);

      // When
      const ack = await returning.join({ gameId, token: anna.token });
      const exists = await request(restarted.baseUrl).get(`/api/games/${gameId}/exists`);

      // Then
      expect(ack).toEqual(failedAck('GAME_NOT_FOUND'));
      expect(exists.body).toEqual({ exists: false });
      expect(returning.states).toHaveLength(0);
    });
  });

  describe('secrecy (AC-9)', () => {
    it('no received payload contains another player token, a token hash, a socket id or internals', async () => {
      // Given
      const { gameId, facilitatorToken, facilitator } = await aTable();
      const anna = await aVoter(gameId, 'Anna');
      const bob = await aVoter(gameId, 'Bob');
      const annaSecondTab = await connect();
      await annaSecondTab.join({ gameId, token: anna.token });
      await annaSecondTab.when(() => annaSecondTab.states[0]);
      const rejected = await connect();
      await rejected.join({ gameId, name: 'anna' });
      anna.client.socket.disconnect();
      await waitForServerSockets(4);
      const everyone = [facilitator, anna.client, bob.client, annaSecondTab, rejected];
      const tokens = [facilitatorToken, anna.token, bob.token];
      const hashes = tokens.flatMap((t) => {
        const digest = createHash('sha256').update(t).digest();
        return [digest.toString('hex'), digest.toString('base64url'), digest.toString('base64')];
      });
      const socketIds = everyone.map((c) => c.socket.id as string);
      const forbidden = [...tokens, ...hashes, ...socketIds, 'tokenHash', 'socketIds'];

      // When
      const received = everyone.map((c) =>
        JSON.stringify(c.seen.filter((e) => !(e.kind === 'joined' && e.data.token !== undefined))),
      );

      // Then
      for (const text of received) {
        for (const secret of forbidden) {
          expect(text).not.toContain(secret);
        }
      }
      expect(facilitator.joined.every((j) => j.token === undefined)).toBe(true);
      expect(anna.joined.token).not.toBe(bob.token);
    });

    it('server logs contain no token and no player name', async () => {
      // Given
      const created = await request(server.baseUrl).post('/api/games').send({ name: 'Quentin Q' });
      const { gameId, token: facilitatorToken } = created.body as { gameId: string; token: string };
      const facilitator = await connect();
      await facilitator.join({ gameId, token: facilitatorToken });
      const anna = await aVoter(gameId, 'Zelda Zed');
      const rejected = await connect();

      // When
      await rejected.join({ gameId, name: 'zelda zed' });
      await rejected.join({ gameId, token: WELL_FORMED_RANDOM_TOKEN });
      await rejected.join({ gameId: 'nope', name: 'Mallory M' });
      await rejected.join('Mallory M');
      anna.client.socket.disconnect();
      await facilitator.stateWhere(hasVoter('Zelda Zed', false));
      await request(server.baseUrl)
        .post('/api/games')
        .send('{not json Mallory M')
        .set('Content-Type', 'application/json');
      const output = logged.join('\n');

      // Then
      expect(logged.length).toBeGreaterThan(0);
      for (const secret of [facilitatorToken, anna.token, WELL_FORMED_RANDOM_TOKEN]) {
        expect(output).not.toContain(secret);
      }
      for (const name of ['Quentin', 'Zelda', 'zelda', 'Mallory']) {
        expect(output).not.toContain(name);
      }
    });
  });
});
