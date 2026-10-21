import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectGameSocket } from './gameSocketService';
import type { GameSocketHandlers } from '../types/game.types';
import { FakeSocket, GAME_ID, OK_ACK, TOKEN, failAck, gameState } from '../test/fakeSocket';

const flush = () => Promise.resolve();

describe('connectGameSocket', () => {
  let socket: FakeSocket;
  let handlers: { [K in keyof GameSocketHandlers]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    socket = new FakeSocket();
    handlers = {
      onJoined: vi.fn(),
      onState: vi.fn(),
      onDisconnect: vi.fn(),
      onRejoinFailed: vi.fn(),
    };
  });

  function connect() {
    return connectGameSocket(handlers as unknown as GameSocketHandlers, () => socket.asSocket());
  }

  it('creates the socket without auth or query so the token never leaves the join payload', () => {
    const createSocket = vi.fn(() => socket.asSocket());

    connectGameSocket(handlers as unknown as GameSocketHandlers, createSocket);

    expect(createSocket).toHaveBeenCalledWith();
  });

  it('emits game:join with the token and resolves ok on an ack', async () => {
    const client = connect();

    const result = client.join({ gameId: GAME_ID, token: TOKEN });
    expect(socket.joins()[0]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);

    expect(await result).toEqual({ ok: true });
  });

  it('resolves the failure code of a rejected join', async () => {
    const client = connect();

    const result = client.join({ gameId: GAME_ID, name: 'Anna' });
    socket.ackJoin(failAck('NAME_TAKEN'));

    expect(await result).toEqual({ ok: false, code: 'NAME_TAKEN' });
  });

  it('treats a malformed ack as an unknown failure', async () => {
    const client = connect();

    const result = client.join({ gameId: GAME_ID, name: 'Anna' });
    socket.ackJoin('garbage');

    expect(await result).toEqual({ ok: false, code: 'UNKNOWN' });
  });

  it('passes valid game:joined and game:state payloads to the handlers', () => {
    connect();
    const joined = { playerId: 'p1', role: 'voter', token: TOKEN };
    const state = gameState();

    socket.serverEmit('game:joined', joined);
    socket.serverEmit('game:state', state);

    expect(handlers.onJoined).toHaveBeenCalledWith(joined);
    expect(handlers.onState).toHaveBeenCalledWith(state);
  });

  it('ignores payloads that fail validation', () => {
    connect();

    socket.serverEmit('game:joined', { playerId: 'p1', role: 'admin' });
    socket.serverEmit('game:state', { gameId: 'x', voters: [] });

    expect(handlers.onJoined).not.toHaveBeenCalled();
    expect(handlers.onState).not.toHaveBeenCalled();
  });

  it('re-sends game:join with the token when the socket reconnects after joining', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);
    await joining;

    socket.serverEmit('disconnect', 'transport close');
    socket.serverEmit('connect');

    expect(socket.joins()).toHaveLength(2);
    expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
    expect(handlers.onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('reconnects with the token received in game:joined after a name join', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, name: 'Anna' });
    socket.ackJoin(OK_ACK);
    socket.serverEmit('game:joined', { playerId: 'p1', role: 'voter', token: TOKEN });
    await joining;

    socket.serverEmit('connect');

    expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
  });

  it('keeps the original token when a rejoin game:joined carries none', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);
    await joining;
    socket.serverEmit('game:joined', { playerId: 'p1', role: 'voter' });

    socket.serverEmit('connect');

    expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
  });

  it('does not rejoin or report a disconnect before the seat is held', () => {
    connect();

    socket.serverEmit('connect');
    socket.serverEmit('disconnect', 'transport close');

    expect(socket.joins()).toHaveLength(0);
    expect(handlers.onDisconnect).not.toHaveBeenCalled();
  });

  it('does not hold a seat after a rejected token join', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(failAck('INVALID_TOKEN'));
    await joining;

    socket.serverEmit('connect');

    expect(socket.joins()).toHaveLength(1);
  });

  it('reports a failed rejoin and stops rejoining', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);
    await joining;

    socket.serverEmit('connect');
    socket.ackJoin(failAck('GAME_NOT_FOUND'));
    await flush();
    await flush();
    socket.serverEmit('connect');

    expect(handlers.onRejoinFailed).toHaveBeenCalledWith('GAME_NOT_FOUND');
    expect(socket.joins()).toHaveLength(2);
  });

  it('does not report a failure when the rejoin succeeds', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);
    await joining;

    socket.serverEmit('connect');
    socket.ackJoin(OK_ACK);
    await flush();

    expect(handlers.onRejoinFailed).not.toHaveBeenCalled();
  });

  it('removes its listeners and disconnects on close', () => {
    const client = connect();

    client.close();
    socket.serverEmit('game:state', gameState());

    expect(socket.closed).toBe(true);
    expect(handlers.onState).not.toHaveBeenCalled();
  });
});
