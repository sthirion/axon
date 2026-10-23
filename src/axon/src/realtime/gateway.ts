import type { Server } from 'socket.io';
import {
  failedAck,
  GAME_EVENTS,
  gameIdSchema,
  gameJoinPayloadSchema,
  playerNameSchema,
  playerRemoveEnvelopeSchema,
  roundFinishEnvelopeSchema,
  playerTokenSchema,
  storySetEnvelopeSchema,
  voteCastEnvelopeSchema,
  type Ack,
  type ErrorCode,
  type GameJoined,
  type VoteMine,
} from '@axon/shared';
import {
  castVote,
  connectSocket,
  disconnectSocket,
  finishRound,
  getVote,
  removePlayer,
  revealRound,
  revoteRound,
  setStory,
  toPublicState,
  type ActionResult,
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

type CommandDecision =
  | { readonly ok: true; readonly game: Game; readonly playerId: string }
  | { readonly ok: false; readonly code: ErrorCode; readonly gameId?: string };

export function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

// Every socket of one player, so a private event reaches all of their tabs and nobody else.
export function playerRoom(playerId: string): string {
  return `player:${playerId}`;
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
    if (parsedToken.success && store.isBanned(game, parsedToken.data)) {
      return { ok: false, code: 'REMOVED', gameId };
    }
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

interface Envelope<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

// Order: not joined, game gone, payload envelope, then the domain (role, phase, value).
function decideCommand<T>(
  store: GameStore,
  session: Session | undefined,
  payload: unknown,
  envelope: Envelope<T>,
  execute: (game: Game, playerId: string, data: T) => ActionResult,
): CommandDecision {
  if (!session) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const game = store.get(session.gameId);
  if (!game) {
    return { ok: false, code: 'GAME_NOT_FOUND', gameId: session.gameId };
  }
  const parsed = envelope.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_PAYLOAD', gameId: game.id };
  }
  const result = execute(game, session.playerId, parsed.data);
  return result.ok
    ? { ok: true, game, playerId: session.playerId }
    : { ok: false, code: result.code, gameId: game.id };
}

// `round:reveal` carries no payload, so whatever is sent is ignored.
const ANY_PAYLOAD: Envelope<unknown> = { safeParse: (data) => ({ success: true, data }) };

// A missing or non-function ack is tolerated: the event is still processed.
function replyTo(ack: unknown): (result: Ack) => void {
  return (result) => {
    if (typeof ack === 'function') {
      ack(result);
    }
  };
}

export function registerGateway(io: Server, store: GameStore): void {
  io.on('connection', (socket) => {
    let session: Session | undefined;

    socket.on(GAME_EVENTS.join, (payload: unknown, ack?: unknown) => {
      const reply = replyTo(ack);

      const decision = decideJoin(store, payload, session !== undefined);
      if (!decision.ok) {
        logEvent('join.rejected', { gameId: decision.gameId, code: decision.code }, 'warn');
        reply(failedAck(decision.code));
        return;
      }

      const { game, player, token } = decision;
      connectSocket(player, socket.id);
      store.markConnected(game);
      session = { gameId: game.id, playerId: player.id };
      void socket.join(gameRoom(game.id));
      void socket.join(playerRoom(player.id));

      const joined: GameJoined = { playerId: player.id, role: player.role, token };
      reply({ ok: true });
      socket.emit(GAME_EVENTS.joined, joined);
      if (player.role === 'voter') {
        const mine: VoteMine = { card: getVote(game, player.id) };
        socket.emit(GAME_EVENTS.voteMine, mine);
      }
      io.to(gameRoom(game.id)).emit(GAME_EVENTS.state, toPublicState(game));
      logEvent(token === undefined ? 'player.rejoined' : 'player.joined', { gameId: game.id });
    });

    socket.on(GAME_EVENTS.storySet, (payload: unknown, ack?: unknown) => {
      const reply = replyTo(ack);
      const decision = decideCommand(
        store,
        session,
        payload,
        storySetEnvelopeSchema,
        (game, playerId) => setStory(game, playerId, payload),
      );
      if (!decision.ok) {
        logEvent('story.rejected', { gameId: decision.gameId, code: decision.code }, 'warn');
        reply(failedAck(decision.code));
        return;
      }

      reply({ ok: true });
      io.to(gameRoom(decision.game.id)).emit(GAME_EVENTS.state, toPublicState(decision.game));
    });

    socket.on(GAME_EVENTS.voteCast, (payload: unknown, ack?: unknown) => {
      const reply = replyTo(ack);
      const decision = decideCommand(
        store,
        session,
        payload,
        voteCastEnvelopeSchema,
        (game, playerId, { card }) => castVote(game, playerId, card),
      );
      if (!decision.ok) {
        logEvent('vote.rejected', { gameId: decision.gameId, code: decision.code }, 'warn');
        reply(failedAck(decision.code));
        return;
      }

      const { game, playerId } = decision;
      const mine: VoteMine = { card: getVote(game, playerId) };
      reply({ ok: true });
      io.to(playerRoom(playerId)).emit(GAME_EVENTS.voteMine, mine);
      io.to(gameRoom(game.id)).emit(GAME_EVENTS.state, toPublicState(game));
    });

    socket.on(GAME_EVENTS.roundReveal, (payload: unknown, ack?: unknown) => {
      const reply = replyTo(ack);
      const decision = decideCommand(store, session, payload, ANY_PAYLOAD, (game, playerId) =>
        revealRound(game, playerId),
      );
      if (!decision.ok) {
        logEvent('round.rejected', { gameId: decision.gameId, code: decision.code }, 'warn');
        reply(failedAck(decision.code));
        return;
      }

      reply({ ok: true });
      io.to(gameRoom(decision.game.id)).emit(GAME_EVENTS.state, toPublicState(decision.game));
    });

    // Votes were cleared: every voter's own deck (all tabs) must forget its selection.
    function clearOwnVotes(game: Game): void {
      const mine: VoteMine = { card: null };
      for (const player of game.players.values()) {
        if (player.role === 'voter') {
          io.to(playerRoom(player.id)).emit(GAME_EVENTS.voteMine, mine);
        }
      }
    }

    // Shared by the commands that empty the round: ack, clear every deck, then broadcast.
    function finishCommand(decision: CommandDecision, reply: (result: Ack) => void): void {
      if (!decision.ok) {
        logEvent('round.rejected', { gameId: decision.gameId, code: decision.code }, 'warn');
        reply(failedAck(decision.code));
        return;
      }
      reply({ ok: true });
      clearOwnVotes(decision.game);
      io.to(gameRoom(decision.game.id)).emit(GAME_EVENTS.state, toPublicState(decision.game));
    }

    socket.on(GAME_EVENTS.roundRevote, (payload: unknown, ack?: unknown) => {
      finishCommand(
        decideCommand(store, session, payload, ANY_PAYLOAD, (game, playerId) =>
          revoteRound(game, playerId),
        ),
        replyTo(ack),
      );
    });

    socket.on(GAME_EVENTS.roundFinish, (payload: unknown, ack?: unknown) => {
      finishCommand(
        decideCommand(store, session, payload, roundFinishEnvelopeSchema, (game, playerId, data) =>
          finishRound(game, playerId, data),
        ),
        replyTo(ack),
      );
    });

    socket.on(GAME_EVENTS.playerRemove, (payload: unknown, ack?: unknown) => {
      const reply = replyTo(ack);
      const input = typeof payload === 'object' && payload !== null ? payload : {};
      let removedId = '';
      const decision = decideCommand(
        store,
        session,
        payload,
        playerRemoveEnvelopeSchema,
        (game, playerId) => {
          const result = removePlayer(game, playerId, (input as { playerId?: unknown }).playerId);
          if (result.ok) removedId = result.removedId;
          return result;
        },
      );
      if (!decision.ok) {
        logEvent(
          'player.remove.rejected',
          { gameId: decision.gameId, code: decision.code },
          'warn',
        );
        reply(failedAck(decision.code));
        return;
      }

      const room = playerRoom(removedId);
      reply({ ok: true });
      io.to(room).emit(GAME_EVENTS.playerRemoved);
      io.in(room).disconnectSockets(true);
      io.to(gameRoom(decision.game.id)).emit(GAME_EVENTS.state, toPublicState(decision.game));
      logEvent('player.removed', { gameId: decision.game.id });
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
      // Also for a removed player's last socket: the game may now be empty.
      if (game) {
        store.markDisconnected(game);
      }
    });
  });
}
