import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  addVoter,
  createGame,
  findPlayerByTokenHash,
  type Game,
  type Player,
} from '../domain/game.js';

const GAME_ID_BYTES = 16;
const TOKEN_BYTES = 32;

export interface GameStoreOptions {
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

  constructor(options: GameStoreOptions = {}) {
    this.randomBytes = options.randomBytes ?? randomBytes;
    this.randomUUID = options.randomUUID ?? randomUUID;
  }

  createGame(facilitatorName: string): { gameId: string; token: string } {
    let gameId: string;
    do {
      gameId = this.randomBytes(GAME_ID_BYTES).toString('base64url');
    } while (this.games.has(gameId));
    const token = this.newToken();
    const game = createGame(gameId, {
      id: this.randomUUID(),
      name: facilitatorName,
      tokenHash: hashToken(token),
    });
    this.games.set(gameId, game);
    return { gameId, token };
  }

  exists(gameId: string): boolean {
    return this.games.has(gameId);
  }

  get(gameId: string): Game | undefined {
    return this.games.get(gameId);
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

  private newToken(): string {
    return this.randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
