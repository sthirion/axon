import type { Server } from 'socket.io';
import {
  failedAck,
  GAME_EVENTS,
  gameIdSchema,
  gameJoinPayloadSchema,
  playerNameSchema,
  playerTokenSchema,
  type Ack,
  type ErrorCode,
  type GameJoined,
} from '@axon/shared';
import {
  connectSocket,
  disconnectSocket,
  toPublicState,
  type Game,
  type Player,
} from '../domain/game.js';
import { logEvent } from '../logging.js';
import type { GameStore } from '../store/gameStore.js';

interface Session {
  readonly gameId: string;
  readonly playerId: string;
}

type JoinDecision =
  | { readonly ok: true; readonly game: Game; readonly player: Player; readonly token?: string }
  | { readonly ok: false; readonly code: ErrorCode; readonly gameId?: string };

export function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

// Order (A-9): payload shape, already joined, gameId, then token or name. Role never comes from the payload.
function decideJoin(store: GameStore, payload: unknown, alreadyJoined: boolean): JoinDecision {
  const envelope = gameJoinPayloadSchema.safeParse(payload);
  if (!envelope.success) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  if (alreadyJoined) {
    return { ok: false, code: 'ALREADY_JOINED' };
  }
  const { gameId, token, name } = envelope.data;
  if (!gameIdSchema.safeParse(gameId).success) {
    return { ok: false, code: 'GAME_NOT_FOUND' };
  }
  const game = store.get(gameId);
  if (!game) {
    return { ok: false, code: 'GAME_NOT_FOUND', gameId };
  }

  if (token !== undefined) {
    const parsedToken = playerTokenSchema.safeParse(token);
    const player = parsedToken.success ? store.authenticate(game, parsedToken.data) : undefined;
    return player ? { ok: true, game, player } : { ok: false, code: 'INVALID_TOKEN', gameId };
  }

  const parsedName = playerNameSchema.safeParse(name);
  if (!parsedName.success) {
    return { ok: false, code: 'INVALID_NAME', gameId };
  }
  const joined = store.joinAsVoter(game, parsedName.data);
  return joined.ok
    ? { ok: true, game, player: joined.player, token: joined.token }
    : { ok: false, code: joined.code, gameId };
}

export function registerGateway(io: Server, store: GameStore): void {
  io.on('connection', (socket) => {
    let session: Session | undefined;

    socket.on(GAME_EVENTS.join, (payload: unknown, ack?: unknown) => {
      const reply = (result: Ack): void => {
        if (typeof ack === 'function') {
          ack(result);
        }
      };

      const decision = decideJoin(store, payload, session !== undefined);
      if (!decision.ok) {
        logEvent('join.rejected', { gameId: decision.gameId, code: decision.code }, 'warn');
        reply(failedAck(decision.code));
        return;
      }

      const { game, player, token } = decision;
      connectSocket(player, socket.id);
      session = { gameId: game.id, playerId: player.id };
      void socket.join(gameRoom(game.id));

      const joined: GameJoined = { playerId: player.id, role: player.role, token };
      reply({ ok: true });
      socket.emit(GAME_EVENTS.joined, joined);
      io.to(gameRoom(game.id)).emit(GAME_EVENTS.state, toPublicState(game));
      logEvent(token === undefined ? 'player.rejoined' : 'player.joined', { gameId: game.id });
    });

    socket.on('disconnect', () => {
      if (!session) {
        return;
      }
      const game = store.get(session.gameId);
      const player = game?.players.get(session.playerId);
      if (game && player && disconnectSocket(player, socket.id)) {
        io.to(gameRoom(game.id)).emit(GAME_EVENTS.state, toPublicState(game));
      }
    });
  });
}
