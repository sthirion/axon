import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECK, ERROR_MESSAGES, type PublicGameState } from '@axon/shared';
import { GameStore } from '../store/gameStore.js';
import { gameRoom, playerRoom, registerGateway } from './gateway.js';
import { FakeIo, type FakeSocket } from './testing/fakes.js';

interface Setup {
  io: FakeIo;
  store: GameStore;
  gameId: string;
  facilitatorToken: string;
  facilitator: FakeSocket;
  join: (socketId: string, name: string) => { socket: FakeSocket; playerId: string; token: string };
}

function aSetup(): Setup {
  const io = new FakeIo();
  const store = new GameStore();
  registerGateway(io.asServer(), store);
  const { gameId, token } = store.createGame('Fran');
  const facilitator = io.connect('fran');
  facilitator.sendJoin({ gameId, token });
  const join = (socketId: string, name: string) => {
    const socket = io.connect(socketId);
    socket.sendJoin({ gameId, name });
    const joined = socket.emitted.find((e) => e.event === 'game:joined')!.payload as {
      playerId: string;
      token: string;
    };
    return { socket, playerId: joined.playerId, token: joined.token };
  };
  return { io, store, gameId, facilitatorToken: token, facilitator, join };
}

function failure(code: keyof typeof ERROR_MESSAGES) {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

function send(socket: FakeSocket, event: string, payload: unknown): unknown {
  return socket.send(event, payload);
}

function states(io: FakeIo): PublicGameState[] {
  return io.broadcasts
    .filter((b) => b.event === 'game:state')
    .map((b) => b.payload as PublicGameState);
}

function mark(io: FakeIo): number {
  return io.broadcasts.length;
}

function since(io: FakeIo, index: number) {
  return io.broadcasts.slice(index);
}

function voteMines(socket: FakeSocket) {
  return socket.emitted.filter((e) => e.event === 'vote:mine').map((e) => e.payload);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('story:set success', () => {
  it('acks ok, then broadcasts game:state to the game room, in that order', () => {
    const { io, gameId, facilitator } = aSetup();
    io.timeline.length = 0;
    const before = mark(io);

    const ack = send(facilitator, 'story:set', { title: 'Login page', url: 'https://e.com/1' });

    expect(ack).toEqual({ ok: true });
    expect(io.timeline).toEqual(['ack', 'broadcast:game:state']);
    expect(since(io, before)).toHaveLength(1);
    expect(since(io, before)[0]!.room).toBe(gameRoom(gameId));
  });

  it('broadcasts phase voting and the story with the link', () => {
    const { io, facilitator } = aSetup();

    send(facilitator, 'story:set', { title: ' Login page ', url: 'https://e.com/1' });

    expect(states(io).at(-1)).toMatchObject({
      phase: 'voting',
      story: { title: 'Login page', url: 'https://e.com/1' },
    });
  });

  it('broadcasts a story without a url key when the link is blank', () => {
    const { io, facilitator } = aSetup();

    send(facilitator, 'story:set', { title: 'Login page', url: '   ' });

    expect(states(io).at(-1)!.story).toStrictEqual({ title: 'Login page' });
  });

  it('does not send vote:mine to anyone', () => {
    const { io, facilitator } = aSetup();
    const before = mark(io);

    send(facilitator, 'story:set', { title: 'T' });

    expect(since(io, before).map((b) => b.event)).toEqual(['game:state']);
    expect(voteMines(facilitator)).toEqual([]);
  });

  it('keeps the votes when the story is edited while voting', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'A' });
    send(anna.socket, 'vote:cast', { card: 5 });

    send(facilitator, 'story:set', { title: 'B' });

    const last = states(io).at(-1)!;
    expect(last.story).toEqual({ title: 'B' });
    expect(last.voters[0]!.hasVoted).toBe(true);
  });

  it('is processed without an ack callback', () => {
    const { io, facilitator } = aSetup();

    expect(() => facilitator.trigger('story:set', { title: 'T' })).not.toThrow();

    expect(states(io).at(-1)!.phase).toBe('voting');
  });
});

describe('vote:cast success', () => {
  it('acks, sends vote:mine to the player room, then broadcasts game:state, in that order', () => {
    const { io, gameId, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    io.timeline.length = 0;
    const before = mark(io);

    const ack = send(anna.socket, 'vote:cast', { card: 8 });

    expect(ack).toEqual({ ok: true });
    expect(io.timeline).toEqual(['ack', 'broadcast:vote:mine', 'broadcast:game:state']);
    expect(since(io, before)).toEqual([
      { room: playerRoom(anna.playerId), event: 'vote:mine', payload: { card: 8 } },
      { room: gameRoom(gameId), event: 'game:state', payload: expect.any(Object) },
    ]);
  });

  it.each([...DECK])('confirms card %j to the owner and marks the voter as voted', (card) => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });

    send(anna.socket, 'vote:cast', { card });

    const mine = io.broadcasts.filter((b) => b.event === 'vote:mine');
    expect(mine.at(-1)!.payload).toEqual({ card });
    expect(states(io).at(-1)!.voters[0]!.hasVoted).toBe(true);
  });

  it('sends the new card when the vote changes', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    send(anna.socket, 'vote:cast', { card: 3 });

    send(anna.socket, 'vote:cast', { card: 13 });

    expect(io.broadcasts.filter((b) => b.event === 'vote:mine').at(-1)!.payload).toEqual({
      card: 13,
    });
    expect(states(io).at(-1)!.voters[0]!.hasVoted).toBe(true);
  });

  it('withdraws with null: vote:mine carries null and hasVoted is false', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    send(anna.socket, 'vote:cast', { card: 3 });

    const ack = send(anna.socket, 'vote:cast', { card: null });

    expect(ack).toEqual({ ok: true });
    expect(io.broadcasts.filter((b) => b.event === 'vote:mine').at(-1)!.payload).toEqual({
      card: null,
    });
    expect(states(io).at(-1)!.voters[0]!.hasVoted).toBe(false);
  });

  it('treats withdrawing without a vote and re-casting the same card as full successes', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    const before = mark(io);

    expect(send(anna.socket, 'vote:cast', { card: null })).toEqual({ ok: true });
    expect(send(anna.socket, 'vote:cast', { card: 5 })).toEqual({ ok: true });
    expect(send(anna.socket, 'vote:cast', { card: 5 })).toEqual({ ok: true });

    expect(since(io, before).map((b) => b.event)).toEqual([
      'vote:mine',
      'game:state',
      'vote:mine',
      'game:state',
      'vote:mine',
      'game:state',
    ]);
  });

  it('never puts a card value in game:state', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });

    for (const card of [...DECK, null]) {
      send(anna.socket, 'vote:cast', { card });
    }

    for (const state of states(io)) {
      expect(JSON.stringify(state)).not.toMatch(/"(card|vote|votes|value)"/);
    }
  });

  it('is processed without an ack callback', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });

    expect(() => anna.socket.trigger('vote:cast', { card: 5 })).not.toThrow();

    expect(states(io).at(-1)!.voters[0]!.hasVoted).toBe(true);
  });

  it('does not crash when the ack argument is not a function', () => {
    const { facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });

    expect(() => anna.socket.trigger('vote:cast', { card: 5 }, 'nope')).not.toThrow();
    expect(() => anna.socket.trigger('vote:cast', { card: 4 }, 'nope')).not.toThrow();
  });
});

describe('vote:mine on join', () => {
  it('goes to a joining voter after game:joined and before the room game:state', () => {
    const { io, gameId } = aSetup();
    io.timeline.length = 0;

    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: 'Anna' });

    expect(io.timeline).toEqual(['ack', 'game:joined', 'vote:mine', 'broadcast:game:state']);
    expect(voteMines(socket)).toEqual([{ card: null }]);
  });

  it('is sent on the joining socket only, not as a broadcast', () => {
    const { io, gameId } = aSetup();
    const before = mark(io);

    io.connect('s1').sendJoin({ gameId, name: 'Anna' });

    expect(since(io, before).map((b) => b.event)).toEqual(['game:state']);
  });

  it('restores the current card of a rejoining voter', () => {
    const { io, gameId, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    send(anna.socket, 'vote:cast', { card: 8 });
    anna.socket.trigger('disconnect');
    io.timeline.length = 0;

    const again = io.connect('s2');
    again.sendJoin({ gameId, token: anna.token });

    expect(io.timeline).toEqual(['ack', 'game:joined', 'vote:mine', 'broadcast:game:state']);
    expect(voteMines(again)).toEqual([{ card: 8 }]);
    expect(states(io).at(-1)!.voters[0]).toMatchObject({ connected: true, hasVoted: true });
  });

  it('keeps the vote and shows hasVoted while the voter is offline', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    send(anna.socket, 'vote:cast', { card: 8 });

    anna.socket.trigger('disconnect');

    expect(states(io).at(-1)!.voters[0]).toMatchObject({ connected: false, hasVoted: true });
  });

  it('sends null to a rejoining voter who withdrew', () => {
    const { io, gameId, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'T' });
    send(anna.socket, 'vote:cast', { card: 8 });
    send(anna.socket, 'vote:cast', { card: null });
    anna.socket.trigger('disconnect');

    const again = io.connect('s2');
    again.sendJoin({ gameId, token: anna.token });

    expect(voteMines(again)).toEqual([{ card: null }]);
  });

  it("never gives another voter someone else's card", () => {
    const { io, gameId, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    const bob = join('s2', 'Bob');
    send(facilitator, 'story:set', { title: 'T' });
    send(anna.socket, 'vote:cast', { card: 5 });
    bob.socket.trigger('disconnect');

    const again = io.connect('s3');
    again.sendJoin({ gameId, token: bob.token });

    expect(voteMines(again)).toEqual([{ card: null }]);
  });

  it('is never sent to the facilitator', () => {
    const { io, gameId, facilitator, facilitatorToken } = aSetup();
    const again = io.connect('f2');
    send(facilitator, 'story:set', { title: 'T' });

    again.sendJoin({ gameId, token: facilitatorToken });

    expect(voteMines(facilitator)).toEqual([]);
    expect(voteMines(again)).toEqual([]);
  });

  it('puts every socket of a player into the same player room', () => {
    const { io, gameId, join } = aSetup();
    const anna = join('s1', 'Anna');
    const second = io.connect('s2');

    second.sendJoin({ gameId, token: anna.token });

    expect(anna.socket.rooms).toContain(playerRoom(anna.playerId));
    expect(second.rooms).toContain(playerRoom(anna.playerId));
  });

  it('puts different players into different player rooms', () => {
    const { join } = aSetup();
    const anna = join('s1', 'Anna');
    const bob = join('s2', 'Bob');

    expect(anna.socket.rooms).not.toContain(playerRoom(bob.playerId));
    expect(bob.socket.rooms).not.toContain(playerRoom(anna.playerId));
  });
});

describe('story:set and vote:cast precedence', () => {
  it.each([
    ['story:set', { title: 'T' }],
    ['story:set', null],
    ['vote:cast', { card: 5 }],
    ['vote:cast', 'garbage'],
    ['vote:cast', undefined],
  ])('acks FORBIDDEN for an unjoined socket sending %s with %j', (event, payload) => {
    const { io } = aSetup();
    const before = mark(io);

    const ack = send(io.connect('stranger'), event, payload);

    expect(ack).toEqual(failure('FORBIDDEN'));
    expect(since(io, before)).toEqual([]);
  });

  it('keeps a socket whose join failed forbidden', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: '' });

    expect(send(socket, 'vote:cast', { card: 5 })).toEqual(failure('FORBIDDEN'));
  });

  it.each(['story:set', 'vote:cast'])(
    'acks GAME_NOT_FOUND for %s when the game is gone',
    (event) => {
      const { io, store, gameId, facilitator, join } = aSetup();
      const anna = join('s1', 'Anna');
      const socket = event === 'story:set' ? facilitator : anna.socket;
      vi.spyOn(store, 'get').mockReturnValue(undefined);
      const before = mark(io);

      expect(send(socket, event, 'garbage')).toEqual(failure('GAME_NOT_FOUND'));
      expect(since(io, before)).toEqual([]);
      expect(JSON.parse(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0]))).toMatchObject({
        code: 'GAME_NOT_FOUND',
        gameId,
      });
    },
  );

  it.each([null, 'x', [], 42, undefined])(
    'acks INVALID_PAYLOAD for story:set with %j',
    (payload) => {
      const { io, facilitator } = aSetup();
      const before = mark(io);

      expect(send(facilitator, 'story:set', payload)).toEqual(failure('INVALID_PAYLOAD'));
      expect(since(io, before)).toEqual([]);
    },
  );

  it.each([5, null, 'coffee', [], {}, { cards: 5 }, undefined])(
    'acks INVALID_PAYLOAD for vote:cast with %j',
    (payload) => {
      const { io, facilitator, join } = aSetup();
      const anna = join('s1', 'Anna');
      send(facilitator, 'story:set', { title: 'T' });
      const before = mark(io);

      expect(send(anna.socket, 'vote:cast', payload)).toEqual(failure('INVALID_PAYLOAD'));
      expect(since(io, before)).toEqual([]);
    },
  );

  it('checks the envelope before the role', () => {
    const { join } = aSetup();
    const anna = join('s1', 'Anna');

    expect(send(anna.socket, 'story:set', null)).toEqual(failure('INVALID_PAYLOAD'));
  });

  it.each([
    ['a valid payload', { title: 'Mine' }],
    ['an invalid title', { title: '' }],
  ])('acks FORBIDDEN when a voter sends story:set with %s', (_label, payload) => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    const before = mark(io);

    expect(send(anna.socket, 'story:set', payload)).toEqual(failure('FORBIDDEN'));
    expect(since(io, before)).toEqual([]);

    send(facilitator, 'story:set', { title: 'Theirs' });
    expect(states(io).at(-1)!.story).toEqual({ title: 'Theirs' });
  });

  it.each([{ card: 5 }, { card: null }, { card: 4 }])(
    'acks FORBIDDEN when the facilitator sends vote:cast %j, even while waiting',
    (payload) => {
      const { io, facilitator } = aSetup();
      const before = mark(io);

      expect(send(facilitator, 'vote:cast', payload)).toEqual(failure('FORBIDDEN'));
      expect(since(io, before)).toEqual([]);
    },
  );

  it('acks FORBIDDEN when the facilitator votes while voting', () => {
    const { io, facilitator } = aSetup();
    send(facilitator, 'story:set', { title: 'T' });
    const before = mark(io);

    expect(send(facilitator, 'vote:cast', { card: 5 })).toEqual(failure('FORBIDDEN'));
    expect(since(io, before)).toEqual([]);
  });

  it.each([{ card: 5 }, { card: null }, { card: 4 }])(
    'acks WRONG_PHASE when a voter sends vote:cast %j while waiting',
    (payload) => {
      const { io, join } = aSetup();
      const anna = join('s1', 'Anna');
      const before = mark(io);

      expect(send(anna.socket, 'vote:cast', payload)).toEqual(failure('WRONG_PHASE'));
      expect(since(io, before)).toEqual([]);
    },
  );

  it.each([
    ['an empty title', { title: '' }],
    ['a missing title', {}],
    ['a javascript link', { title: 'T', url: 'javascript:alert(1)' }],
    ['a null link', { title: 'T', url: null }],
  ])('acks INVALID_STORY for %s and keeps the game waiting', (_label, payload) => {
    const { io, store, gameId, facilitator } = aSetup();
    const before = mark(io);

    expect(send(facilitator, 'story:set', payload)).toEqual(failure('INVALID_STORY'));
    expect(since(io, before)).toEqual([]);
    expect(store.get(gameId)!.phase).toBe('waiting');
  });

  it('keeps story and votes after an invalid edit while voting', () => {
    const { io, facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(facilitator, 'story:set', { title: 'A' });
    send(anna.socket, 'vote:cast', { card: 5 });
    const before = mark(io);

    expect(send(facilitator, 'story:set', { title: '' })).toEqual(failure('INVALID_STORY'));

    expect(since(io, before)).toEqual([]);
    send(facilitator, 'story:set', { title: 'A' });
    expect(states(io).at(-1)!.voters[0]!.hasVoted).toBe(true);
  });

  it.each([4, '5', 5.5, -1, 'Coffee', '☕', '', true, {}, []])(
    'acks INVALID_CARD for %j, sends nothing and keeps the previous vote',
    (card) => {
      const { io, facilitator, join } = aSetup();
      const anna = join('s1', 'Anna');
      send(facilitator, 'story:set', { title: 'T' });
      send(anna.socket, 'vote:cast', { card: 3 });
      const before = mark(io);

      expect(send(anna.socket, 'vote:cast', { card })).toEqual(failure('INVALID_CARD'));

      expect(since(io, before)).toEqual([]);
      expect(states(io).at(-1)!.voters[0]!.hasVoted).toBe(true);
    },
  );

  it('processes events without an ack callback even when they fail', () => {
    const { io, facilitator } = aSetup();

    expect(() => io.connect('x').trigger('story:set', { title: 'T' })).not.toThrow();
    expect(() => facilitator.trigger('vote:cast', { card: 5 })).not.toThrow();
  });

  it('answers with the fixed message and never echoes the submitted input', () => {
    const { facilitator } = aSetup();

    const ack = send(facilitator, 'story:set', { title: '<script>\talert(1)</script>' });

    expect(ack).toEqual(failure('INVALID_STORY'));
  });
});

describe('logging of story and vote events', () => {
  it('logs a rejection with only the event, gameId and code', () => {
    const { gameId, join } = aSetup();
    const anna = join('s1', 'Anna');

    send(anna.socket, 'story:set', { title: 'Secret project', url: 'https://secret.example' });

    expect(JSON.parse(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0]))).toEqual({
      level: 'warn',
      event: 'story.rejected',
      gameId,
      code: 'FORBIDDEN',
    });
  });

  it('logs a vote rejection with the event and code', () => {
    const { gameId, join } = aSetup();
    const anna = join('s1', 'Anna');

    send(anna.socket, 'vote:cast', { card: 5 });

    expect(JSON.parse(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0]))).toEqual({
      level: 'warn',
      event: 'vote.rejected',
      gameId,
      code: 'WRONG_PHASE',
    });
  });

  it('logs no gameId for an unjoined socket', () => {
    const { io } = aSetup();

    send(io.connect('stranger'), 'vote:cast', { card: 5 });

    expect(JSON.parse(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0]))).toEqual({
      level: 'warn',
      event: 'vote.rejected',
      code: 'FORBIDDEN',
    });
  });

  it('never logs titles, links, cards or tokens', () => {
    const { facilitator, join } = aSetup();
    const anna = join('s1', 'Anna');
    send(anna.socket, 'story:set', { title: 'Secret project', url: 'https://secret.example' });
    send(facilitator, 'story:set', { title: 'Hidden title', url: 'https://hidden.example' });
    send(anna.socket, 'vote:cast', { card: 'coffee' });
    send(anna.socket, 'vote:cast', { card: 'sneaky-card' });

    const output = JSON.stringify([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
    ]);

    for (const secret of [
      'Secret project',
      'secret.example',
      'Hidden title',
      'hidden.example',
      'coffee',
      'sneaky-card',
      anna.token,
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});

describe('round:reveal', () => {
  function aVotingRound() {
    const setup = aSetup();
    const anna = setup.join('anna', 'Anna');
    const bob = setup.join('bob', 'Bob');
    send(setup.facilitator, 'story:set', { title: 'Login page' });
    return { ...setup, anna, bob };
  }

  it('acks ok, then broadcasts one game:state with cards and results, and sends no vote:mine', () => {
    const { io, facilitator, anna, bob } = aVotingRound();
    send(anna.socket, 'vote:cast', { card: 3 });
    send(bob.socket, 'vote:cast', { card: 8 });
    io.timeline.length = 0;
    const before = mark(io);
    const minesBefore = voteMines(anna.socket).length;

    const ack = send(facilitator, 'round:reveal', undefined);

    expect(ack).toEqual({ ok: true });
    expect(io.timeline).toEqual(['ack', 'broadcast:game:state']);
    const sent = since(io, before);
    expect(sent).toHaveLength(1);
    const state = sent[0]?.payload as PublicGameState;
    expect(state?.phase).toBe('revealed');
    expect(state?.voters.map((v) => v.card)).toEqual([3, 8]);
    expect(state?.results).toMatchObject({
      average: 5.5,
      outlierIds: [anna.playerId, bob.playerId],
    });
    expect(voteMines(anna.socket)).toHaveLength(minesBefore);
  });

  it('ignores any payload', () => {
    const { facilitator, anna } = aVotingRound();
    send(anna.socket, 'vote:cast', { card: 3 });

    expect(send(facilitator, 'round:reveal', { phase: 'waiting', junk: [1] })).toEqual({
      ok: true,
    });
  });

  it('is processed without an ack callback', () => {
    const { io, facilitator, anna } = aVotingRound();
    send(anna.socket, 'vote:cast', { card: 3 });

    facilitator.trigger('round:reveal');

    expect(states(io).at(-1)?.phase).toBe('revealed');
  });

  it('rejects a reveal with no vote with WRONG_PHASE and no broadcast', () => {
    const { io, facilitator } = aVotingRound();
    const before = mark(io);

    expect(send(facilitator, 'round:reveal', undefined)).toEqual(failure('WRONG_PHASE'));
    expect(since(io, before)).toEqual([]);
  });

  it('rejects a voter with FORBIDDEN and no broadcast', () => {
    const { io, anna } = aVotingRound();
    send(anna.socket, 'vote:cast', { card: 3 });
    const before = mark(io);

    expect(send(anna.socket, 'round:reveal', undefined)).toEqual(failure('FORBIDDEN'));
    expect(since(io, before)).toEqual([]);
  });

  it('rejects a socket that never joined with FORBIDDEN', () => {
    const { io } = aVotingRound();

    expect(send(io.connect('stranger'), 'round:reveal', undefined)).toEqual(failure('FORBIDDEN'));
  });

  it('rejects a second reveal, vote:cast and story:set after the reveal with WRONG_PHASE', () => {
    const { io, facilitator, anna } = aVotingRound();
    send(anna.socket, 'vote:cast', { card: 3 });
    send(facilitator, 'round:reveal', undefined);
    const before = mark(io);

    expect(send(facilitator, 'round:reveal', undefined)).toEqual(failure('WRONG_PHASE'));
    expect(send(anna.socket, 'vote:cast', { card: 5 })).toEqual(failure('WRONG_PHASE'));
    expect(send(anna.socket, 'vote:cast', { card: null })).toEqual(failure('WRONG_PHASE'));
    expect(send(facilitator, 'story:set', { title: 'Other' })).toEqual(failure('WRONG_PHASE'));
    expect(since(io, before)).toEqual([]);
  });

  it('does not log cards, names or tokens', () => {
    const { facilitator, anna } = aVotingRound();
    send(anna.socket, 'vote:cast', { card: 13 });
    const log = vi.spyOn(console, 'warn');

    send(anna.socket, 'round:reveal', undefined);

    expect(JSON.stringify(log.mock.calls)).toContain('FORBIDDEN');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/13|Anna|Login/);
    expect(facilitator).toBeDefined();
  });
});
