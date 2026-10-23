import { timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_SCALE,
  isCardOf,
  isEstimateOf,
  playerNameKey,
  storySchema,
  type Card,
  type GamePhase,
  type HistoryEntry,
  type PlayerRole,
  type PublicGameState,
  type Scale,
  type Story,
} from '@axon/shared';
import { calculateStats } from './results.js';

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
  // Store clock time at creation; the age cap counts from here.
  readonly createdAt: number;
  // Chosen when the session is created and never changed.
  readonly scale: Scale;
  // When the last connected player left (or the game was created empty); cleared on a join.
  emptySince?: number;
  // Insertion order is join order.
  readonly players: Map<string, Player>;
  phase: GamePhase;
  story?: Story;
  // Keyed by player id, not socket id, so a vote survives going offline and rejoining.
  readonly votes: Map<string, Card>;
  // Finished stories, oldest first; skipped stories carry the estimate 'skipped'.
  readonly history: HistoryEntry[];
  // SHA-256 hex of the tokens of removed voters; they can never rejoin with them.
  readonly bannedTokenHashes: Set<string>;
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
      readonly code:
        'FORBIDDEN' | 'WRONG_PHASE' | 'INVALID_STORY' | 'INVALID_CARD' | 'INVALID_PAYLOAD';
    };

function newPlayer(input: NewPlayer, role: PlayerRole): Player {
  return { ...input, role, socketIds: new Set() };
}

export function createGame(
  id: string,
  facilitator: NewPlayer,
  now: number,
  scale: Scale = DEFAULT_SCALE,
): Game {
  const player = newPlayer(facilitator, 'facilitator');
  return {
    id,
    facilitatorId: player.id,
    createdAt: now,
    scale,
    emptySince: now,
    players: new Map([[player.id, player]]),
    phase: 'waiting',
    votes: new Map(),
    history: [],
    bannedTokenHashes: new Set(),
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

// A game is empty when no player, facilitator included, has a socket.
export function isGameEmpty(game: Game): boolean {
  return [...game.players.values()].every((player) => !isConnected(player));
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
  if (game.phase === 'revealed') {
    return { ok: false, code: 'WRONG_PHASE' };
  }
  const story = storySchema.safeParse(input);
  if (!story.success) {
    return { ok: false, code: 'INVALID_STORY' };
  }
  game.story = story.data;
  game.phase = 'voting';
  return { ok: true };
}

// Needs at least one vote; a second reveal is rejected because the phase is no longer `voting`.
export function revealRound(game: Game, playerId: string): ActionResult {
  if (game.players.get(playerId)?.role !== 'facilitator') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (game.phase !== 'voting' || game.votes.size === 0) {
    return { ok: false, code: 'WRONG_PHASE' };
  }
  game.phase = 'revealed';
  return { ok: true };
}

export function tokenHashKey(tokenHash: Buffer): string {
  return tokenHash.toString('hex');
}

export function isBanned(game: Game, tokenHash: Buffer): boolean {
  return game.bannedTokenHashes.has(tokenHashKey(tokenHash));
}

export type RemovePlayerResult =
  { readonly ok: true; readonly removedId: string } | Exclude<ActionResult, { readonly ok: true }>;

// Order: role, then target. Only a current voter can be removed; their vote goes, their name is
// freed, and that token can never be used to rejoin (a new name still can). `targetId` is untrusted.
export function removePlayer(game: Game, playerId: string, targetId: unknown): RemovePlayerResult {
  if (game.players.get(playerId)?.role !== 'facilitator') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const target = typeof targetId === 'string' ? game.players.get(targetId) : undefined;
  if (target?.role !== 'voter') {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  game.bannedTokenHashes.add(tokenHashKey(target.tokenHash));
  game.votes.delete(target.id);
  game.players.delete(target.id);
  return { ok: true, removedId: target.id };
}

// Back to voting on the same story with every vote cleared.
export function revoteRound(game: Game, playerId: string): ActionResult {
  if (game.players.get(playerId)?.role !== 'facilitator') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (game.phase !== 'revealed') {
    return { ok: false, code: 'WRONG_PHASE' };
  }
  game.votes.clear();
  game.phase = 'voting';
  return { ok: true };
}

// `input` has already passed the envelope check: exactly one of `skip: true` or `finalEstimate`.
// An estimate needs the reveal; a skip is also allowed while voting. Either way the story goes to
// the history, the votes are cleared and the game waits for the next story.
export function finishRound(game: Game, playerId: string, input: object): ActionResult {
  if (game.players.get(playerId)?.role !== 'facilitator') {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const skipping = 'skip' in input;
  const allowed = skipping
    ? game.phase === 'voting' || game.phase === 'revealed'
    : game.phase === 'revealed';
  if (!allowed || !game.story) {
    return { ok: false, code: 'WRONG_PHASE' };
  }
  let estimate: HistoryEntry['estimate'] = 'skipped';
  if (!skipping) {
    const chosen = (input as { finalEstimate?: unknown }).finalEstimate;
    if (!isEstimateOf(game.scale, chosen)) {
      return { ok: false, code: 'INVALID_CARD' };
    }
    estimate = chosen;
  }
  game.history.push({ ...game.story, estimate });
  game.votes.clear();
  game.story = undefined;
  game.phase = 'waiting';
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
  if (!isCardOf(game.scale, input)) {
    return { ok: false, code: 'INVALID_CARD' };
  }
  game.votes.set(playerId, input);
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
  const revealed = game.phase === 'revealed';
  return {
    gameId: game.id,
    scale: game.scale,
    phase: game.phase,
    story: game.story ? { ...game.story } : null,
    facilitator: { name: facilitator.name, connected: isConnected(facilitator) },
    voters: [...game.players.values()]
      .filter((player) => player.role === 'voter')
      .map((player) => {
        const card = game.votes.get(player.id);
        return {
          id: player.id,
          name: player.name,
          connected: isConnected(player),
          hasVoted: card !== undefined,
          ...(revealed && card !== undefined ? { card } : {}),
        };
      }),
    ...(revealed ? { results: calculateStats(game.votes, game.scale) } : {}),
    history: game.history.map((entry) => ({ ...entry })),
    // Sizes cannot be added up: a t-shirt session has no total.
    total:
      game.scale === 'tshirt'
        ? null
        : game.history.reduce(
            (sum, entry) => (typeof entry.estimate === 'number' ? sum + entry.estimate : sum),
            0,
          ),
  };
}
