import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES, type PublicGameState } from '@axon/shared';
import { GameStore } from '../store/gameStore.js';
import { gameRoom, playerRoom, registerGateway } from './gateway.js';
import { FakeIo, type FakeSocket } from './testing/fakes.js';

const UNKNOWN_GAME_ID = 'Z'.repeat(22);

interface Setup {
  io: FakeIo;
  store: GameStore;
  gameId: string;
  facilitatorToken: string;
}

function aSetup(): Setup {
  const io = new FakeIo();
  const store = new GameStore();
  registerGateway(io.asServer(), store);
  const { gameId, token } = store.createGame('Sven');
  return { io, store, gameId, facilitatorToken: token };
}

function lastState(io: FakeIo): PublicGameState {
  const states = io.broadcasts.filter((b) => b.event === 'game:state');
  return states[states.length - 1]!.payload as PublicGameState;
}

function stateCount(io: FakeIo): number {
  return io.broadcasts.filter((b) => b.event === 'game:state').length;
}

function joinedPayload(socket: FakeSocket) {
  return socket.emitted.find((e) => e.event === 'game:joined')?.payload as
    { playerId: string; role: string; token?: string } | undefined;
}

function failure(code: keyof typeof ERROR_MESSAGES) {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('game:join by name', () => {
  it('acks ok, emits game:joined with a token, then broadcasts game:state, in that order', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');

    const ack = socket.sendJoin({ gameId, name: 'Anna' });

    expect(ack).toEqual({ ok: true });
    expect(io.timeline).toEqual(['ack', 'game:joined', 'vote:mine', 'broadcast:game:state']);
  });

  it('joins the player as a voter with a new token', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');

    socket.sendJoin({ gameId, name: 'Anna' });

    expect(joinedPayload(socket)).toMatchObject({ role: 'voter', token: expect.any(String) });
  });

  it('broadcasts the state to the game room with the voter online', () => {
    const { io, gameId } = aSetup();

    io.connect('s1').sendJoin({ gameId, name: 'Anna' });

    expect(io.broadcasts.at(-1)?.room).toBe(gameRoom(gameId));
    expect(lastState(io).voters).toEqual([
      { id: expect.any(String), name: 'Anna', connected: true, hasVoted: false },
    ]);
  });

  it('puts the socket into the game room', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');

    socket.sendJoin({ gameId, name: 'Anna' });

    expect(socket.rooms).toEqual([gameRoom(gameId), playerRoom(joinedPayload(socket)!.playerId)]);
  });

  it('trims and normalizes the name', () => {
    const { io, gameId } = aSetup();

    io.connect('s1').sendJoin({ gameId, name: '  Anna  ' });

    expect(lastState(io).voters[0]?.name).toBe('Anna');
  });

  it('ignores a role in the payload', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');

    socket.sendJoin({ gameId, name: 'Eve', role: 'facilitator' });

    expect(joinedPayload(socket)?.role).toBe('voter');
    expect(lastState(io).facilitator.name).toBe('Sven');
  });

  it('lets two voters join and lists them in join order', () => {
    const { io, gameId } = aSetup();

    io.connect('s1').sendJoin({ gameId, name: 'Anna' });
    io.connect('s2').sendJoin({ gameId, name: 'Bob' });

    expect(lastState(io).voters.map((v) => v.name)).toEqual(['Anna', 'Bob']);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['31 characters', 'a'.repeat(31)],
    ['a control character', 'tab\tname'],
    ['a number', 42],
    ['null', null],
    ['missing', undefined],
  ])('acks INVALID_NAME for a name that is %s and changes nothing', (_label, name) => {
    const { io, store, gameId } = aSetup();

    const ack = io.connect('s1').sendJoin({ gameId, name });

    expect(ack).toEqual(failure('INVALID_NAME'));
    expect(store.get(gameId)?.players.size).toBe(1);
    expect(stateCount(io)).toBe(0);
  });

  it.each(['anna', 'ANNA', 'sven', 'SVEN'])(
    'acks NAME_TAKEN for "%s" and changes nothing',
    (name) => {
      const { io, store, gameId } = aSetup();
      io.connect('s0').sendJoin({ gameId, name: 'Anna' });
      const before = stateCount(io);

      const ack = io.connect('s1').sendJoin({ gameId, name });

      expect(ack).toEqual(failure('NAME_TAKEN'));
      expect(store.get(gameId)?.players.size).toBe(2);
      expect(stateCount(io)).toBe(before);
    },
  );

  it('lets the visitor retry with another name after NAME_TAKEN', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: 'sven' });

    const ack = socket.sendJoin({ gameId, name: 'Sven B' });

    expect(ack).toEqual({ ok: true });
  });
});

describe('game:join by token', () => {
  it('restores the facilitator role without issuing a token', () => {
    const { io, gameId, facilitatorToken } = aSetup();
    const socket = io.connect('s1');

    const ack = socket.sendJoin({ gameId, token: facilitatorToken });

    expect(ack).toEqual({ ok: true });
    expect(joinedPayload(socket)).toEqual({ playerId: expect.any(String), role: 'facilitator' });
    expect(lastState(io).facilitator).toEqual({ name: 'Sven', connected: true });
  });

  it('restores a voter with the same player id and no new token', () => {
    const { io, gameId } = aSetup();
    const first = io.connect('s1');
    first.sendJoin({ gameId, name: 'Anna' });
    const { playerId, token } = joinedPayload(first)!;
    first.trigger('disconnect');

    const second = io.connect('s2');
    second.sendJoin({ gameId, token });

    expect(joinedPayload(second)).toEqual({ playerId, role: 'voter' });
    expect(lastState(io).voters).toEqual([
      { id: playerId, name: 'Anna', connected: true, hasVoted: false },
    ]);
  });

  it('does not create a duplicate player on rejoin', () => {
    const { io, store, gameId } = aSetup();
    const first = io.connect('s1');
    first.sendJoin({ gameId, name: 'Anna' });

    io.connect('s2').sendJoin({ gameId, token: joinedPayload(first)!.token });

    expect(store.get(gameId)?.players.size).toBe(2);
  });

  it('ignores the name when a token is present', () => {
    const { io, gameId, facilitatorToken } = aSetup();
    const socket = io.connect('s1');

    socket.sendJoin({ gameId, token: facilitatorToken, name: 'Other' });

    expect(joinedPayload(socket)?.role).toBe('facilitator');
    expect(lastState(io).facilitator.name).toBe('Sven');
  });

  it('acks INVALID_TOKEN for a well-formed unknown token and changes nothing', () => {
    const { io, gameId } = aSetup();

    const ack = io.connect('s1').sendJoin({ gameId, token: 'x'.repeat(43) });

    expect(ack).toEqual(failure('INVALID_TOKEN'));
    expect(stateCount(io)).toBe(0);
  });

  it.each([
    ['a short string', 'short'],
    ['a number', 5],
    ['null', null],
  ])('acks INVALID_TOKEN for a token that is %s', (_label, token) => {
    const { io, gameId } = aSetup();

    expect(io.connect('s1').sendJoin({ gameId, token })).toEqual(failure('INVALID_TOKEN'));
  });

  it('acks INVALID_TOKEN, not a join by name, when the token is bad but a name is given', () => {
    const { io, store, gameId } = aSetup();

    const ack = io.connect('s1').sendJoin({ gameId, token: 5, name: 'Anna' });

    expect(ack).toEqual(failure('INVALID_TOKEN'));
    expect(store.get(gameId)?.players.size).toBe(1);
  });

  it('never lets a token of game A join game B', () => {
    const { io, store, facilitatorToken } = aSetup();
    const gameB = store.createGame('Eve');

    const ack = io.connect('s1').sendJoin({ gameId: gameB.gameId, token: facilitatorToken });

    expect(ack).toEqual(failure('INVALID_TOKEN'));
  });
});

describe('game:join payload and game checks', () => {
  it.each([
    ['a string', 'hello'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
    ['a numeric gameId', { gameId: 123, name: 'Anna' }],
    ['a missing gameId', { name: 'Anna' }],
  ])('acks INVALID_PAYLOAD for %s', (_label, payload) => {
    const { io } = aSetup();

    expect(io.connect('s1').sendJoin(payload)).toEqual(failure('INVALID_PAYLOAD'));
    expect(stateCount(io)).toBe(0);
  });

  it.each([
    ['a malformed id', 'abc'],
    ['an unknown id', UNKNOWN_GAME_ID],
  ])('acks GAME_NOT_FOUND for %s', (_label, gameId) => {
    const { io } = aSetup();

    expect(io.connect('s1').sendJoin({ gameId, name: 'Anna' })).toEqual(failure('GAME_NOT_FOUND'));
    expect(stateCount(io)).toBe(0);
  });

  it('reports an unknown game before a bad name', () => {
    const { io } = aSetup();

    expect(io.connect('s1').sendJoin({ gameId: UNKNOWN_GAME_ID, name: '' })).toEqual(
      failure('GAME_NOT_FOUND'),
    );
  });

  it('reports an unknown game before a bad token', () => {
    const { io } = aSetup();

    expect(io.connect('s1').sendJoin({ gameId: UNKNOWN_GAME_ID, token: 5 })).toEqual(
      failure('GAME_NOT_FOUND'),
    );
  });

  it('acks GAME_NOT_FOUND for a token after a restart with a fresh store', () => {
    const { gameId, facilitatorToken } = aSetup();
    const io = new FakeIo();
    registerGateway(io.asServer(), new GameStore());

    expect(io.connect('s1').sendJoin({ gameId, token: facilitatorToken })).toEqual(
      failure('GAME_NOT_FOUND'),
    );
  });

  it('acks ALREADY_JOINED for a second join on the same socket and changes nothing', () => {
    const { io, store, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: 'Anna' });
    const before = stateCount(io);

    const ack = socket.sendJoin({ gameId, name: 'Anna B' });

    expect(ack).toEqual(failure('ALREADY_JOINED'));
    expect(store.get(gameId)?.players.size).toBe(2);
    expect(stateCount(io)).toBe(before);
  });

  it('checks the payload shape before ALREADY_JOINED', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: 'Anna' });

    expect(socket.sendJoin('junk')).toEqual(failure('INVALID_PAYLOAD'));
  });

  it('keeps a rejected socket able to join afterwards', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: '' });

    expect(socket.sendJoin({ gameId, name: 'Anna' })).toEqual({ ok: true });
  });

  it('does not crash without an ack callback, for an invalid and a valid payload', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');

    expect(() => socket.trigger('game:join', { gameId: 123 })).not.toThrow();
    expect(() => socket.trigger('game:join', { gameId, name: 'Anna' })).not.toThrow();
    expect(lastState(io).voters[0]?.name).toBe('Anna');
  });

  it('does not crash when the ack argument is not a function', () => {
    const { io, gameId } = aSetup();

    expect(() =>
      io.connect('s1').trigger('game:join', { gameId, name: 'Anna' }, 'nope'),
    ).not.toThrow();
  });

  it('answers with the fixed message and never echoes the submitted input', () => {
    const { io, gameId } = aSetup();

    const ack = io.connect('s1').sendJoin({ gameId, name: '<script>\talert(1)</script>' });

    expect(ack).toEqual(failure('INVALID_NAME'));
  });
});

describe('disconnect', () => {
  it('marks the player offline and broadcasts when the last socket leaves', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: 'Anna' });

    socket.trigger('disconnect');

    expect(lastState(io).voters).toEqual([
      { id: expect.any(String), name: 'Anna', connected: false, hasVoted: false },
    ]);
    expect(io.broadcasts.at(-1)?.room).toBe(gameRoom(gameId));
  });

  it('keeps the player online and broadcasts nothing while another socket remains', () => {
    const { io, gameId } = aSetup();
    const first = io.connect('s1');
    first.sendJoin({ gameId, name: 'Anna' });
    io.connect('s2').sendJoin({ gameId, token: joinedPayload(first)!.token });
    const before = stateCount(io);

    first.trigger('disconnect');

    expect(stateCount(io)).toBe(before);
    expect(lastState(io).voters[0]?.connected).toBe(true);
  });

  it('goes offline after both sockets leave', () => {
    const { io, gameId } = aSetup();
    const first = io.connect('s1');
    first.sendJoin({ gameId, name: 'Anna' });
    const second = io.connect('s2');
    second.sendJoin({ gameId, token: joinedPayload(first)!.token });

    first.trigger('disconnect');
    second.trigger('disconnect');

    expect(lastState(io).voters[0]?.connected).toBe(false);
  });

  it('keeps the offline player in the list', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: 'Anna' });

    socket.trigger('disconnect');

    expect(lastState(io).voters).toHaveLength(1);
  });

  it('changes nothing when a socket that never joined disconnects', () => {
    const { io } = aSetup();

    io.connect('s1').trigger('disconnect');

    expect(io.broadcasts).toEqual([]);
  });

  it('changes nothing when a socket whose join was rejected disconnects', () => {
    const { io, gameId } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, name: '' });

    socket.trigger('disconnect');

    expect(io.broadcasts).toEqual([]);
  });

  it('marks the facilitator offline when their last socket leaves', () => {
    const { io, gameId, facilitatorToken } = aSetup();
    const socket = io.connect('s1');
    socket.sendJoin({ gameId, token: facilitatorToken });

    socket.trigger('disconnect');

    expect(lastState(io).facilitator.connected).toBe(false);
  });
});

describe('logging', () => {
  it('logs only event and gameId for a join', () => {
    const { io, gameId } = aSetup();
    const log = vi.mocked(console.log);

    io.connect('s1').sendJoin({ gameId, name: 'Anna' });

    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({
      level: 'info',
      event: 'player.joined',
      gameId,
    });
  });

  it('logs player.rejoined for a token join', () => {
    const { io, gameId, facilitatorToken } = aSetup();
    const log = vi.mocked(console.log);

    io.connect('s1').sendJoin({ gameId, token: facilitatorToken });

    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).event).toBe('player.rejoined');
  });

  it('logs join.rejected with the code and gameId only', () => {
    const { io, gameId } = aSetup();
    const warn = vi.mocked(console.warn);

    io.connect('s1').sendJoin({ gameId, name: 'Secret Name' });
    io.connect('s2').sendJoin({ gameId, name: 'secret name' });

    expect(JSON.parse(String(warn.mock.calls.at(-1)?.[0]))).toEqual({
      level: 'warn',
      event: 'join.rejected',
      gameId,
      code: 'NAME_TAKEN',
    });
  });

  it('never logs names or tokens', () => {
    const { io, gameId, facilitatorToken } = aSetup();
    const first = io.connect('s1');
    first.sendJoin({ gameId, name: 'Secret Name' });
    io.connect('s2').sendJoin({ gameId, token: facilitatorToken });
    io.connect('s3').sendJoin({ gameId, token: 'bad-token-value' });

    const output = JSON.stringify([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
    ]);

    expect(output).not.toContain('Secret Name');
    expect(output).not.toContain(facilitatorToken);
    expect(output).not.toContain(joinedPayload(first)!.token!);
    expect(output).not.toContain('bad-token-value');
  });

  it('does not log a client-supplied malformed game id', () => {
    const { io } = aSetup();

    io.connect('s1').sendJoin({ gameId: 'attacker\nid', name: 'Anna' });

    const line = JSON.parse(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0]));
    expect(line).toEqual({ level: 'warn', event: 'join.rejected', code: 'GAME_NOT_FOUND' });
  });
});
