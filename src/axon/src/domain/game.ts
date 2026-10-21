import { timingSafeEqual } from 'node:crypto';
import { playerNameKey, type PlayerRole, type PublicGameState } from '@axon/shared';

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
}

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
  readonly tokenHash: Buffer;
}

export type AddVoterResult =
  | { readonly ok: true; readonly player: Player }
  | { readonly ok: false; readonly code: 'NAME_TAKEN' };

function newPlayer(input: NewPlayer, role: PlayerRole): Player {
  return { ...input, role, socketIds: new Set() };
}

export function createGame(id: string, facilitator: NewPlayer): Game {
  const player = newPlayer(facilitator, 'facilitator');
  return { id, facilitatorId: player.id, players: new Map([[player.id, player]]) };
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

export function toPublicState(game: Game): PublicGameState {
  const facilitator = game.players.get(game.facilitatorId);
  if (!facilitator) {
    throw new Error('Game has no facilitator');
  }
  return {
    gameId: game.id,
    facilitator: { name: facilitator.name, connected: isConnected(facilitator) },
    voters: [...game.players.values()]
      .filter((player) => player.role === 'voter')
      .map((player) => ({ id: player.id, name: player.name, connected: isConnected(player) })),
  };
}
