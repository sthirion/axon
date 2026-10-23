import {
  ackSchema,
  GAME_EVENTS,
  gameJoinedSchema,
  publicGameStateSchema,
  voteMineSchema,
  type GameJoinPayload,
} from '@axon/shared';
import { io, type Socket } from 'socket.io-client';
import type {
  ActionResult,
  GameSocketClient,
  GameSocketHandlers,
  JoinResult,
} from '../types/game.types';

export const ACK_TIMEOUT_MS = 5000;
const UNKNOWN_ACK_CODE = 'UNKNOWN';
const TIMEOUT_ACK_CODE = 'TIMEOUT';

// Same-origin connection; the token only ever travels in the game:join payload, never in auth or query.
export function connectGameSocket(
  handlers: GameSocketHandlers,
  createSocket: () => Socket = () => io(),
): GameSocketClient {
  const socket = createSocket();
  let gameId: string | null = null;
  // Set once a seat is held; doubles as "has joined" and as the credential for rejoining on reconnect.
  let seat: { gameId: string; token: string } | null = null;

  function send(payload: GameJoinPayload): Promise<JoinResult> {
    return new Promise((resolve) => {
      socket.emit(GAME_EVENTS.join, payload, (ack: unknown) => {
        const parsed = ackSchema.safeParse(ack);
        if (!parsed.success) resolve({ ok: false, code: UNKNOWN_ACK_CODE });
        else resolve(parsed.data.ok ? { ok: true } : { ok: false, code: parsed.data.code });
      });
    });
  }

  // Resolves with the ack, or TIMEOUT if the server stays silent.
  function request(event: string, payload: unknown): Promise<ActionResult> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        resolve({ ok: false, code: TIMEOUT_ACK_CODE });
      }, ACK_TIMEOUT_MS);
      socket.emit(event, payload, (ack: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const parsed = ackSchema.safeParse(ack);
        if (!parsed.success) resolve({ ok: false, code: UNKNOWN_ACK_CODE });
        else resolve(parsed.data.ok ? { ok: true } : { ok: false, code: parsed.data.code });
      });
    });
  }

  socket.on(GAME_EVENTS.joined, (payload: unknown) => {
    const parsed = gameJoinedSchema.safeParse(payload);
    if (!parsed.success) return;
    if (parsed.data.token && gameId) seat = { gameId, token: parsed.data.token };
    handlers.onJoined(parsed.data);
  });

  socket.on(GAME_EVENTS.state, (payload: unknown) => {
    const parsed = publicGameStateSchema.safeParse(payload);
    if (parsed.success) handlers.onState(parsed.data);
  });

  socket.on(GAME_EVENTS.voteMine, (payload: unknown) => {
    const parsed = voteMineSchema.safeParse(payload);
    if (parsed.success) handlers.onVoteMine(parsed.data.card);
  });

  socket.on('disconnect', () => {
    if (seat) handlers.onDisconnect();
  });

  // Fires on every (re)connection; seat is still null on the first one.
  socket.on('connect', () => {
    if (!seat) return;
    void send({ gameId: seat.gameId, token: seat.token }).then((result) => {
      if (result.ok) return;
      seat = null;
      handlers.onRejoinFailed(result.code);
    });
  });

  return {
    async join(payload) {
      gameId = payload.gameId;
      const result = await send(payload);
      if (result.ok && payload.token) seat = { gameId: payload.gameId, token: payload.token };
      return result;
    },
    setStory: (payload) => request(GAME_EVENTS.storySet, payload),
    castVote: (card) => request(GAME_EVENTS.voteCast, { card }),
    revealRound: () => request(GAME_EVENTS.roundReveal, undefined),
    close() {
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
