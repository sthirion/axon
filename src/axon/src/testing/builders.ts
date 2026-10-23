import { randomUUID } from 'node:crypto';
import { createGame, type Game, type NewPlayer } from '../domain/game.js';
import { hashToken } from '../store/gameStore.js';

export const GAME_ID = 'G'.repeat(22);

export function aNewPlayer(overrides: Partial<NewPlayer> & { token?: string } = {}): NewPlayer {
  const { token = randomUUID(), ...rest } = overrides;
  return { id: randomUUID(), name: 'Player', tokenHash: hashToken(token), ...rest };
}

export function aGame(facilitator: Parameters<typeof aNewPlayer>[0] = {}): Game {
  return createGame(GAME_ID, aNewPlayer({ name: 'Sven', ...facilitator }), 0);
}
