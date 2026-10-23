import type { Card, RoundFinishPayload } from '@axon/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACK_TIMEOUT_MS, connectGameSocket } from './gameSocketService';
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
      onVoteMine: vi.fn(),
      onRemoved: vi.fn(),
      onEnded: vi.fn(),
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

  it('reports player:removed once and never rejoins afterwards', async () => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);
    await joining;

    socket.serverEmit('player:removed');
    socket.serverEmit('disconnect', 'io server disconnect');
    socket.serverEmit('connect');

    expect(handlers.onRemoved).toHaveBeenCalledTimes(1);
    expect(handlers.onDisconnect).not.toHaveBeenCalled();
    expect(socket.joins()).toHaveLength(1);
  });

  it.each([
    [{ reason: 'server-restart' }, 'server-restart'],
    [{ reason: 'expired' }, 'expired'],
    [{ reason: 'something-new' }, 'server-restart'],
    [{}, 'server-restart'],
    [undefined, 'server-restart'],
  ])('reports game:ended %j as %s and never rejoins afterwards', async (payload, reason) => {
    const client = connect();
    const joining = client.join({ gameId: GAME_ID, token: TOKEN });
    socket.ackJoin(OK_ACK);
    await joining;

    socket.serverEmit('game:ended', payload);
    socket.serverEmit('disconnect', 'io server disconnect');
    socket.serverEmit('connect');

    expect(handlers.onEnded).toHaveBeenCalledTimes(1);
    expect(handlers.onEnded).toHaveBeenCalledWith(reason);
    expect(handlers.onDisconnect).not.toHaveBeenCalled();
    expect(socket.joins()).toHaveLength(1);
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

  describe('vote:mine', () => {
    it.each([5, 0, '?', 'coffee', null])('passes the card %j to the handler', (card) => {
      connect();

      socket.serverEmit('vote:mine', { card });

      expect(handlers.onVoteMine).toHaveBeenCalledExactlyOnceWith(card);
    });

    it.each([{ card: 4 }, { card: '5' }, { card: 5, extra: 1 }, {}, null, 'coffee'])(
      'ignores the invalid payload %j',
      (payload) => {
        connect();

        socket.serverEmit('vote:mine', payload);

        expect(handlers.onVoteMine).not.toHaveBeenCalled();
      },
    );

    it('rejects an extended game:state that carries a vote value', () => {
      connect();

      socket.serverEmit('game:state', {
        ...gameState(),
        voters: [{ id: 'v1', name: 'Anna', connected: true, hasVoted: true, card: 5 }],
      });

      expect(handlers.onState).not.toHaveBeenCalled();
    });
  });

  describe('story:set and vote:cast', () => {
    const emitted = (event: string) => socket.emitted.filter((entry) => entry.event === event);

    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits story:set with the story and resolves ok on the ack', async () => {
      const client = connect();

      const result = client.setStory({ title: 'Login', url: 'https://example.com/1' });
      emitted('story:set')[0]?.ack?.(OK_ACK);

      expect(emitted('story:set')[0]?.payload).toEqual({
        title: 'Login',
        url: 'https://example.com/1',
      });
      expect(await result).toEqual({ ok: true });
    });

    it.each<Card | null>([5, 'coffee', null])('emits vote:cast with card %j', async (card) => {
      const client = connect();

      const result = client.castVote(card);
      emitted('vote:cast')[0]?.ack?.(OK_ACK);

      expect(emitted('vote:cast')[0]?.payload).toEqual({ card });
      expect(await result).toEqual({ ok: true });
    });

    it('emits round:reveal with no payload and resolves its ack', async () => {
      const client = connect();

      const result = client.revealRound();
      emitted('round:reveal')[0]?.ack?.(OK_ACK);

      expect(emitted('round:reveal')[0]?.payload).toBeUndefined();
      expect(await result).toEqual({ ok: true });
    });

    it('emits player:remove with the player id', async () => {
      const client = connect();

      const result = client.removePlayer('p7');
      emitted('player:remove')[0]?.ack?.(failAck('INVALID_PAYLOAD'));

      expect(emitted('player:remove')[0]?.payload).toEqual({ playerId: 'p7' });
      expect(await result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
    });

    it('emits round:revote with no payload', async () => {
      const client = connect();

      const result = client.revoteRound();
      emitted('round:revote')[0]?.ack?.(OK_ACK);

      expect(emitted('round:revote')[0]?.payload).toBeUndefined();
      expect(await result).toEqual({ ok: true });
    });

    it.each<RoundFinishPayload>([{ finalEstimate: 8 }, { skip: true }])(
      'emits round:finish with %j',
      async (payload) => {
        const client = connect();

        const result = client.finishRound(payload);
        emitted('round:finish')[0]?.ack?.(failAck('WRONG_PHASE'));

        expect(emitted('round:finish')[0]?.payload).toEqual(payload);
        expect(await result).toEqual({ ok: false, code: 'WRONG_PHASE' });
      },
    );

    it('resolves the failure code of a rejected reveal', async () => {
      const client = connect();

      const result = client.revealRound();
      emitted('round:reveal')[0]?.ack?.(failAck('WRONG_PHASE'));

      expect(await result).toEqual({ ok: false, code: 'WRONG_PHASE' });
    });

    it('resolves the failure code of a rejected request', async () => {
      const client = connect();

      const result = client.castVote(5);
      emitted('vote:cast')[0]?.ack?.(failAck('WRONG_PHASE'));

      expect(await result).toEqual({ ok: false, code: 'WRONG_PHASE' });
    });

    it('treats a malformed ack as an unknown failure', async () => {
      const client = connect();

      const result = client.setStory({ title: 'Login' });
      emitted('story:set')[0]?.ack?.({ nope: true });

      expect(await result).toEqual({ ok: false, code: 'UNKNOWN' });
    });

    it('resolves a TIMEOUT failure after 5 seconds without an ack', async () => {
      vi.useFakeTimers();
      const client = connect();
      const settled = vi.fn();
      void client.castVote(5).then(settled);

      await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS - 1);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(settled).toHaveBeenCalledExactlyOnceWith({ ok: false, code: 'TIMEOUT' });
    });

    it('ignores an ack that arrives after the timeout', async () => {
      vi.useFakeTimers();
      const client = connect();
      const settled = vi.fn();
      void client.setStory({ title: 'Login' }).then(settled);
      await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS);

      emitted('story:set')[0]?.ack?.(OK_ACK);
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toHaveBeenCalledExactlyOnceWith({ ok: false, code: 'TIMEOUT' });
    });

    it('does not time out after an ack', async () => {
      vi.useFakeTimers();
      const client = connect();
      const settled = vi.fn();
      void client.castVote(null).then(settled);
      emitted('vote:cast')[0]?.ack?.(OK_ACK);

      await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS * 2);

      expect(settled).toHaveBeenCalledExactlyOnceWith({ ok: true });
    });
  });
});
