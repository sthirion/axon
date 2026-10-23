import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  deckOf,
  estimateCardsOf,
  failedAck,
  GAME_EVENTS,
  publicGameStateSchema,
  SCALES,
  type Ack,
  type Card,
  type PublicGameState,
  type Scale,
} from '@axon/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { attachSocketIo } from '../src/realtime/socketServer.js';
import { GameStore } from '../src/store/gameStore.js';

const MISSING_STATIC_DIR = path.join(os.tmpdir(), 'axon-scales-spec-no-static');

class Client {
  readonly events: Array<{ event: string; payload: unknown }> = [];

  constructor(readonly socket: Socket) {
    socket.onAny((event: string, ...args: unknown[]) =>
      this.events.push({ event, payload: args[0] }),
    );
  }

  get states(): PublicGameState[] {
    return this.events
      .filter((e) => e.event === GAME_EVENTS.state)
      .map((e) => e.payload as PublicGameState);
  }

  get mine(): unknown[] {
    return this.events
      .filter((e) => e.event === GAME_EVENTS.voteMine)
      .map((e) => (e.payload as { card: unknown }).card);
  }

  emit(event: string, payload?: unknown): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  async state(
    predicate: (state: PublicGameState) => boolean = () => true,
  ): Promise<PublicGameState> {
    const deadline = Date.now() + 4000;
    for (;;) {
      const found = this.states.filter(predicate).at(-1);
      if (found) return found;
      if (Date.now() > deadline) throw new Error('Timed out waiting for a matching game:state');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe('voting scales over Socket.IO and REST', () => {
  let store: GameStore;
  let io: SocketServer;
  let baseUrl: string;
  let clients: Client[];

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

  // A session of the given scale with a facilitator and two voters, voting on a story.
  async function aSession(scale: Scale | undefined) {
    const created = (await (
      await fetch(`${baseUrl}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scale === undefined ? { name: 'Fran' } : { name: 'Fran', scale }),
      })
    ).json()) as { gameId: string; token: string };
    const facilitator = await connect();
    expect(await facilitator.emit(GAME_EVENTS.join, created)).toEqual({ ok: true });
    const voter = async (name: string) => {
      const client = await connect();
      expect(await client.emit(GAME_EVENTS.join, { gameId: created.gameId, name })).toEqual({
        ok: true,
      });
      await client.state((s) => s.voters.some((v) => v.name === name));
      return client;
    };
    const anna = await voter('Anna');
    const bob = await voter('Bob');
    expect(
      await facilitator.emit(GAME_EVENTS.storySet, {
        title: 'Login page',
        url: 'https://example.com/story',
      }),
    ).toEqual({
      ok: true,
    });
    await Promise.all([anna, bob].map((c) => c.state((s) => s.phase === 'voting')));
    return { ...created, facilitator, anna, bob };
  }

  const reveal = async (s: Awaited<ReturnType<typeof aSession>>) => {
    expect(await s.facilitator.emit(GAME_EVENTS.roundReveal)).toEqual({ ok: true });
    return s.anna.state((state) => state.phase === 'revealed');
  };
  const vote = async (client: Client, card: Card | null) => {
    const before = client.mine.length;
    expect(await client.emit(GAME_EVENTS.voteCast, { card })).toEqual({ ok: true });
    for (let i = 0; i < 200 && client.mine.length === before; i++)
      await new Promise((r) => setTimeout(r, 10));
  };

  beforeEach(async () => {
    clients = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store = new GameStore();
    const server = http.createServer(createApp({ staticDir: MISSING_STATIC_DIR, store }));
    io = attachSocketIo(server, store);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    clients.forEach((c) => {
      c.states.forEach((state) =>
        expect(publicGameStateSchema.safeParse(state).success).toBe(true),
      );
      c.socket.disconnect();
    });
    await io.close();
    vi.restoreAllMocks();
  });

  describe('the scale is part of the session', () => {
    it.each<[Scale | undefined, Scale]>([
      [undefined, 'fibonacci'],
      ['fibonacci', 'fibonacci'],
      ['incremental', 'incremental'],
      ['tshirt', 'tshirt'],
    ])(
      'a session created with %s is a %s session for everyone, from the first state',
      async (asked, scale) => {
        const s = await aSession(asked);

        for (const client of [s.facilitator, s.anna, s.bob]) {
          const first = client.states[0] as PublicGameState;
          expect(first.scale).toBe(scale);
          expect((await client.state()).total).toBe(scale === 'tshirt' ? null : 0);
        }
      },
    );

    it('a late joiner and a rejoining voter see the scale', async () => {
      const s = await aSession('tshirt');

      const late = await connect();
      await late.emit(GAME_EVENTS.join, { gameId: s.gameId, name: 'Cy' });
      const back = await connect();
      const annaToken = (
        s.anna.events.find((e) => e.event === GAME_EVENTS.joined)?.payload as { token: string }
      ).token;
      await back.emit(GAME_EVENTS.join, { gameId: s.gameId, token: annaToken });

      expect((await late.state()).scale).toBe('tshirt');
      expect((await back.state()).scale).toBe('tshirt');
    });

    it('rejects an unknown scale over REST and creates no session', async () => {
      const res = await fetch(`${baseUrl}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fran', scale: 'huge' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        code: 'INVALID_SCALE',
        message: 'Choose Fibonacci, incremental or t-shirt sizes.',
      });
    });
  });

  describe('vote:cast only accepts the cards of the scale', () => {
    it.each(SCALES)('%s accepts every card of its deck', async (scale) => {
      const s = await aSession(scale);

      for (const card of deckOf(scale)) {
        expect(await s.anna.emit(GAME_EVENTS.voteCast, { card }), String(card)).toEqual({
          ok: true,
        });
      }
    });

    it.each<[Scale, Card[]]>([
      ['fibonacci', ['M', 'XL', 4, 10] as Card[]],
      ['incremental', ['M', 11, 13, 21] as Card[]],
      ['tshirt', [0, 5, 13, 'XXL'] as Card[]],
    ])('%s rejects foreign cards with INVALID_CARD and keeps the vote', async (scale, foreign) => {
      const s = await aSession(scale);
      await vote(s.anna, '?');

      for (const card of foreign) {
        expect(await s.anna.emit(GAME_EVENTS.voteCast, { card }), String(card)).toEqual(
          failedAck('INVALID_CARD'),
        );
      }
      expect(store.get(s.gameId)?.votes.size).toBe(1);
      expect(s.anna.mine.at(-1)).toBe('?');
    });
  });

  describe('results per scale', () => {
    it.each<[Scale, Card, Card, object]>([
      ['fibonacci', 3, 8, { average: 5.5, median: 8, suggestedEstimate: 5, consensus: false }],
      ['incremental', 4, 6, { average: 5, median: 6, suggestedEstimate: 5, consensus: false }],
      ['incremental', 7, 7, { average: 7, median: 7, suggestedEstimate: 7, consensus: true }],
      [
        'tshirt',
        'S',
        'XL',
        { average: null, median: 'XL', suggestedEstimate: 'XL', consensus: false },
      ],
      ['tshirt', 'M', 'M', { average: null, median: 'M', suggestedEstimate: 'M', consensus: true }],
    ])('%s: %s and %s', async (scale, first, second, expected) => {
      const s = await aSession(scale);
      await vote(s.anna, first);
      await vote(s.bob, second);

      const state = await reveal(s);

      expect(state.results).toMatchObject(expected);
      expect(state.voters.map((v) => v.card)).toEqual([first, second]);
    });

    it('t-shirt distribution and outliers use the size order', async () => {
      const s = await aSession('tshirt');
      await vote(s.anna, 'XL');
      await vote(s.bob, 'S');

      const state = await reveal(s);

      expect(state.results?.distribution).toEqual([
        { card: 'S', count: 1 },
        { card: 'XL', count: 1 },
      ]);
      expect(state.results?.outlierIds).toHaveLength(2);
    });

    it('? and coffee are shown but left out of every scale', async () => {
      for (const scale of SCALES) {
        const s = await aSession(scale);
        await vote(s.anna, '?');
        await vote(s.bob, 'coffee');

        const state = await reveal(s);

        expect(state.results).toMatchObject({
          average: null,
          median: null,
          suggestedEstimate: null,
          consensus: false,
        });
      }
    });
  });

  describe('round:finish only accepts the sized cards of the scale', () => {
    it.each(SCALES)('%s records each sized card, and %s never ? or coffee', async (scale) => {
      for (const card of estimateCardsOf(scale)) {
        const s = await aSession(scale);
        await vote(s.anna, card);
        await reveal(s);

        expect(
          await s.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: card }),
          String(card),
        ).toEqual({ ok: true });
        const state = await s.anna.state((x) => x.history.length === 1);
        expect(state.history).toEqual([
          { title: 'Login page', url: 'https://example.com/story', estimate: card },
        ]);
      }
    });

    it.each<[Scale, unknown[]]>([
      ['fibonacci', ['?', 'coffee', 4, 'M', 10]],
      ['incremental', ['?', 'coffee', 11, 'M']],
      ['tshirt', ['?', 'coffee', 5, 'XXL', 'm']],
    ])('%s rejects %j with INVALID_CARD and records nothing', async (scale, bad) => {
      const s = await aSession(scale);
      await vote(s.anna, estimateCardsOf(scale)[1] as Card);
      await reveal(s);

      for (const finalEstimate of bad) {
        expect(
          await s.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate }),
          String(finalEstimate),
        ).toEqual(failedAck('INVALID_CARD'));
      }
      expect(store.get(s.gameId)?.history).toEqual([]);
    });
  });

  describe('the summary per scale', () => {
    async function twoStories(scale: Scale, first: Card, second: Card) {
      const s = await aSession(scale);
      await vote(s.anna, first);
      await reveal(s);
      await s.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: first });
      await s.facilitator.emit(GAME_EVENTS.storySet, {
        title: 'Checkout',
        url: 'https://example.com/story',
      });
      await s.anna.state((x) => x.phase === 'voting' && x.story?.title === 'Checkout');
      await vote(s.anna, second);
      await reveal(s);
      await s.facilitator.emit(GAME_EVENTS.roundFinish, { finalEstimate: second });
      return s.anna.state((x) => x.history.length === 2);
    }

    it.each<[Scale, Card, Card, number]>([
      ['fibonacci', 5, 8, 13],
      ['incremental', 4, 10, 14],
    ])('%s adds the numbers up', async (scale, first, second, total) => {
      expect((await twoStories(scale, first, second)).total).toBe(total);
    });

    it('t-shirt keeps the sizes and has no total', async () => {
      const state = await twoStories('tshirt', 'M', 'XL');

      expect(state.total).toBeNull();
      expect(state.history.map((h) => h.estimate)).toEqual(['M', 'XL']);
    });

    it('a skipped story counts as 0 in a numeric session and is just skipped in t-shirt', async () => {
      const numeric = await aSession('incremental');
      await numeric.facilitator.emit(GAME_EVENTS.roundFinish, { skip: true });
      const tshirt = await aSession('tshirt');
      await tshirt.facilitator.emit(GAME_EVENTS.roundFinish, { skip: true });

      expect((await numeric.anna.state((x) => x.history.length === 1)).total).toBe(0);
      const sized = await tshirt.anna.state((x) => x.history.length === 1);
      expect(sized.total).toBeNull();
      expect(sized.history[0]?.estimate).toBe('skipped');
    });
  });
});
