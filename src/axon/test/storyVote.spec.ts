import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  DECK,
  failedAck,
  GAME_EVENTS,
  publicGameStateSchema,
  voteMineSchema,
  type Ack,
  type Card,
  type ErrorCode,
  type GameJoined,
  type PublicGameState,
} from '@axon/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { attachSocketIo } from '../src/realtime/socketServer.js';
import { GameStore } from '../src/store/gameStore.js';

const MISSING_STATIC_DIR = path.join(os.tmpdir(), 'axon-story-vote-spec-no-static');
const BROADCAST_BUDGET_MS = 1000;
const ACK = 'ack';
const CARD_KEYS = ['card', 'vote', 'votes', 'value'];

interface Recorded {
  readonly event: string;
  readonly payload: unknown;
}

interface Voter {
  readonly client: Client;
  readonly name: string;
  readonly token: string;
  readonly playerId: string;
}

interface Table {
  readonly gameId: string;
  readonly facilitatorToken: string;
  readonly facilitator: Client;
}

interface Round {
  readonly table: Table;
  readonly facilitator: Client;
  readonly anna: Voter;
  readonly bob: Voter;
  readonly everyone: Client[];
}

class Client {
  readonly events: Recorded[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(readonly socket: Socket) {
    socket.onAny((event: string, ...args: unknown[]) => this.push({ event, payload: args[0] }));
  }

  get states(): PublicGameState[] {
    return this.payloadsOf(GAME_EVENTS.state, 0) as PublicGameState[];
  }

  get mine(): unknown[] {
    return this.mineSince(0);
  }

  since(mark: number): Recorded[] {
    return this.events.slice(mark);
  }

  kindsSince(mark: number): string[] {
    return this.since(mark).map((e) => e.event);
  }

  mineSince(mark: number): unknown[] {
    return this.payloadsOf(GAME_EVENTS.voteMine, mark).map((p) => (p as { card: unknown }).card);
  }

  emit(event: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve) => {
      this.socket.emit(event, payload, (ack: Ack) => {
        this.push({ event: ACK, payload: ack });
        resolve(ack);
      });
    });
  }

  join(payload: unknown): Promise<Ack> {
    return this.emit(GAME_EVENTS.join, payload);
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

  nextState(mark: number): Promise<PublicGameState> {
    return this.when(
      () => this.since(mark).find((e) => e.event === GAME_EVENTS.state)?.payload as PublicGameState,
    );
  }

  private payloadsOf(event: string, mark: number): unknown[] {
    return this.since(mark).flatMap((e) => (e.event === event ? [e.payload] : []));
  }

  private push(entry: Recorded): void {
    this.events.push(entry);
    [...this.listeners].forEach((listener) => listener());
  }
}

function hasVoter(name: string, connected: boolean) {
  return (state: PublicGameState): boolean =>
    state.voters.some((v) => v.name === name && v.connected === connected);
}

function voterOf(state: PublicGameState, name: string) {
  const voter = state.voters.find((v) => v.name === name);
  if (!voter) {
    throw new Error(`Voter ${name} missing from the state`);
  }
  return voter;
}

function cardKeysIn(value: unknown): string[] {
  const keys = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v.flatMap(keys);
    }
    if (typeof v === 'object' && v !== null) {
      return Object.entries(v).flatMap(([key, nested]) => [key, ...keys(nested)]);
    }
    return [];
  };
  return keys(value).filter((k) => CARD_KEYS.includes(k));
}

function assertStatesArePublic(client: Client): void {
  client.states.forEach((state) => {
    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
    // After the reveal cards and results are public by design; before it nothing may be.
    if (state.phase !== 'revealed') {
      expect(cardKeysIn(state)).toEqual([]);
    }
  });
}

describe('story and vote over Socket.IO', () => {
  let servers: SocketServer[];
  let clients: Client[];
  let logged: string[];
  let probeCount: number;
  let server: { store: GameStore; io: SocketServer; baseUrl: string };

  async function startServer() {
    const store = new GameStore();
    const app = createApp({ staticDir: MISSING_STATIC_DIR, store });
    const httpServer = http.createServer(app);
    const io = attachSocketIo(httpServer, store);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    servers.push(io);
    return { store, io, baseUrl: `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}` };
  }

  async function connect(): Promise<Client> {
    const socket = ioClient(server.baseUrl, {
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

  async function aTable(facilitatorName = 'Fran'): Promise<Table> {
    const { gameId, token } = server.store.createGame(facilitatorName);
    const facilitator = await connect();
    expect(await facilitator.join({ gameId, token })).toEqual({ ok: true });
    await facilitator.when(() => facilitator.states[0]);
    return { gameId, facilitatorToken: token, facilitator };
  }

  async function aVoter(table: Table, name: string): Promise<Voter> {
    const client = await connect();
    expect(await client.join({ gameId: table.gameId, name })).toEqual({ ok: true });
    const joined = await client.when(
      () => client.events.find((e) => e.event === GAME_EVENTS.joined)?.payload as GameJoined,
    );
    await client.stateWhere(hasVoter(name, true));
    return { client, name, token: joined.token as string, playerId: joined.playerId };
  }

  // A second tab, or a rejoin after the first socket closed: same token, new socket.
  async function aTabOf(table: Table, voter: Voter): Promise<Client> {
    const client = await connect();
    expect(await client.join({ gameId: table.gameId, token: voter.token })).toEqual({ ok: true });
    await client.when(() => client.states[0]);
    return client;
  }

  async function aRound({ voting = true } = {}): Promise<Round> {
    const table = await aTable();
    const anna = await aVoter(table, 'Anna');
    const bob = await aVoter(table, 'Bob');
    const round: Round = {
      table,
      facilitator: table.facilitator,
      anna,
      bob,
      everyone: [table.facilitator, anna.client, bob.client],
    };
    await Promise.all(round.everyone.map((c) => c.stateWhere(hasVoter('Bob', true))));
    if (voting) {
      await startVoting(round);
    }
    return round;
  }

  async function startVoting(
    round: Round,
    title = 'Login page',
    url = 'https://example.com/story',
  ): Promise<void> {
    const ack = await round.facilitator.emit(GAME_EVENTS.storySet, { title, url });
    expect(ack).toEqual({ ok: true });
    await Promise.all(round.everyone.map((c) => c.stateWhere((s) => s.phase === 'voting')));
  }

  async function cast(client: Client, card: Card | null): Promise<void> {
    expect(await client.emit(GAME_EVENTS.voteCast, { card })).toEqual({ ok: true });
  }

  async function castAndSync(round: Round, voter: Voter, card: Card | null): Promise<void> {
    const marks = round.everyone.map((c) => c.events.length);
    await cast(voter.client, card);
    await Promise.all(round.everyone.map((c, i) => c.nextState(marks[i] as number)));
  }

  // A joining probe proves every earlier broadcast already reached the observers; returns the probe's view.
  async function settle(table: Table, observers: Client[]): Promise<PublicGameState> {
    const name = `Probe${++probeCount}`;
    await aVoter(table, name);
    const seen = await Promise.all(
      [table.facilitator, ...observers].map((o) => o.stateWhere(hasVoter(name, true))),
    );
    return seen[0] as PublicGameState;
  }

  // Proves the action sent nothing to the watchers beyond the probe's own game:state.
  async function expectSilent<T>(
    table: Table,
    watchers: Client[],
    action: () => Promise<T>,
  ): Promise<{ result: T; state: PublicGameState }> {
    const marks = watchers.map((w) => w.events.length);
    const result = await action();
    const state = await settle(table, watchers);
    watchers.forEach((w, i) => {
      const kinds = w.kindsSince(marks[i] as number).filter((k) => k !== ACK);
      expect(kinds).toEqual([GAME_EVENTS.state]);
    });
    return { result, state };
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
    clients.forEach(assertStatesArePublic);
    clients.forEach((c) => c.socket.disconnect());
    await Promise.all(servers.map((io) => io.close()));
    vi.restoreAllMocks();
  });

  describe('story:set (AC-1, AC-2, AC-3)', () => {
    it('story:set with title and link acks ok, then broadcasts voting state to every socket within 1s', async () => {
      // Given
      const { facilitator, anna, bob, everyone } = await aRound({ voting: false });
      const marks = everyone.map((c) => c.events.length);

      // When
      const started = performance.now();
      const ack = await facilitator.emit(GAME_EVENTS.storySet, {
        title: 'Login page',
        url: 'https://example.com/1',
      });
      const states = await Promise.all(everyone.map((c, i) => c.nextState(marks[i] as number)));
      const elapsed = performance.now() - started;

      // Then
      expect(ack).toEqual({ ok: true });
      for (const state of states) {
        expect(state.phase).toBe('voting');
        expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/1' });
      }
      expect(elapsed).toBeLessThan(BROADCAST_BUDGET_MS);
      expect(facilitator.kindsSince(marks[0] as number)).toEqual([ACK, GAME_EVENTS.state]);
      expect(anna.client.kindsSince(marks[1] as number)).toEqual([GAME_EVENTS.state]);
      expect(bob.client.kindsSince(marks[2] as number)).toEqual([GAME_EVENTS.state]);
    });

    it.each([
      ['no url', { title: 'Login page' }],
      ['a blank url', { title: 'Login page', url: '   ' }],
      ['an empty url', { title: 'Login page', url: '' }],
      ['a null url', { title: 'Login page', url: null }],
      ['text that is not a URL', { title: 'Login page', url: 'not a url' }],
    ])(
      'story:set with %s acks INVALID_STORY, because the link is required',
      async (_label, payload) => {
        // Given
        const round = await aRound({ voting: false });

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.facilitator.emit(GAME_EVENTS.storySet, payload),
        );

        // Then
        expect(result).toEqual(failedAck('INVALID_STORY'));
        expect(state.phase).toBe('waiting');
        expect(state.story).toBeNull();
      },
    );

    it.each([
      ['a single code point', 'A', 'A'],
      ['200 code points', 'a'.repeat(200), 'a'.repeat(200)],
      ['200 astral emoji', '😀'.repeat(200), '😀'.repeat(200)],
      ['surrounding spaces', '  Login  ', 'Login'],
      ['a decomposed accent', 'e\u0301', '\u00e9'],
    ])(
      'story:set with %s title is accepted and stored trimmed and NFC',
      async (_l, title, stored) => {
        // Given
        const { facilitator, anna } = await aRound({ voting: false });

        // When
        const ack = await facilitator.emit(GAME_EVENTS.storySet, {
          title,
          url: 'https://example.com/story',
        });
        const state = await anna.client.stateWhere((s) => s.phase === 'voting');

        // Then
        expect(ack).toEqual({ ok: true });
        expect(state.story?.title).toBe(stored);
      },
    );

    const rejectedTitles: ReadonlyArray<readonly [string, unknown]> = [
      ['a 201 code point', 'a'.repeat(201)],
      ['a 201 emoji', '😀'.repeat(201)],
      ['a newline-containing', 'Line\nbreak'],
      ['a tab-containing', 'Tab\tinside'],
      ['a NUL-containing', 'Nul\u0000inside'],
      ['a numeric', 42],
      ['a null', null],
      ['an object', {}],
    ];

    it.each(rejectedTitles)(
      'story:set with %s title acks INVALID_STORY, broadcasts nothing and keeps waiting',
      async (_label, title) => {
        // Given
        const round = await aRound({ voting: false });

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.facilitator.emit(GAME_EVENTS.storySet, { title, url: 'https://example.com/story' }),
        );

        // Then
        expect(result).toEqual(failedAck('INVALID_STORY'));
        expect(state.phase).toBe('waiting');
        expect(state.story).toBeNull();
      },
    );

    const acceptedUrls: ReadonlyArray<readonly [string, string, string]> = [
      [
        'an https',
        'https://dev.azure.com/org/p/_workitems/edit/1',
        'https://dev.azure.com/org/p/_workitems/edit/1',
      ],
      ['an upper-case HTTP', 'HTTP://Example.com', 'HTTP://Example.com'],
      ['a padded', '  https://example.com/x  ', 'https://example.com/x'],
      [
        'a 2048-unit',
        `https://example.com/${'a'.repeat(2028)}`,
        `https://example.com/${'a'.repeat(2028)}`,
      ],
    ];

    it.each(acceptedUrls)(
      'story:set with %s link is accepted and stored trimmed',
      async (_l, url, stored) => {
        // Given
        const { facilitator } = await aRound({ voting: false });

        // When
        const ack = await facilitator.emit(GAME_EVENTS.storySet, { title: 'T', url });
        const state = await facilitator.stateWhere((s) => s.phase === 'voting');

        // Then
        expect(ack).toEqual({ ok: true });
        expect(state.story).toEqual({ title: 'T', url: stored });
      },
    );

    const rejectedUrls: ReadonlyArray<readonly [string, unknown]> = [
      ['javascript:', 'javascript:alert(1)'],
      ['padded mixed-case javascript:', ' JavaScript:alert(1) '],
      ['data:', 'data:text/html,x'],
      ['vbscript:', 'vbscript:x'],
      ['file:', 'file:///etc/passwd'],
      ['ftp:', 'ftp://host/x'],
      ['a relative path', '/relative/path'],
      ['a bare word', 'relative'],
      ['a protocol-relative', '//evil.example/x'],
      ['a host-less', 'https://'],
      ['a whitespace-containing', 'http://exa mple.com'],
      ['a control-character-containing', 'https://example.com/\u0007'],
      ['a 2049-unit', `https://example.com/${'a'.repeat(2029)}`],
      ['a null', null],
      ['a numeric', 42],
    ];

    it.each(rejectedUrls)(
      'story:set with %s link acks INVALID_STORY, broadcasts nothing and keeps the state',
      async (_label, url) => {
        // Given
        const round = await aRound({ voting: false });

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.facilitator.emit(GAME_EVENTS.storySet, { title: 'T', url }),
        );

        // Then
        expect(result).toEqual(failedAck('INVALID_STORY'));
        expect(state.phase).toBe('waiting');
        expect(state.story).toBeNull();
      },
    );

    it('story:set strips unknown keys and keeps only title and url', async () => {
      // Given
      const { facilitator } = await aRound({ voting: false });

      // When
      await facilitator.emit(GAME_EVENTS.storySet, {
        title: 'T',
        card: 5,
        extra: 'x',
        url: 'https://example.com/story',
      });
      const state = await facilitator.stateWhere((s) => s.phase === 'voting');

      // Then
      expect(state.story).toEqual({ title: 'T', url: 'https://example.com/story' });
    });

    it('story:set rejection carries the fixed INVALID_STORY message', async () => {
      // Given
      const { facilitator } = await aRound({ voting: false });

      // When
      const ack = await facilitator.emit(GAME_EVENTS.storySet, { title: 'No link' });

      // Then
      expect(ack).toEqual({
        ok: false,
        code: 'INVALID_STORY',
        message:
          'Enter a link starting with http:// or https://, and an optional title of up to 200 characters.',
      });
    });
  });

  describe('editing the story while voting (AC-5)', () => {
    it('story:set while voting replaces the story, keeps the phase and keeps every vote', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      const marks = round.everyone.map((c) => c.events.length);

      // When
      const ack = await round.facilitator.emit(GAME_EVENTS.storySet, {
        title: 'B',
        url: 'https://example.com/b',
      });
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );
      const secondTab = await aTabOf(round.table, round.anna);

      // Then
      expect(ack).toEqual({ ok: true });
      for (const state of states) {
        expect(state.phase).toBe('voting');
        expect(state.story).toEqual({ title: 'B', url: 'https://example.com/b' });
        expect(voterOf(state, 'Anna').hasVoted).toBe(true);
      }
      expect(secondTab.mine).toEqual([5]);
    });

    it('story:set with another link while voting replaces the link', async () => {
      // Given
      const round = await aRound();
      await round.facilitator.emit(GAME_EVENTS.storySet, {
        title: 'A',
        url: 'https://example.com/a',
      });
      await round.bob.client.stateWhere((s) => s.story?.url === 'https://example.com/a');
      const mark = round.bob.client.events.length;

      // When
      const ack = await round.facilitator.emit(GAME_EVENTS.storySet, {
        title: 'A',
        url: 'https://example.com/story',
      });
      const state = await round.bob.client.nextState(mark);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(state.story).toEqual({ title: 'A', url: 'https://example.com/story' });
      expect(state.story?.url).toBe('https://example.com/story');
    });

    it('invalid story:set while voting acks INVALID_STORY and leaves story and votes unchanged', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 8);

      // When
      const { result, state } = await expectSilent(round.table, round.everyone, () =>
        round.facilitator.emit(GAME_EVENTS.storySet, { title: 'No link' }),
      );

      // Then
      expect(result).toEqual(failedAck('INVALID_STORY'));
      expect(state.phase).toBe('voting');
      expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
      expect(voterOf(state, 'Anna').hasVoted).toBe(true);
    });
  });

  describe('story:set authorization (AC-6)', () => {
    const attempts: ReadonlyArray<readonly [string, boolean, unknown]> = [
      ['a valid payload while waiting', false, { title: 'Mine', url: 'https://example.com/m' }],
      ['a valid payload while voting', true, { title: 'Mine', url: 'https://example.com/m' }],
      ['an invalid title while voting', true, { title: '' }],
      ['an invalid link while waiting', false, { title: 'Mine', url: 'javascript:alert(1)' }],
    ];

    it.each(attempts)(
      'story:set by a voter with %s acks FORBIDDEN, broadcasts nothing and keeps the story',
      async (_label, voting, payload) => {
        // Given
        const round = await aRound({ voting });

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.anna.client.emit(GAME_EVENTS.storySet, payload),
        );

        // Then
        expect(result).toEqual(failedAck('FORBIDDEN'));
        expect(state.phase).toBe(voting ? 'voting' : 'waiting');
        expect(state.story).toEqual(
          voting ? { title: 'Login page', url: 'https://example.com/story' } : null,
        );
      },
    );
  });

  describe('identity spoofing through extra payload fields (AC-6, AC-14)', () => {
    const joinedOf = (client: Client): GameJoined =>
      client.events.find((e) => e.event === GAME_EVENTS.joined)?.payload as GameJoined;

    // JSON.parse creates a real own "__proto__" key, which an object literal would not.
    const withProtoKey = (base: object): unknown =>
      JSON.parse(
        `{"__proto__":{"role":"facilitator","playerId":"x"},${JSON.stringify(base).slice(1)}`,
      );

    it('story:set by a voter claiming role facilitator acks FORBIDDEN, broadcasts nothing and keeps the story', async () => {
      // Given
      const round = await aRound();

      // When
      const { result, state } = await expectSilent(round.table, round.everyone, () =>
        round.anna.client.emit(GAME_EVENTS.storySet, {
          title: 'Hijacked',
          url: 'https://example.com/hijack',
          role: 'facilitator',
        }),
      );

      // Then
      expect(result).toEqual(failedAck('FORBIDDEN'));
      expect(state.phase).toBe('voting');
      expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
    });

    it.each([
      ['the facilitator', (round: Round) => joinedOf(round.facilitator).playerId],
      ['another voter', (round: Round) => round.anna.playerId],
    ])(
      'story:set by a voter carrying the playerId of %s acks FORBIDDEN, broadcasts nothing and keeps the story',
      async (_label, idOf) => {
        // Given
        const round = await aRound({ voting: false });
        const playerId = idOf(round);
        expect(playerId).toEqual(expect.any(String));

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.bob.client.emit(GAME_EVENTS.storySet, {
            title: 'Hijacked',
            playerId,
            url: 'https://example.com/story',
          }),
        );

        // Then
        expect(result).toEqual(failedAck('FORBIDDEN'));
        expect(state.phase).toBe('waiting');
        expect(state.story).toBeNull();
      },
    );

    it('story:set by a voter with role, playerId, gameId and __proto__ keys acks FORBIDDEN and keeps the story', async () => {
      // Given
      const round = await aRound();
      const payload = withProtoKey({
        title: 'Hijacked',
        role: 'facilitator',
        playerId: joinedOf(round.facilitator).playerId,
        gameId: round.table.gameId,
      });

      // When
      const { result, state } = await expectSilent(round.table, round.everyone, () =>
        round.bob.client.emit(GAME_EVENTS.storySet, payload),
      );

      // Then
      expect(result).toEqual(failedAck('FORBIDDEN'));
      expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
    });

    it.each([
      ['role voter', () => ({ card: 5, role: 'voter' })],
      ['the playerId of Anna', (round: Round) => ({ card: 5, playerId: round.anna.playerId })],
      [
        'role, playerId, gameId and __proto__ keys',
        (round: Round) =>
          withProtoKey({
            card: 5,
            role: 'voter',
            playerId: round.anna.playerId,
            gameId: round.table.gameId,
          }),
      ],
    ])(
      'vote:cast by the facilitator carrying %s acks FORBIDDEN and stores no vote',
      async (_label, payloadOf) => {
        // Given
        const round = await aRound();

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.facilitator.emit(GAME_EVENTS.voteCast, payloadOf(round)),
        );

        // Then
        expect(result).toEqual(failedAck('FORBIDDEN'));
        expect(state.voters.every((v) => !v.hasVoted)).toBe(true);
        expect(round.facilitator.mine).toEqual([]);
        expect(round.anna.client.mine).toEqual([null]);
        expect(round.bob.client.mine).toEqual([null]);
      },
    );

    it('vote:cast by Bob carrying the playerId of Anna records the vote for Bob only', async () => {
      // Given
      const round = await aRound();
      const annaId = voterOf(round.bob.client.states.at(-1) as PublicGameState, 'Anna').id;
      expect(annaId).toBe(round.anna.playerId);
      const marks = round.everyone.map((c) => c.events.length);

      // When
      const ack = await round.bob.client.emit(GAME_EVENTS.voteCast, {
        card: 8,
        playerId: annaId,
      });
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );
      await settle(round.table, round.everyone);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(round.bob.client.mineSince(marks[2] as number)).toEqual([8]);
      expect(round.anna.client.mineSince(marks[1] as number)).toEqual([]);
      expect(round.facilitator.mineSince(marks[0] as number)).toEqual([]);
      for (const state of states) {
        expect(voterOf(state, 'Bob').hasVoted).toBe(true);
        expect(voterOf(state, 'Anna').hasVoted).toBe(false);
      }
      const annaTab2 = await aTabOf(round.table, round.anna);
      const bobTab2 = await aTabOf(round.table, round.bob);
      expect(annaTab2.mine).toEqual([null]);
      expect(bobTab2.mine).toEqual([8]);
    });

    it('vote:cast by Bob carrying role, playerId, gameId and __proto__ keys still records the vote for Bob only', async () => {
      // Given
      const round = await aRound();
      const other = await aTable('Other');
      const payload = withProtoKey({
        card: 13,
        role: 'facilitator',
        playerId: round.anna.playerId,
        gameId: other.gameId,
      });
      const marks = round.everyone.map((c) => c.events.length);

      // When
      const ack = await round.bob.client.emit(GAME_EVENTS.voteCast, payload);
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );

      // Then
      expect(ack).toEqual({ ok: true });
      expect(round.bob.client.mineSince(marks[2] as number)).toEqual([13]);
      expect(round.anna.client.mineSince(marks[1] as number)).toEqual([]);
      expect(round.facilitator.mineSince(marks[0] as number)).toEqual([]);
      for (const state of states) {
        expect(voterOf(state, 'Bob').hasVoted).toBe(true);
        expect(voterOf(state, 'Anna').hasVoted).toBe(false);
        expect(state.voters.some((v) => v.name === 'Fran')).toBe(false);
      }
      expect(other.facilitator.states.at(-1)?.voters.every((v) => !v.hasVoted)).toBe(true);
      expect(other.facilitator.mine).toEqual([]);
    });

    it('story:set by the facilitator carrying role voter and a voter playerId still sets the story', async () => {
      // Given
      const round = await aRound({ voting: false });

      // When
      const ack = await round.facilitator.emit(GAME_EVENTS.storySet, {
        title: 'Still mine',
        role: 'voter',
        playerId: round.anna.playerId,
        url: 'https://example.com/story',
      });
      const state = await round.anna.client.stateWhere((s) => s.phase === 'voting');

      // Then
      expect(ack).toEqual({ ok: true });
      expect(state.story).toEqual({ title: 'Still mine', url: 'https://example.com/story' });
    });
  });

  describe('vote:cast (AC-7, AC-8, AC-9, AC-10)', () => {
    it.each(DECK)(
      'vote:cast with card %j acks ok, then vote:mine to the voter, then game:state to the room',
      async (card) => {
        // Given
        const { facilitator, anna, bob, everyone } = await aRound();
        const marks = everyone.map((c) => c.events.length);

        // When
        const ack = await anna.client.emit(GAME_EVENTS.voteCast, { card });
        const states = await Promise.all(everyone.map((c, i) => c.nextState(marks[i] as number)));

        // Then
        expect(ack).toEqual({ ok: true });
        expect(anna.client.kindsSince(marks[1] as number)).toEqual([
          ACK,
          GAME_EVENTS.voteMine,
          GAME_EVENTS.state,
        ]);
        expect(anna.client.mineSince(marks[1] as number)).toEqual([card]);
        for (const state of states) {
          expect(voterOf(state, 'Anna').hasVoted).toBe(true);
          expect(voterOf(state, 'Bob').hasVoted).toBe(false);
        }
        expect(facilitator.kindsSince(marks[0] as number)).toEqual([GAME_EVENTS.state]);
        expect(bob.client.kindsSince(marks[2] as number)).toEqual([GAME_EVENTS.state]);
      },
    );

    it('vote:cast with another card changes the vote and keeps hasVoted true', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 3);
      const marks = round.everyone.map((c) => c.events.length);

      // When
      const ack = await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 8 });
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );

      // Then
      expect(ack).toEqual({ ok: true });
      expect(round.anna.client.mineSince(marks[1] as number)).toEqual([8]);
      states.forEach((state) => expect(voterOf(state, 'Anna').hasVoted).toBe(true));
    });

    it('vote:cast with null withdraws the vote and clears hasVoted', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 3);
      const marks = round.everyone.map((c) => c.events.length);

      // When
      const ack = await round.anna.client.emit(GAME_EVENTS.voteCast, { card: null });
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );

      // Then
      expect(ack).toEqual({ ok: true });
      expect(round.anna.client.kindsSince(marks[1] as number)).toEqual([
        ACK,
        GAME_EVENTS.voteMine,
        GAME_EVENTS.state,
      ]);
      expect(round.anna.client.mineSince(marks[1] as number)).toEqual([null]);
      states.forEach((state) => expect(voterOf(state, 'Anna').hasVoted).toBe(false));
    });

    it('vote:cast with null and no vote is an idempotent success with the full sequence', async () => {
      // Given
      const { anna } = await aRound();
      const mark = anna.client.events.length;

      // When
      const ack = await anna.client.emit(GAME_EVENTS.voteCast, { card: null });
      const state = await anna.client.nextState(mark);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(anna.client.kindsSince(mark)).toEqual([ACK, GAME_EVENTS.voteMine, GAME_EVENTS.state]);
      expect(anna.client.mineSince(mark)).toEqual([null]);
      expect(voterOf(state, 'Anna').hasVoted).toBe(false);
    });

    it('vote:cast with the same card twice acks ok both times and keeps hasVoted true', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      const mark = round.anna.client.events.length;

      // When
      const ack = await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 5 });
      const state = await round.anna.client.nextState(mark);

      // Then
      expect(ack).toEqual({ ok: true });
      expect(round.anna.client.kindsSince(mark)).toEqual([
        ACK,
        GAME_EVENTS.voteMine,
        GAME_EVENTS.state,
      ]);
      expect(round.anna.client.mineSince(mark)).toEqual([5]);
      expect(voterOf(state, 'Anna').hasVoted).toBe(true);
    });

    it.each([
      ['a numeric card', { card: 5 }],
      ['an invalid card', { card: 4 }],
      ['a withdraw', { card: null }],
    ])(
      'vote:cast with %s while waiting acks WRONG_PHASE, broadcasts nothing and keeps hasVoted false',
      async (_label, payload) => {
        // Given
        const round = await aRound({ voting: false });

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.anna.client.emit(GAME_EVENTS.voteCast, payload),
        );

        // Then
        expect(result).toEqual(failedAck('WRONG_PHASE'));
        expect(voterOf(state, 'Anna').hasVoted).toBe(false);
        expect(round.anna.client.mine).toEqual([null]);
      },
    );

    const invalidCards: ReadonlyArray<readonly [string, unknown]> = [
      ['4', 4],
      ['"5"', '5'],
      ['5.5', 5.5],
      ['-1', -1],
      ['"Coffee"', 'Coffee'],
      ['"☕"', '☕'],
      ['""', ''],
      ['true', true],
      ['{}', {}],
      ['[]', []],
    ];

    it.each(invalidCards)(
      'vote:cast with card %s acks INVALID_CARD, sends nothing and keeps the previous vote',
      async (_label, card) => {
        // Given
        const round = await aRound();
        await castAndSync(round, round.anna, 3);

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.anna.client.emit(GAME_EVENTS.voteCast, { card }),
        );
        const secondTab = await aTabOf(round.table, round.anna);

        // Then
        expect(result).toEqual(failedAck('INVALID_CARD'));
        expect(round.anna.client.mine).toEqual([null, 3]);
        expect(voterOf(state, 'Anna').hasVoted).toBe(true);
        expect(secondTab.mine).toEqual([3]);
      },
    );

    it.each([
      ['a bare number', 5],
      ['null', null],
      ['a bare string', 'coffee'],
      ['an array', []],
      ['an object without a card key', {}],
    ])('vote:cast with %s payload acks INVALID_PAYLOAD and sends nothing', async (_l, payload) => {
      // Given
      const round = await aRound();

      // When
      const { result } = await expectSilent(round.table, round.everyone, () =>
        round.anna.client.emit(GAME_EVENTS.voteCast, payload),
      );

      // Then
      expect(result).toEqual(failedAck('INVALID_PAYLOAD'));
      expect(round.anna.client.mine).toEqual([null]);
    });

    const facilitatorVotes: ReadonlyArray<readonly [string, boolean, unknown]> = [
      ['a card while waiting', false, { card: 5 }],
      ['a card while voting', true, { card: 5 }],
      ['a withdraw while voting', true, { card: null }],
      ['an invalid card while voting', true, { card: 4 }],
    ];

    it.each(facilitatorVotes)(
      'vote:cast by the facilitator with %s acks FORBIDDEN and stores no vote',
      async (_label, voting, payload) => {
        // Given
        const round = await aRound({ voting });

        // When
        const { result, state } = await expectSilent(round.table, round.everyone, () =>
          round.facilitator.emit(GAME_EVENTS.voteCast, payload),
        );

        // Then
        expect(result).toEqual(failedAck('FORBIDDEN'));
        expect(state.voters.every((v) => !v.hasVoted)).toBe(true);
        expect(round.facilitator.mine).toEqual([]);
      },
    );

    it('error acks carry the fixed messages for the new codes', async () => {
      // Given
      const round = await aRound({ voting: false });

      // When
      const wrongPhase = await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 5 });
      const forbidden = await round.anna.client.emit(GAME_EVENTS.storySet, {
        title: 'T',
        url: 'https://example.com/story',
      });
      await startVoting(round);
      const invalidCard = await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 4 });

      // Then
      expect(wrongPhase).toEqual({
        ok: false,
        code: 'WRONG_PHASE',
        message: 'That action is not available right now.',
      });
      expect(forbidden).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'You are not allowed to do that.',
      });
      expect(invalidCard).toEqual({
        ok: false,
        code: 'INVALID_CARD',
        message: 'That card is not in the deck.',
      });
    });

    it('vote:cast broadcasts hasVoted to every socket within 1s', async () => {
      // Given
      const { bob, everyone } = await aRound();
      const marks = everyone.map((c) => c.events.length);

      // When
      const started = performance.now();
      await bob.client.emit(GAME_EVENTS.voteCast, { card: 'coffee' });
      const states = await Promise.all(everyone.map((c, i) => c.nextState(marks[i] as number)));
      const elapsed = performance.now() - started;

      // Then
      expect(elapsed).toBeLessThan(BROADCAST_BUDGET_MS);
      states.forEach((state) => expect(voterOf(state, 'Bob').hasVoted).toBe(true));
    });
  });

  describe('event order on join (AC-13, AC-19)', () => {
    it('game:join of a voter delivers ack, game:joined, vote:mine and game:state', async () => {
      // Given
      const { table } = await aRound({ voting: false });
      const client = await connect();

      // When
      await client.join({ gameId: table.gameId, name: 'Cleo' });
      await client.when(() => client.states[0]);

      // Then
      expect(client.kindsSince(0)).toEqual([
        ACK,
        GAME_EVENTS.joined,
        GAME_EVENTS.voteMine,
        GAME_EVENTS.state,
      ]);
      expect(client.mine).toEqual([null]);
    });

    it('game:join of the facilitator delivers no vote:mine', async () => {
      // Given
      const { gameId, token } = server.store.createGame('Fran');
      const client = await connect();

      // When
      await client.join({ gameId, token });
      await client.when(() => client.states[0]);

      // Then
      expect(client.kindsSince(0)).toEqual([ACK, GAME_EVENTS.joined, GAME_EVENTS.state]);
    });

    it('game:join of a voter sends the facilitator only game:state', async () => {
      // Given
      const round = await aRound({ voting: false });
      const mark = round.facilitator.events.length;

      // When
      await aVoter(round.table, 'Cleo');
      await round.facilitator.stateWhere(hasVoter('Cleo', true));

      // Then
      expect(round.facilitator.kindsSince(mark)).toEqual([GAME_EVENTS.state]);
      expect(round.facilitator.mine).toEqual([]);
    });

    it('a new game starts waiting with no story and nobody voted', async () => {
      // Given
      const round = await aRound({ voting: false });

      // When
      const state = round.facilitator.states.at(-1) as PublicGameState;

      // Then
      expect(publicGameStateSchema.safeParse(state).success).toBe(true);
      expect(state.phase).toBe('waiting');
      expect(state.story).toBeNull();
      expect(state.voters.every((v) => !v.hasVoted)).toBe(true);
    });
  });

  describe('vote privacy (AC-12)', () => {
    it('no game:state carries a card, vote:mine reaches only its owner and nothing else carries a card', async () => {
      // Given
      const table = await aTable();
      const anna = await aVoter(table, 'Anna');
      const bob = await aVoter(table, 'Bob');
      const annaTab2 = await aTabOf(table, anna);
      const unjoined = await connect();
      const everyone = [table.facilitator, anna.client, annaTab2, bob.client];
      const expectedMine = new Map<Client, unknown[]>([
        [anna.client, [null]],
        [annaTab2, [null]],
        [bob.client, [null]],
      ]);
      const annaTabs = [anna.client, annaTab2];
      const castAs = async (sender: Client, owners: Client[], card: Card | null): Promise<void> => {
        await cast(sender, card);
        owners.forEach((tab) => expectedMine.get(tab)?.push(card));
      };

      // When
      expect(
        await table.facilitator.emit(GAME_EVENTS.storySet, {
          title: 'Login page',
          url: 'https://example.com/story',
        }),
      ).toEqual({
        ok: true,
      });
      for (const [index, card] of DECK.entries()) {
        await castAs(index % 2 === 0 ? anna.client : annaTab2, annaTabs, card);
        await castAs(bob.client, [bob.client], DECK[DECK.length - 1 - index] as Card);
      }
      await castAs(annaTab2, annaTabs, null);
      await castAs(bob.client, [bob.client], null);
      await castAs(anna.client, annaTabs, 5);
      expect(
        await table.facilitator.emit(GAME_EVENTS.storySet, {
          title: 'Edited',
          url: 'https://example.com/e',
        }),
      ).toEqual({ ok: true });
      const bobTab2 = await aTabOf(table, bob);
      expectedMine.set(bobTab2, [null]);
      expect(await unjoined.emit(GAME_EVENTS.voteCast, { card: 5 })).toEqual(
        failedAck('FORBIDDEN'),
      );
      expect(
        await unjoined.emit(GAME_EVENTS.storySet, { title: 'x', url: 'https://example.com/story' }),
      ).toEqual(failedAck('FORBIDDEN'));
      await settle(table, [anna.client, annaTab2, bob.client, bobTab2]);

      // Then
      for (const client of [...everyone, bobTab2, unjoined]) {
        client.states.forEach((state) => {
          expect(publicGameStateSchema.safeParse(state).success).toBe(true);
          expect(cardKeysIn(state)).toEqual([]);
        });
        client.events
          .filter((e) => e.event !== GAME_EVENTS.state && e.event !== GAME_EVENTS.voteMine)
          .forEach((e) => expect(cardKeysIn(e.payload)).toEqual([]));
        client.events
          .filter((e) => e.event === GAME_EVENTS.voteMine)
          .forEach((e) => expect(voteMineSchema.safeParse(e.payload).success).toBe(true));
        expect(client.mine).toEqual(expectedMine.get(client) ?? []);
      }
      expect(table.facilitator.mine).toEqual([]);
      expect(unjoined.events.filter((e) => e.event !== ACK)).toEqual([]);
    });

    it('game:join of Bob after Anna voted gives Bob only his own null vote', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 5);

      // When
      const bobTab2 = await aTabOf(round.table, round.bob);

      // Then
      expect(bobTab2.mine).toEqual([null]);
      expect(round.bob.client.mine).toEqual([null]);
    });

    it('vote:mine after a cast never reaches the other voter or the facilitator', async () => {
      // Given
      const round = await aRound();
      const marks = round.everyone.map((c) => c.events.length);

      // When
      await cast(round.anna.client, 'coffee');
      await settle(round.table, round.everyone);

      // Then
      expect(round.facilitator.mineSince(marks[0] as number)).toEqual([]);
      expect(round.bob.client.mineSince(marks[2] as number)).toEqual([]);
      expect(round.anna.client.mineSince(marks[1] as number)).toEqual(['coffee']);
    });
  });

  describe('offline, rejoin and multiple tabs (AC-13)', () => {
    it('Anna going offline keeps her vote and hasVoted visible to the room', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 8);

      // When
      round.anna.client.socket.disconnect();
      const seenByBob = await round.bob.client.stateWhere(hasVoter('Anna', false));
      const seenByFacilitator = await round.facilitator.stateWhere(hasVoter('Anna', false));

      // Then
      expect(voterOf(seenByBob, 'Anna').hasVoted).toBe(true);
      expect(voterOf(seenByFacilitator, 'Anna').hasVoted).toBe(true);
    });

    it('Anna rejoining with her token gets game:joined, then vote:mine with her card, then game:state', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 8);
      round.anna.client.socket.disconnect();
      await round.bob.client.stateWhere(hasVoter('Anna', false));

      // When
      const rejoined = await aTabOf(round.table, round.anna);

      // Then
      expect(rejoined.kindsSince(0)).toEqual([
        ACK,
        GAME_EVENTS.joined,
        GAME_EVENTS.voteMine,
        GAME_EVENTS.state,
      ]);
      expect(rejoined.mine).toEqual([8]);
      expect(voterOf(rejoined.states[0] as PublicGameState, 'Anna')).toMatchObject({
        connected: true,
        hasVoted: true,
      });
    });

    it('Anna rejoining after a withdraw gets vote:mine with null', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 8);
      await castAndSync(round, round.anna, null);
      round.anna.client.socket.disconnect();
      await round.bob.client.stateWhere(hasVoter('Anna', false));

      // When
      const rejoined = await aTabOf(round.table, round.anna);

      // Then
      expect(rejoined.mine).toEqual([null]);
      expect(voterOf(rejoined.states[0] as PublicGameState, 'Anna').hasVoted).toBe(false);
    });

    it('a vote cast in one tab reaches vote:mine in both tabs of the voter only', async () => {
      // Given
      const round = await aRound();
      const tab2 = await aTabOf(round.table, round.anna);
      await settle(round.table, [...round.everyone, tab2]);
      const marks = [
        round.anna.client.events.length,
        tab2.events.length,
        round.bob.client.events.length,
      ];

      // When
      await cast(round.anna.client, 3);
      await Promise.all([
        tab2.nextState(marks[1] as number),
        round.bob.client.nextState(marks[2] as number),
      ]);

      // Then
      expect(round.anna.client.mineSince(marks[0] as number)).toEqual([3]);
      expect(tab2.mineSince(marks[1] as number)).toEqual([3]);
      expect(tab2.kindsSince(marks[1] as number)).toEqual([
        GAME_EVENTS.voteMine,
        GAME_EVENTS.state,
      ]);
      expect(round.bob.client.mineSince(marks[2] as number)).toEqual([]);
    });
  });

  describe('unjoined sockets and malformed events (AC-14)', () => {
    it.each([
      ['story:set', GAME_EVENTS.storySet, { title: 'T', url: 'https://example.com/story' }],
      ['story:set', GAME_EVENTS.storySet, null],
      ['vote:cast', GAME_EVENTS.voteCast, { card: 5 }],
      ['vote:cast', GAME_EVENTS.voteCast, 'garbage'],
    ])(
      '%s from an unjoined socket with %j acks FORBIDDEN and emits nothing',
      async (_l, event, payload) => {
        // Given
        const round = await aRound();
        const unjoined = await connect();

        // When
        const { result } = await expectSilent(round.table, round.everyone, () =>
          unjoined.emit(event, payload),
        );

        // Then
        expect(result).toEqual(failedAck('FORBIDDEN'));
        expect(unjoined.events.filter((e) => e.event !== ACK)).toEqual([]);
      },
    );

    it.each([null, 'x', [], 42])(
      'story:set by the facilitator with payload %j acks INVALID_PAYLOAD',
      async (payload) => {
        // Given
        const round = await aRound({ voting: false });

        // When
        const { result } = await expectSilent(round.table, round.everyone, () =>
          round.facilitator.emit(GAME_EVENTS.storySet, payload),
        );

        // Then
        expect(result).toEqual(failedAck('INVALID_PAYLOAD'));
      },
    );

    const precedence: ReadonlyArray<
      readonly [string, 'facilitator' | 'anna', boolean, string, unknown, ErrorCode]
    > = [
      [
        'role before value on story:set',
        'anna',
        true,
        GAME_EVENTS.storySet,
        { title: '', url: 'https://example.com/story' },
        'FORBIDDEN',
      ],
      [
        'envelope before role on story:set',
        'anna',
        true,
        GAME_EVENTS.storySet,
        null,
        'INVALID_PAYLOAD',
      ],
      [
        'role before phase on vote:cast',
        'facilitator',
        false,
        GAME_EVENTS.voteCast,
        { card: 4 },
        'FORBIDDEN',
      ],
      [
        'role before value on vote:cast',
        'facilitator',
        true,
        GAME_EVENTS.voteCast,
        { card: 4 },
        'FORBIDDEN',
      ],
      [
        'phase before value on vote:cast',
        'anna',
        false,
        GAME_EVENTS.voteCast,
        { card: 4 },
        'WRONG_PHASE',
      ],
      [
        'envelope before phase on vote:cast',
        'anna',
        false,
        GAME_EVENTS.voteCast,
        5,
        'INVALID_PAYLOAD',
      ],
      ['value last on vote:cast', 'anna', true, GAME_EVENTS.voteCast, { card: 4 }, 'INVALID_CARD'],
    ];

    it.each(precedence)(
      '%s acks the winning error code',
      async (_label, who, voting, event, payload, code) => {
        // Given
        const round = await aRound({ voting });
        const sender = who === 'anna' ? round.anna.client : round.facilitator;

        // When
        const { result } = await expectSilent(round.table, round.everyone, () =>
          sender.emit(event, payload),
        );

        // Then
        expect(result).toEqual(failedAck(code));
      },
    );

    it('vote:cast without an ack callback is processed and the server keeps accepting events', async () => {
      // Given
      const round = await aRound();
      const marks = round.everyone.map((c) => c.events.length);

      // When
      round.anna.client.socket.emit(GAME_EVENTS.voteCast, { card: 5 });
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );
      const mark = round.anna.client.events.length;
      const next = await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 8 });
      await round.anna.client.nextState(mark);

      // Then
      expect(voterOf(states[0] as PublicGameState, 'Anna').hasVoted).toBe(true);
      expect(round.anna.client.mine).toEqual([null, 5, 8]);
      expect(next).toEqual({ ok: true });
    });

    it('story:set without an ack callback is processed', async () => {
      // Given
      const round = await aRound({ voting: false });

      // When
      round.facilitator.socket.emit(GAME_EVENTS.storySet, {
        title: 'No ack',
        url: 'https://example.com/story',
      });
      const state = await round.bob.client.stateWhere((s) => s.phase === 'voting');

      // Then
      expect(state.story).toEqual({ title: 'No ack', url: 'https://example.com/story' });
    });

    it('vote:cast with a non-function ack argument is tolerated', async () => {
      // Given
      const round = await aRound();
      const marks = round.everyone.map((c) => c.events.length);

      // When
      round.anna.client.socket.emit(GAME_EVENTS.voteCast, { card: 13 }, 'not-a-callback');
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );

      // Then
      expect(voterOf(states[1] as PublicGameState, 'Anna').hasVoted).toBe(true);
    });

    it('rejections are logged with event, gameId and code only, never title, link, card or token', async () => {
      // Given
      const round = await aRound({ voting: false });
      const unjoined = await connect();
      const secrets = [
        'Secret project',
        'secret-link',
        'coffee',
        'bogus-card',
        'Hidden title',
        round.anna.token,
        round.table.facilitatorToken,
      ];

      // When
      await round.anna.client.emit(GAME_EVENTS.storySet, {
        title: 'Secret project',
        url: 'https://example.com/secret-link',
      });
      await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 'coffee' });
      await round.facilitator.emit(GAME_EVENTS.storySet, {
        title: 'Secret\nTitle',
        url: 'https://example.com/story',
      });
      await startVoting(round, 'Hidden title');
      await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 'bogus-card' });
      await round.facilitator.emit(GAME_EVENTS.voteCast, { card: 5 });
      await unjoined.emit(GAME_EVENTS.storySet, {
        title: 'Secret project',
        url: 'https://example.com/story',
      });
      await cast(round.anna.client, 13);

      // Then
      const entries = logged
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const rejected = entries.filter((e) => e.level === 'warn');
      expect(rejected.map((e) => [e.event, e.code])).toEqual([
        ['story.rejected', 'FORBIDDEN'],
        ['vote.rejected', 'WRONG_PHASE'],
        ['story.rejected', 'INVALID_STORY'],
        ['vote.rejected', 'INVALID_CARD'],
        ['vote.rejected', 'FORBIDDEN'],
        ['story.rejected', 'FORBIDDEN'],
      ]);
      expect(rejected[0]).toMatchObject({ gameId: round.table.gameId });
      expect(rejected[5]).not.toHaveProperty('gameId');
      entries.forEach((e) => {
        expect(
          Object.keys(e).every((key) => ['level', 'event', 'gameId', 'code'].includes(key)),
        ).toBe(true);
      });
      secrets.forEach((secret) => expect(logged.join('\n')).not.toContain(secret));
    });
  });

  describe('round:reveal (Story #4)', () => {
    async function reveal(round: Round): Promise<PublicGameState[]> {
      const marks = round.everyone.map((c) => c.events.length);
      expect(await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined)).toEqual({
        ok: true,
      });
      return Promise.all(round.everyone.map((c, i) => c.nextState(marks[i] as number)));
    }

    async function aRevealedRound(cards: Array<[keyof Pick<Round, 'anna' | 'bob'>, Card]>) {
      const round = await aRound();
      for (const [who, card] of cards) {
        await castAndSync(round, round[who], card);
      }
      const states = await reveal(round);
      return { round, states };
    }

    it('delivers cards and results to every socket within 1s of the ack', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 3);
      await castAndSync(round, round.bob, 8);
      const marks = round.everyone.map((c) => c.events.length);

      // When
      const started = Date.now();
      const ack = await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined);
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );

      // Then
      expect(ack).toEqual({ ok: true });
      expect(Date.now() - started).toBeLessThan(BROADCAST_BUDGET_MS);
      states.forEach((state) => {
        expect(publicGameStateSchema.safeParse(state).success).toBe(true);
        expect(state.phase).toBe('revealed');
        expect(voterOf(state, 'Anna')).toMatchObject({ hasVoted: true, card: 3 });
        expect(voterOf(state, 'Bob')).toMatchObject({ hasVoted: true, card: 8 });
        expect(state.results).toEqual({
          distribution: [
            { card: 3, count: 1 },
            { card: 8, count: 1 },
          ],
          average: 5.5,
          median: 8,
          consensus: false,
          outlierIds: [round.anna.playerId, round.bob.playerId],
          suggestedEstimate: 5,
        });
      });
    });

    it('acks before the broadcast and sends nothing else to the room, no vote:mine', async () => {
      // Given
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      const marks = round.everyone.map((c) => c.events.length);

      // When
      await reveal(round);

      // Then
      const [fac, anna, bob] = round.everyone;
      expect(fac?.kindsSince(marks[0] as number)).toEqual([ACK, GAME_EVENTS.state]);
      expect(anna?.kindsSince(marks[1] as number)).toEqual([GAME_EVENTS.state]);
      expect(bob?.kindsSince(marks[2] as number)).toEqual([GAME_EVENTS.state]);
    });

    it('reports consensus, no outliers and the shared card', async () => {
      const { states } = await aRevealedRound([
        ['anna', 5],
        ['bob', 5],
      ]);

      expect(states[0]?.results).toMatchObject({
        average: 5,
        consensus: true,
        outlierIds: [],
        suggestedEstimate: 5,
      });
    });

    it('shows ? and coffee votes but leaves them out of the average', async () => {
      const { states } = await aRevealedRound([
        ['anna', '?'],
        ['bob', 'coffee'],
      ]);

      expect(states[0]?.results).toEqual({
        distribution: [
          { card: '?', count: 1 },
          { card: 'coffee', count: 1 },
        ],
        average: null,
        median: null,
        consensus: false,
        outlierIds: [],
        suggestedEstimate: null,
      });
      expect(voterOf(states[0] as PublicGameState, 'Anna').card).toBe('?');
      expect(voterOf(states[0] as PublicGameState, 'Bob').card).toBe('coffee');
    });

    it('lets a reveal go ahead with one vote and shows the other voter without a card', async () => {
      const { states } = await aRevealedRound([['anna', 13]]);

      const bob = voterOf(states[0] as PublicGameState, 'Bob');
      expect(bob.hasVoted).toBe(false);
      expect(bob).not.toHaveProperty('card');
      expect(states[0]?.results?.distribution).toEqual([{ card: 13, count: 1 }]);
    });

    it('rejects a reveal with no vote with WRONG_PHASE and sends nothing', async () => {
      const round = await aRound();

      const { result } = await expectSilent(round.table, [round.anna.client], () =>
        round.facilitator.emit(GAME_EVENTS.roundReveal, undefined),
      );

      expect(result).toEqual(failedAck('WRONG_PHASE'));
    });

    it('rejects a reveal after the only vote was withdrawn', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      await castAndSync(round, round.anna, null);

      expect(await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined)).toEqual(
        failedAck('WRONG_PHASE'),
      );
    });

    it('rejects a reveal while waiting', async () => {
      const round = await aRound({ voting: false });

      expect(await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined)).toEqual(
        failedAck('WRONG_PHASE'),
      );
    });

    it('rejects a voter with FORBIDDEN and keeps the phase', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 5);

      const { result, state } = await expectSilent(round.table, [round.bob.client], () =>
        round.anna.client.emit(GAME_EVENTS.roundReveal, undefined),
      );

      expect(result).toEqual(failedAck('FORBIDDEN'));
      expect(state.phase).toBe('voting');
    });

    it('rejects a socket that never joined with FORBIDDEN', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      const stranger = await connect();

      expect(await stranger.emit(GAME_EVENTS.roundReveal, undefined)).toEqual(
        failedAck('FORBIDDEN'),
      );
    });

    it('ignores a payload and ignores a spoofed phase', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      const marks = round.everyone.map((c) => c.events.length);

      const ack = await round.facilitator.emit(GAME_EVENTS.roundReveal, {
        phase: 'waiting',
        role: 'voter',
      });
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );

      expect(ack).toEqual({ ok: true });
      expect(states.every((s) => s.phase === 'revealed')).toBe(true);
    });

    it('processes a reveal sent without an ack callback', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 5);
      const marks = round.everyone.map((c) => c.events.length);

      round.facilitator.socket.emit(GAME_EVENTS.roundReveal);

      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );
      expect(states.every((s) => s.phase === 'revealed')).toBe(true);
    });

    it('rejects a second reveal, vote:cast and story:set after the reveal and changes nothing', async () => {
      const { round } = await aRevealedRound([
        ['anna', 3],
        ['bob', 8],
      ]);

      const { result, state } = await expectSilent(
        round.table,
        [round.anna.client, round.bob.client],
        async () => [
          await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined),
          await round.anna.client.emit(GAME_EVENTS.voteCast, { card: 13 }),
          await round.anna.client.emit(GAME_EVENTS.voteCast, { card: null }),
          await round.facilitator.emit(GAME_EVENTS.storySet, {
            title: 'Sneaky edit',
            url: 'https://example.com/story',
          }),
          await round.facilitator.emit(GAME_EVENTS.storySet, {
            title: '',
            url: 'https://example.com/story',
          }),
        ],
      );

      expect(result).toEqual(Array(5).fill(failedAck('WRONG_PHASE')));
      expect(state.phase).toBe('revealed');
      expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
      expect(voterOf(state, 'Anna').card).toBe(3);
      expect(round.anna.client.mineSince(0).at(-1)).toBe(3);
    });

    it('keeps FORBIDDEN ahead of WRONG_PHASE after the reveal', async () => {
      const { round } = await aRevealedRound([['anna', 3]]);

      expect(await round.facilitator.emit(GAME_EVENTS.voteCast, { card: 5 })).toEqual(
        failedAck('FORBIDDEN'),
      );
      expect(
        await round.anna.client.emit(GAME_EVENTS.storySet, {
          title: 'X',
          url: 'https://example.com/story',
        }),
      ).toEqual(failedAck('FORBIDDEN'));
    });

    it('sends cards to a voter who rejoins and to a new voter who joins after the reveal', async () => {
      const { round } = await aRevealedRound([
        ['anna', 3],
        ['bob', 8],
      ]);

      const tab = await aTabOf(round.table, round.anna);
      const cy = await aVoter(round.table, 'Cy');

      const rejoined = await tab.stateWhere((s) => s.phase === 'revealed');
      expect(voterOf(rejoined, 'Anna').card).toBe(3);
      expect(rejoined.results?.average).toBe(5.5);
      expect(tab.mine).toEqual([3]);
      const late = await cy.client.stateWhere((s) => s.phase === 'revealed');
      expect(voterOf(late, 'Cy')).toEqual(
        expect.objectContaining({ hasVoted: false, connected: true }),
      );
      expect(voterOf(late, 'Cy')).not.toHaveProperty('card');
      expect(cy.client.mine).toEqual([null]);
      expect(late.results?.distribution).toEqual([
        { card: 3, count: 1 },
        { card: 8, count: 1 },
      ]);
    });

    it('never puts a card or results in a game:state before the reveal for any client', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 3);
      await castAndSync(round, round.bob, 21);
      await settle(round.table, round.everyone);

      for (const client of round.everyone) {
        const before = client.states.filter((s) => s.phase !== 'revealed');
        expect(before.length).toBeGreaterThan(0);
        before.forEach((state) => {
          expect(state).not.toHaveProperty('results');
          expect(cardKeysIn(state)).toEqual([]);
        });
      }
    });

    it('logs only the event name, gameId and code for a rejected reveal', async () => {
      const round = await aRound();
      await castAndSync(round, round.anna, 13);

      await round.anna.client.emit(GAME_EVENTS.roundReveal, undefined);
      await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined);
      await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined);

      const rejected = logged
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((e) => e.event === 'round.rejected');
      expect(rejected.map((e) => e.code)).toEqual(['FORBIDDEN', 'WRONG_PHASE']);
      rejected.forEach((e) =>
        expect(Object.keys(e).sort()).toEqual(['code', 'event', 'gameId', 'level']),
      );
      expect(logged.join('\n')).not.toMatch(/Anna|Login page/);
    });
  });

  describe('round:revote and round:finish (Story #5)', () => {
    async function aRevealedRound(
      cards: Array<['anna' | 'bob', Card]> = [
        ['anna', 3],
        ['bob', 8],
      ],
    ) {
      const round = await aRound();
      for (const [who, card] of cards) {
        await castAndSync(round, round[who], card);
      }
      const marks = round.everyone.map((c) => c.events.length);
      expect(await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined)).toEqual({
        ok: true,
      });
      await Promise.all(round.everyone.map((c, i) => c.nextState(marks[i] as number)));
      return round;
    }

    // Sends the command and returns each client's next game:state.
    async function command(round: Round, event: string, payload?: unknown) {
      const marks = round.everyone.map((c) => c.events.length);
      const ack = await round.facilitator.emit(event, payload);
      const states = await Promise.all(
        round.everyone.map((c, i) => c.nextState(marks[i] as number)),
      );
      return { ack, states, marks };
    }

    describe('round:revote', () => {
      it('clears votes, keeps the story and tells every voter their deck is empty', async () => {
        // Given
        const round = await aRevealedRound();

        // When
        const started = Date.now();
        const { ack, states, marks } = await command(round, GAME_EVENTS.roundRevote);

        // Then
        expect(ack).toEqual({ ok: true });
        expect(Date.now() - started).toBeLessThan(BROADCAST_BUDGET_MS);
        states.forEach((state) => {
          expect(publicGameStateSchema.safeParse(state).success).toBe(true);
          expect(state.phase).toBe('voting');
          expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
          expect(state).not.toHaveProperty('results');
          expect(state.voters.every((v) => !v.hasVoted && !('card' in v))).toBe(true);
          expect(state.history).toEqual([]);
        });
        expect(round.anna.client.mineSince(marks[1] as number)).toEqual([null]);
        expect(round.bob.client.mineSince(marks[2] as number)).toEqual([null]);
        expect(round.facilitator.mineSince(marks[0] as number)).toEqual([]);
      });

      it('clears the deck in every tab of a voter and lets everyone vote and reveal again', async () => {
        // Given
        const round = await aRevealedRound();
        const tab = await aTabOf(round.table, round.anna);
        const tabMark = tab.events.length;

        // When
        await command(round, GAME_EVENTS.roundRevote);
        await tab.when(() => (tab.mineSince(tabMark).length > 0 ? true : undefined));
        await castAndSync(round, round.bob, 13);
        const marks = round.everyone.map((c) => c.events.length);
        expect(await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined)).toEqual({
          ok: true,
        });
        const states = await Promise.all(
          round.everyone.map((c, i) => c.nextState(marks[i] as number)),
        );

        // Then
        expect(tab.mineSince(tabMark)).toEqual([null]);
        expect(voterOf(states[0] as PublicGameState, 'Bob').card).toBe(13);
        expect(voterOf(states[0] as PublicGameState, 'Anna')).not.toHaveProperty('card');
        expect(states[0]?.results?.distribution).toEqual([{ card: 13, count: 1 }]);
      });

      it('rejects a voter with FORBIDDEN, and a re-vote outside revealed with WRONG_PHASE, silently', async () => {
        const voting = await aRound();
        await castAndSync(voting, voting.anna, 5);
        const revealed = await aRevealedRound();

        const wrongPhase = await expectSilent(voting.table, [voting.anna.client], () =>
          voting.facilitator.emit(GAME_EVENTS.roundRevote, undefined),
        );
        const forbidden = await expectSilent(revealed.table, [revealed.bob.client], () =>
          revealed.anna.client.emit(GAME_EVENTS.roundRevote, undefined),
        );

        expect(wrongPhase.result).toEqual(failedAck('WRONG_PHASE'));
        expect(forbidden.result).toEqual(failedAck('FORBIDDEN'));
        expect(forbidden.state.phase).toBe('revealed');
      });

      it('rejects a socket that never joined with FORBIDDEN', async () => {
        const stranger = await connect();

        expect(await stranger.emit(GAME_EVENTS.roundRevote, undefined)).toEqual(
          failedAck('FORBIDDEN'),
        );
      });
    });

    describe('round:finish', () => {
      it('records the estimate, empties the round and sends history and total to everyone', async () => {
        // Given
        const round = await aRevealedRound();

        // When
        const started = Date.now();
        const { ack, states, marks } = await command(round, GAME_EVENTS.roundFinish, {
          finalEstimate: 5,
        });

        // Then
        expect(ack).toEqual({ ok: true });
        expect(Date.now() - started).toBeLessThan(BROADCAST_BUDGET_MS);
        states.forEach((state) => {
          expect(publicGameStateSchema.safeParse(state).success).toBe(true);
          expect(state.phase).toBe('waiting');
          expect(state.story).toBeNull();
          expect(state).not.toHaveProperty('results');
          expect(state.history).toEqual([
            { title: 'Login page', url: 'https://example.com/story', estimate: 5 },
          ]);
          expect(state.total).toBe(5);
          expect(state.voters.every((v) => !v.hasVoted && !('card' in v))).toBe(true);
        });
        expect(round.anna.client.mineSince(marks[1] as number)).toEqual([null]);
        expect(round.bob.client.mineSince(marks[2] as number)).toEqual([null]);
      });

      it('keeps the link in the history and skips from voting with "skipped" and no total', async () => {
        const round = await aRound();
        await round.facilitator.emit(GAME_EVENTS.storySet, {
          title: 'Checkout',
          url: 'https://e.com/c',
        });
        await Promise.all(
          round.everyone.map((c) => c.stateWhere((s) => s.story?.title === 'Checkout')),
        );
        await castAndSync(round, round.anna, 8);

        const { ack, states } = await command(round, GAME_EVENTS.roundFinish, { skip: true });

        expect(ack).toEqual({ ok: true });
        expect(states[0]?.history).toEqual([
          { title: 'Checkout', url: 'https://e.com/c', estimate: 'skipped' },
        ]);
        expect(states[0]?.total).toBe(0);
        expect(states[0]?.phase).toBe('waiting');
      });

      it('skips from revealed too', async () => {
        const round = await aRevealedRound();

        const { states } = await command(round, GAME_EVENTS.roundFinish, { skip: true });

        expect(states[0]?.history).toEqual([
          { title: 'Login page', url: 'https://example.com/story', estimate: 'skipped' },
        ]);
      });

      it('plays a second round from a clean start and keeps the summary in order', async () => {
        // Given
        const round = await aRevealedRound();
        await command(round, GAME_EVENTS.roundFinish, { finalEstimate: 5 });

        // When
        await startVoting(round, 'Checkout');
        const fresh = await round.anna.client.stateWhere((s) => s.story?.title === 'Checkout');
        await castAndSync(round, round.anna, 8);
        const marks = round.everyone.map((c) => c.events.length);
        await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined);
        await Promise.all(round.everyone.map((c, i) => c.nextState(marks[i] as number)));
        expect(await round.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: 8 })).toEqual(
          {
            ok: true,
          },
        );
        const states = [await round.anna.client.stateWhere((x) => x.history.length === 2)];

        // Then
        expect(fresh.voters.every((v) => !v.hasVoted)).toBe(true);
        expect(states[0]?.history).toEqual([
          { title: 'Login page', url: 'https://example.com/story', estimate: 5 },
          { title: 'Checkout', url: 'https://example.com/story', estimate: 8 },
        ]);
        expect(states[0]?.total).toBe(13);
      });

      it.each([
        [{ finalEstimate: '?' }, 'INVALID_CARD'],
        [{ finalEstimate: 'coffee' }, 'INVALID_CARD'],
        [{ finalEstimate: 4 }, 'INVALID_CARD'],
        [{ finalEstimate: '5' }, 'INVALID_CARD'],
        [{ finalEstimate: 5.5 }, 'INVALID_CARD'],
        [{ finalEstimate: -1 }, 'INVALID_CARD'],
        [{ finalEstimate: null }, 'INVALID_CARD'],
        [{ finalEstimate: true }, 'INVALID_CARD'],
        [{}, 'INVALID_PAYLOAD'],
        [{ finalEstimate: 5, skip: true }, 'INVALID_PAYLOAD'],
        [{ skip: false }, 'INVALID_PAYLOAD'],
        [{ skip: 'true' }, 'INVALID_PAYLOAD'],
        ['skip', 'INVALID_PAYLOAD'],
        [null, 'INVALID_PAYLOAD'],
        [[], 'INVALID_PAYLOAD'],
      ] as Array<[unknown, ErrorCode]>)(
        'rejects %j with %s and changes nothing',
        async (payload, code) => {
          const round = await aRevealedRound();

          const { result, state } = await expectSilent(round.table, [round.anna.client], () =>
            round.facilitator.emit(GAME_EVENTS.roundFinish, payload),
          );

          expect(result).toEqual(failedAck(code));
          expect(state.phase).toBe('revealed');
          expect(state.history).toEqual([]);
          expect(voterOf(state, 'Anna').card).toBe(3);
        },
      );

      it('rejects an estimate while voting and any finish while waiting with WRONG_PHASE', async () => {
        const voting = await aRound();
        const waiting = await aRound({ voting: false });

        expect(
          await voting.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: 5 }),
        ).toEqual(failedAck('WRONG_PHASE'));
        expect(await waiting.facilitator.emit(GAME_EVENTS.roundFinish, { skip: true })).toEqual(
          failedAck('WRONG_PHASE'),
        );
        expect(
          await waiting.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: 5 }),
        ).toEqual(failedAck('WRONG_PHASE'));
      });

      it('rejects a second finish with WRONG_PHASE and records one entry', async () => {
        const round = await aRevealedRound();
        await command(round, GAME_EVENTS.roundFinish, { finalEstimate: 5 });

        const { result, state } = await expectSilent(round.table, [round.anna.client], () =>
          round.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: 5 }),
        );

        expect(result).toEqual(failedAck('WRONG_PHASE'));
        expect(state.history).toHaveLength(1);
      });

      it('rejects a voter with FORBIDDEN even for an invalid payload, and a stranger too', async () => {
        const round = await aRevealedRound();
        const stranger = await connect();

        const { result, state } = await expectSilent(round.table, [round.bob.client], async () => [
          await round.anna.client.emit(GAME_EVENTS.roundFinish, { finalEstimate: 5 }),
          await round.anna.client.emit(GAME_EVENTS.roundFinish, { skip: true }),
          await round.anna.client.emit(GAME_EVENTS.roundFinish, { finalEstimate: 'coffee' }),
          await stranger.emit(GAME_EVENTS.roundFinish, { skip: true }),
        ]);

        expect(result).toEqual(Array(4).fill(failedAck('FORBIDDEN')));
        expect(state.phase).toBe('revealed');
        expect(state.history).toEqual([]);
      });

      it('is processed without an ack callback', async () => {
        const round = await aRevealedRound();
        const marks = round.everyone.map((c) => c.events.length);

        round.facilitator.socket.emit(GAME_EVENTS.roundFinish, { skip: true });

        const states = await Promise.all(
          round.everyone.map((c, i) => c.nextState(marks[i] as number)),
        );
        expect(states[0]?.history).toHaveLength(1);
      });

      it('shows the history to a voter who joins or rejoins afterwards', async () => {
        const round = await aRevealedRound();
        await command(round, GAME_EVENTS.roundFinish, { finalEstimate: 13 });

        const tab = await aTabOf(round.table, round.anna);
        const late = await aVoter(round.table, 'Cy');

        const rejoined = await tab.stateWhere(() => true);
        expect(rejoined.history).toEqual([
          { title: 'Login page', url: 'https://example.com/story', estimate: 13 },
        ]);
        expect(tab.mine).toEqual([null]);
        const joined = await late.client.stateWhere(hasVoter('Cy', true));
        expect(joined.total).toBe(13);
      });

      it('logs only the event name, gameId and code, never a title or card', async () => {
        const round = await aRevealedRound();

        await round.anna.client.emit(GAME_EVENTS.roundFinish, { finalEstimate: 13 });
        await round.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: 'coffee' });

        const rejected = logged
          .filter((line) => line.startsWith('{'))
          .map((line) => JSON.parse(line) as Record<string, unknown>)
          .filter((e) => e.event === 'round.rejected');
        expect(rejected.map((e) => e.code)).toEqual(['FORBIDDEN', 'INVALID_CARD']);
        rejected.forEach((e) =>
          expect(Object.keys(e).sort()).toEqual(['code', 'event', 'gameId', 'level']),
        );
        expect(logged.join('\n')).not.toMatch(/Anna|Login page|coffee/);
      });
    });
  });

  describe('facilitator offline and removing players (Story #6)', () => {
    const REMOVED_EVENT = 'player:removed';

    async function goOffline(round: Round): Promise<PublicGameState[]> {
      round.facilitator.socket.disconnect();
      return Promise.all(
        [round.anna.client, round.bob.client].map((c) =>
          c.stateWhere((s) => !s.facilitator.connected),
        ),
      );
    }

    const sawRemoved = (client: Client) =>
      client.when(() => client.events.find((e) => e.event === REMOVED_EVENT));
    // A disconnect is not a recorded event, so poll the socket.
    const isClosed = async (client: Client): Promise<void> => {
      for (let i = 0; i < 60 && client.socket.connected; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(client.socket.connected).toBe(false);
    };

    async function remove(round: Round, voter: Voter): Promise<PublicGameState> {
      const marks = [round.facilitator, round.bob.client].map((c) => c.events.length);
      expect(
        await round.facilitator.emit(GAME_EVENTS.playerRemove, { playerId: voter.playerId }),
      ).toEqual({ ok: true });
      return round.facilitator.nextState(marks[0] as number);
    }

    describe('facilitator offline and back (Req 8.1 to 8.4)', () => {
      it('keeps the game and its state when the facilitator disconnects and tells the voters', async () => {
        // Given
        const round = await aRound();
        await castAndSync(round, round.anna, 5);

        // When
        const states = await goOffline(round);

        // Then
        states.forEach((state) => {
          expect(state.facilitator).toEqual({ name: 'Fran', connected: false });
          expect(state.phase).toBe('voting');
          expect(state.story).toEqual({ title: 'Login page', url: 'https://example.com/story' });
          expect(voterOf(state, 'Anna').hasVoted).toBe(true);
        });
        expect(server.store.get(round.table.gameId)).toBeDefined();
      });

      it('lets voters pick, change and withdraw while the facilitator is offline', async () => {
        const round = await aRound();
        await goOffline(round);
        const marks = [round.anna.client, round.bob.client].map((c) => c.events.length);

        await cast(round.anna.client, 5);
        await cast(round.anna.client, 8);
        await cast(round.anna.client, null);
        await cast(round.anna.client, 13);

        const seen = await round.bob.client.stateWhere((s) => voterOf(s, 'Anna').hasVoted);
        expect(seen.phase).toBe('voting');
        await round.anna.client.when(() =>
          round.anna.client.mineSince(marks[0] as number).length >= 4 ? true : undefined,
        );
        expect(round.anna.client.mineSince(marks[0] as number)).toEqual([5, 8, null, 13]);
      });

      it('rejects every facilitator-only event from a voter while the facilitator is offline', async () => {
        const round = await aRevealedHelper();
        await goOffline(round);
        const bob = round.bob.client;
        const marks = bob.events.length;

        const results = [
          await round.anna.client.emit(GAME_EVENTS.storySet, {
            title: 'Mine',
            url: 'https://example.com/story',
          }),
          await round.anna.client.emit(GAME_EVENTS.roundReveal, undefined),
          await round.anna.client.emit(GAME_EVENTS.roundRevote, undefined),
          await round.anna.client.emit(GAME_EVENTS.roundFinish, { skip: true }),
          await round.anna.client.emit(GAME_EVENTS.roundFinish, { finalEstimate: 5 }),
          await round.anna.client.emit(GAME_EVENTS.playerRemove, { playerId: round.bob.playerId }),
        ];

        expect(results).toEqual(Array(6).fill(failedAck('FORBIDDEN')));
        expect(bob.kindsSince(marks)).toEqual([]);
        expect(server.store.get(round.table.gameId)?.phase).toBe('revealed');
      });

      it('gives the facilitator the role back with the token, keeping the round, and tells everyone', async () => {
        // Given
        const round = await aRevealedHelper();
        await goOffline(round);

        // When
        const back = await connect();
        const ack = await back.join({
          gameId: round.table.gameId,
          token: round.table.facilitatorToken,
        });
        const joined = await back.when(
          () => back.events.find((e) => e.event === GAME_EVENTS.joined)?.payload as GameJoined,
        );
        const states = await Promise.all(
          [back, round.anna.client, round.bob.client].map((c) =>
            c.stateWhere((s) => s.facilitator.connected && s.phase === 'revealed'),
          ),
        );

        // Then
        expect(ack).toEqual({ ok: true });
        expect(joined.role).toBe('facilitator');
        expect(joined.token).toBeUndefined();
        states.forEach((state) => {
          expect(state.phase).toBe('revealed');
          expect(voterOf(state, 'Anna').card).toBe(3);
          expect(state.results?.average).toBe(5.5);
        });
        expect(back.mine).toEqual([]);
        expect(await back.emit(GAME_EVENTS.roundRevote, undefined)).toEqual({ ok: true });
      });

      it('never gives the role to someone who joins by name, even with a spoofed role', async () => {
        const round = await aRound();
        await goOffline(round);

        const stranger = await connect();
        const ack = await stranger.join({
          gameId: round.table.gameId,
          name: 'Mallory',
          role: 'facilitator',
          playerId: round.table.facilitator ? 'x' : 'y',
        });
        const joined = await stranger.when(
          () => stranger.events.find((e) => e.event === GAME_EVENTS.joined)?.payload as GameJoined,
        );
        const sameName = await (await connect()).join({ gameId: round.table.gameId, name: 'fran' });

        expect(ack).toEqual({ ok: true });
        expect(joined.role).toBe('voter');
        expect(sameName).toEqual(failedAck('NAME_TAKEN'));
        expect(await stranger.emit(GAME_EVENTS.roundReveal, undefined)).toEqual(
          failedAck('FORBIDDEN'),
        );
      });
    });

    describe('player:remove (Req 8.5, 8.6)', () => {
      it('removes the voter: ack, player:removed, disconnect, then a state without them', async () => {
        // Given
        const round = await aRound();
        await castAndSync(round, round.anna, 5);
        await castAndSync(round, round.bob, 8);
        const bobMark = round.bob.client.events.length;

        // When
        const started = Date.now();
        const state = await remove(round, round.anna);

        // Then
        expect(Date.now() - started).toBeLessThan(BROADCAST_BUDGET_MS);
        await sawRemoved(round.anna.client);
        await isClosed(round.anna.client);
        expect(publicGameStateSchema.safeParse(state).success).toBe(true);
        expect(state.voters.map((v) => v.name)).toEqual(['Bob']);
        expect(JSON.stringify(state)).not.toContain(round.anna.playerId);
        const bobState = await round.bob.client.nextState(bobMark);
        expect(bobState.voters.map((v) => v.name)).toEqual(['Bob']);
        expect(voterOf(bobState, 'Bob').hasVoted).toBe(true);
        expect(server.store.get(round.table.gameId)?.votes.has(round.anna.playerId)).toBe(false);
      });

      it('sends player:removed to the removed voter only, in every tab, and nothing to others', async () => {
        const round = await aRound();
        const tab = await aTabOf(round.table, round.anna);
        const marks = [round.facilitator, round.bob.client].map((c) => c.events.length);

        await remove(round, round.anna);

        await sawRemoved(round.anna.client);
        await sawRemoved(tab);
        await Promise.all([isClosed(round.anna.client), isClosed(tab)]);
        await settle(round.table, [round.bob.client]);
        for (const [i, c] of [round.facilitator, round.bob.client].entries()) {
          expect(c.kindsSince(marks[i] as number)).not.toContain(REMOVED_EVENT);
          expect(c.socket.connected).toBe(true);
        }
      });

      it('rejects the removed token with REMOVED, but lets a new name and the freed name join', async () => {
        // Given
        const round = await aRound();
        await remove(round, round.anna);
        await isClosed(round.anna.client);

        // When
        const withToken = await (
          await connect()
        ).join({
          gameId: round.table.gameId,
          token: round.anna.token,
        });
        const newcomer = await aVoter(round.table, 'Anna');

        // Then
        expect(withToken).toEqual(failedAck('REMOVED'));
        expect(newcomer.token).not.toBe(round.anna.token);
        expect(newcomer.playerId).not.toBe(round.anna.playerId);
        expect(
          await (await connect()).join({ gameId: round.table.gameId, token: round.anna.token }),
        ).toEqual(failedAck('REMOVED'));
      });

      it('keeps the other voters votes while voting and recalculates the results when revealed', async () => {
        const voting = await aRound();
        await castAndSync(voting, voting.anna, 3);
        await castAndSync(voting, voting.bob, 8);
        const afterVoting = await remove(voting, voting.anna);
        const revealed = await aRevealedHelper();

        const afterReveal = await remove(revealed, revealed.bob);

        expect(voterOf(afterVoting, 'Bob').hasVoted).toBe(true);
        expect(afterVoting.phase).toBe('voting');
        expect(afterReveal.phase).toBe('revealed');
        expect(afterReveal.results).toMatchObject({
          average: 3,
          distribution: [{ card: 3, count: 1 }],
        });
        expect(afterReveal.voters.map((v) => v.name)).toEqual(['Anna']);
      });

      it('removes a voter while waiting and allows removing an offline voter', async () => {
        const round = await aRound({ voting: false });
        round.bob.client.socket.disconnect();
        await round.facilitator.stateWhere(hasVoter('Bob', false));

        const state = await remove(round, round.bob);

        expect(state.phase).toBe('waiting');
        expect(state.voters.map((v) => v.name)).toEqual(['Anna']);
      });

      it('rejects a voter with FORBIDDEN for any object payload, and changes nothing', async () => {
        const round = await aRound();

        const { result, state } = await expectSilent(round.table, [round.bob.client], async () => [
          await round.anna.client.emit(GAME_EVENTS.playerRemove, { playerId: round.bob.playerId }),
          await round.anna.client.emit(GAME_EVENTS.playerRemove, {}),
          await round.anna.client.emit(GAME_EVENTS.playerRemove, { playerId: 5 }),
          await (await connect()).emit(GAME_EVENTS.playerRemove, { playerId: round.bob.playerId }),
        ]);

        expect(result).toEqual(Array(4).fill(failedAck('FORBIDDEN')));
        expect(state.voters.map((v) => v.name)).toEqual(['Anna', 'Bob', 'Probe1']);
        expect(round.bob.client.socket.connected).toBe(true);
      });

      it.each([
        [{ playerId: 'nobody' }],
        [{}],
        [{ playerId: 5 }],
        [{ playerId: null }],
        [{ playerId: ['x'] }],
        ['anna'],
        [null],
        [[]],
      ] as Array<[unknown]>)(
        'rejects %j from the facilitator with INVALID_PAYLOAD and changes nothing',
        async (payload) => {
          const round = await aRound();

          const { result, state } = await expectSilent(round.table, [round.anna.client], () =>
            round.facilitator.emit(GAME_EVENTS.playerRemove, payload),
          );

          expect(result).toEqual(failedAck('INVALID_PAYLOAD'));
          expect(state.voters.map((v) => v.name)).toEqual(['Anna', 'Bob', 'Probe1']);
          expect(round.anna.client.socket.connected).toBe(true);
        },
      );

      it('rejects removing the facilitator and removing the same voter twice', async () => {
        const round = await aRound();
        const facilitatorId = server.store.get(round.table.gameId)!.facilitatorId;
        await remove(round, round.anna);

        expect(
          await round.facilitator.emit(GAME_EVENTS.playerRemove, { playerId: facilitatorId }),
        ).toEqual(failedAck('INVALID_PAYLOAD'));
        expect(
          await round.facilitator.emit(GAME_EVENTS.playerRemove, { playerId: round.anna.playerId }),
        ).toEqual(failedAck('INVALID_PAYLOAD'));
        expect(server.store.get(round.table.gameId)?.players.has(facilitatorId)).toBe(true);
      });

      it('is processed without an ack callback', async () => {
        const round = await aRound();

        round.facilitator.socket.emit(GAME_EVENTS.playerRemove, { playerId: round.anna.playerId });

        await sawRemoved(round.anna.client);
      });

      it('logs only event names, gameId and codes, never names, tokens or ids', async () => {
        const round = await aRound();

        await round.anna.client.emit(GAME_EVENTS.playerRemove, { playerId: round.bob.playerId });
        await remove(round, round.bob);

        const entries = logged
          .filter((line) => line.startsWith('{'))
          .map((line) => JSON.parse(line) as Record<string, unknown>)
          .filter((e) => String(e.event).startsWith('player.remove'));
        expect(entries.map((e) => [e.event, e.code])).toEqual([
          ['player.remove.rejected', 'FORBIDDEN'],
          ['player.removed', undefined],
        ]);
        entries.forEach((e) => {
          expect(
            Object.keys(e).every((k) => ['level', 'event', 'gameId', 'code'].includes(k)),
          ).toBe(true);
        });
        [round.bob.token, round.bob.playerId, round.bob.name].forEach((secret) =>
          expect(logged.join('\n')).not.toContain(secret),
        );
      });
    });

    // A revealed round with Anna on 3 and Bob on 8.
    async function aRevealedHelper(): Promise<Round> {
      const round = await aRound();
      await castAndSync(round, round.anna, 3);
      await castAndSync(round, round.bob, 8);
      const marks = round.everyone.map((c) => c.events.length);
      expect(await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined)).toEqual({
        ok: true,
      });
      await Promise.all(round.everyone.map((c, i) => c.nextState(marks[i] as number)));
      return round;
    }
  });

  describe('story:set with a link and no title (Story #28)', () => {
    const LINK = 'https://example.com/story/1';

    it('opens voting for everyone with the link and an empty title', async () => {
      const round = await aRound({ voting: false });

      const ack = await round.facilitator.emit(GAME_EVENTS.storySet, { url: LINK });
      const states = await Promise.all(
        round.everyone.map((c) => c.stateWhere((s) => s.phase === 'voting')),
      );

      expect(ack).toEqual({ ok: true });
      states.forEach((state) => expect(state.story).toEqual({ title: '', url: LINK }));
    });

    it.each([
      ['an empty title with a link', { title: '', url: LINK }],
      ['a whitespace title with a link', { title: '   ', url: `  ${LINK}  ` }],
    ])('accepts %s and stores the trimmed link', async (_label, payload) => {
      const round = await aRound({ voting: false });

      expect(await round.facilitator.emit(GAME_EVENTS.storySet, payload)).toEqual({ ok: true });

      const state = await round.anna.client.stateWhere((s) => s.phase === 'voting');
      expect(state.story).toEqual({ title: '', url: LINK });
    });

    it.each([
      ['neither a title nor a link', {}],
      ['a blank title and a blank link', { title: ' ', url: ' ' }],
      ['an unsafe link and no title', { url: 'javascript:alert(1)' }],
      ['a relative link and no title', { title: '', url: '/story/1' }],
      ['a null link and no title', { title: '', url: null }],
    ])('rejects %s with INVALID_STORY and changes nothing', async (_label, payload) => {
      const round = await aRound({ voting: false });

      const { result, state } = await expectSilent(round.table, [round.anna.client], () =>
        round.facilitator.emit(GAME_EVENTS.storySet, payload),
      );

      expect(result).toEqual(failedAck('INVALID_STORY'));
      expect(state.phase).toBe('waiting');
      expect(state.story).toBeNull();
    });

    it('keeps the votes when a link-only story gets a title later, and records it in the history', async () => {
      const round = await aRound({ voting: false });
      await round.facilitator.emit(GAME_EVENTS.storySet, { url: LINK });
      await round.anna.client.stateWhere((s) => s.phase === 'voting');
      await castAndSync(round, round.anna, 5);

      expect(
        await round.facilitator.emit(GAME_EVENTS.storySet, { title: 'Login page', url: LINK }),
      ).toEqual({ ok: true });
      const edited = await round.bob.client.stateWhere((s) => s.story?.title === 'Login page');
      expect(voterOf(edited, 'Anna').hasVoted).toBe(true);
      await round.facilitator.emit(GAME_EVENTS.storySet, { url: LINK });
      await round.bob.client.stateWhere((s) => s.story?.title === '');
      const marks = round.everyone.map((c) => c.events.length);
      await round.facilitator.emit(GAME_EVENTS.roundReveal, undefined);
      await Promise.all(round.everyone.map((c, i) => c.nextState(marks[i] as number)));
      await round.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: 5 });

      const state = await round.bob.client.stateWhere((s) => s.history.length === 1);
      expect(state.history).toEqual([{ title: '', url: LINK, estimate: 5 }]);
    });

    it('still rejects a voter with FORBIDDEN, before looking at the story', async () => {
      const round = await aRound({ voting: false });

      expect(await round.anna.client.emit(GAME_EVENTS.storySet, { url: LINK })).toEqual(
        failedAck('FORBIDDEN'),
      );
      expect(await round.anna.client.emit(GAME_EVENTS.storySet, {})).toEqual(
        failedAck('FORBIDDEN'),
      );
    });
  });
});
