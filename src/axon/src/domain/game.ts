import { timingSafeEqual } from 'node:crypto';
import {
  cardSchema,
  playerNameKey,
  storySchema,
  type Card,
  type GamePhase,
  type PlayerRole,
  type PublicGameState,
  type Story,
} from '@axon/shared';

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly role: PlayerRole;
  readonly tokenHash: Buffer;
  readonly socketIds: Set<string>;
}

export interface Game {
  readonly id: string;
  readonly facilitatorId: string;
  // Insertion order is join order.
  readonly players: Map<string, Player>;
  phase: GamePhase;
  story?: Story;
  // Keyed by player id, not socket id, so a vote survives going offline and rejoining.
  readonly votes: Map<string, Card>;
}

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
  readonly tokenHash: Buffer;
}

export type AddVoterResult =
  | { readonly ok: true; readonly player: Player }
  | { readonly ok: false; readonly code: 'NAME_TAKEN' };

export type ActionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: 'FORBIDDEN' | 'WRONG_PHASE' | 'INVALID_STORY' | 'INVALID_CARD';
    };

function newPlayer(input: NewPlayer, role: PlayerRole): Player {
  return { ...input, role, socketIds: new Set() };
}

export function createGame(id: string, facilitator: NewPlayer): Game {
  const player = newPlayer(facilitator, 'facilitator');
  return {
    id,
    facilitatorId: player.id,
    players: new Map([[player.id, player]]),
    phase: 'waiting',
    votes: new Map(),
  };
}

export function isNameTaken(game: Game, name: string): boolean {
  const key = playerNameKey(name);
  return [...game.players.values()].some((player) => playerNameKey(player.name) === key);
}

export function addVoter(game: Game, voter: NewPlayer): AddVoterResult {
  if (isNameTaken(game, voter.name)) {
    return { ok: false, code: 'NAME_TAKEN' };
  }
  const player = newPlayer(voter, 'voter');
  game.players.set(player.id, player);
  return { ok: true, player };
}

// Checks every player so the time taken does not reveal which one matched.
export function findPlayerByTokenHash(game: Game, tokenHash: Buffer): Player | undefined {
  let match: Player | undefined;
  for (const player of game.players.values()) {
    const equal =
      player.tokenHash.length === tokenHash.length && timingSafeEqual(player.tokenHash, tokenHash);
    if (equal) {
      match = player;
    }
  }
  return match;
}

export function isConnected(player: Player): boolean {
  return player.socketIds.size > 0;
}

export function connectSocket(player: Player, socketId: string): void {
  player.socketIds.add(socketId);
}

// Returns true when this was the player's last socket, so the player went offline.
export function disconnectSocket(player: Player, socketId: string): boolean {
  if (!player.socketIds.delete(socketId)) {
    return false;
  }
  return !isConnected(player);
}

// Check order: role, phase, value. `input` is untrusted and only validated once the first two pass.
export function setStory(game: Game, playerId: string, input: unknown): ActionResult {
  if (game.players.get(playerId)?.role !== 'facilitator') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const story = storySchema.safeParse(input);
  if (!story.success) {
    return { ok: false, code: 'INVALID_STORY' };
  }
  game.story = story.data;
  game.phase = 'voting';
  return { ok: true };
}

// `null` withdraws the vote; casting the same card again or withdrawing without a vote succeeds.
export function castVote(game: Game, playerId: string, input: unknown): ActionResult {
  if (game.players.get(playerId)?.role !== 'voter') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (game.phase !== 'voting') {
    return { ok: false, code: 'WRONG_PHASE' };
  }
  if (input === null) {
    game.votes.delete(playerId);
    return { ok: true };
  }
  const card = cardSchema.safeParse(input);
  if (!card.success) {
    return { ok: false, code: 'INVALID_CARD' };
  }
  game.votes.set(playerId, card.data);
  return { ok: true };
}

// Only the owner of the vote may ever be sent this.
export function getVote(game: Game, playerId: string): Card | null {
  return game.votes.get(playerId) ?? null;
}

export function toPublicState(game: Game): PublicGameState {
  const facilitator = game.players.get(game.facilitatorId);
  if (!facilitator) {
    throw new Error('Game has no facilitator');
  }
  return {
    gameId: game.id,
    phase: game.phase,
    story: game.story ? { ...game.story } : null,
    facilitator: { name: facilitator.name, connected: isConnected(facilitator) },
    voters: [...game.players.values()]
      .filter((player) => player.role === 'voter')
      .map((player) => ({
        id: player.id,
        name: player.name,
        connected: isConnected(player),
        hasVoted: game.votes.has(player.id),
      })),
  };
}
