import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_LIFETIME, type LifetimeConfig } from '../config.js';
import {
  addVoter,
  createGame,
  findPlayerByTokenHash,
  isBanned,
  isGameEmpty,
  type Game,
  type Player,
} from '../domain/game.js';
import { logEvent } from '../logging.js';

const GAME_ID_BYTES = 16;
const TOKEN_BYTES = 32;

export interface ExpiredGame {
  readonly gameId: string;
  readonly reason: 'empty' | 'expired';
}

export interface GameStoreOptions {
  // The only source of time, so tests control it.
  readonly now?: () => number;
  readonly lifetime?: LifetimeConfig;
  readonly randomBytes?: (size: number) => Buffer;
  readonly randomUUID?: () => string;
}

export type JoinAsVoterResult =
  | { readonly ok: true; readonly player: Player; readonly token: string }
  | { readonly ok: false; readonly code: 'NAME_TAKEN' };

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export class GameStore {
  private readonly games = new Map<string, Game>();
  private readonly randomBytes: (size: number) => Buffer;
  private readonly randomUUID: () => string;
  private readonly now: () => number;
  private readonly lifetime: LifetimeConfig;

  constructor(options: GameStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.lifetime = options.lifetime ?? DEFAULT_LIFETIME;
    this.randomBytes = options.randomBytes ?? randomBytes;
    this.randomUUID = options.randomUUID ?? randomUUID;
  }

  createGame(facilitatorName: string): { gameId: string; token: string } {
    let gameId: string;
    do {
      gameId = this.randomBytes(GAME_ID_BYTES).toString('base64url');
    } while (this.games.has(gameId));
    const token = this.newToken();
    const game = createGame(
      gameId,
      { id: this.randomUUID(), name: facilitatorName, tokenHash: hashToken(token) },
      this.now(),
    );
    this.games.set(gameId, game);
    return { gameId, token };
  }

  exists(gameId: string): boolean {
    return this.get(gameId) !== undefined;
  }

  // A game past its age cap, or empty for the TTL, is gone even before the next sweep removes it.
  get(gameId: string): Game | undefined {
    const game = this.games.get(gameId);
    return game && !this.isOver(game, this.now()) ? game : undefined;
  }

  private isOver(game: Game, now: number): boolean {
    if (game.createdAt + this.lifetime.maxAgeMs <= now) return true;
    return game.emptySince !== undefined && game.emptySince + this.lifetime.emptyTtlMs <= now;
  }

  joinAsVoter(game: Game, name: string): JoinAsVoterResult {
    const token = this.newToken();
    const result = addVoter(game, {
      id: this.randomUUID(),
      name,
      tokenHash: hashToken(token),
    });
    return result.ok ? { ok: true, player: result.player, token } : result;
  }

  // Only players of `game` are considered, so a token never works across games.
  authenticate(game: Game, token: string): Player | undefined {
    return findPlayerByTokenHash(game, hashToken(token));
  }

  // A player connected: the game is no longer empty.
  markConnected(game: Game): void {
    game.emptySince = undefined;
  }

  // Call after a socket left: starts the empty clock once nobody is connected.
  markDisconnected(game: Game): void {
    if (isGameEmpty(game)) {
      game.emptySince ??= this.now();
    }
  }

  // Deletes games past the age cap (even with players) and games empty for the TTL; returns what
  // it deleted so the caller can tell connected players.
  sweep(): ExpiredGame[] {
    const now = this.now();
    const expired: ExpiredGame[] = [];
    for (const [gameId, game] of this.games) {
      if (game.createdAt + this.lifetime.maxAgeMs <= now) {
        expired.push({ gameId, reason: 'expired' });
        continue;
      }
      if (!isGameEmpty(game)) {
        game.emptySince = undefined;
        continue;
      }
      game.emptySince ??= now;
      if (game.emptySince + this.lifetime.emptyTtlMs <= now) {
        expired.push({ gameId, reason: 'empty' });
      }
    }
    for (const { gameId, reason } of expired) {
      this.games.delete(gameId);
      logEvent('game.deleted', { gameId, reason });
    }
    return expired;
  }

  // True for the token of a voter the facilitator removed from `game`.
  isBanned(game: Game, token: string): boolean {
    return isBanned(game, hashToken(token));
  }

  private newToken(): string {
    return this.randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
