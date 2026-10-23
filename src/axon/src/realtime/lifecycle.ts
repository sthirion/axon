import type { Server as HttpServer } from 'node:http';
import { GAME_EVENTS, type GameEnded, type GameEndReason } from '@axon/shared';
import type { Server } from 'socket.io';
import { logEvent } from '../logging.js';
import type { GameStore } from '../store/gameStore.js';
import { gameRoom } from './gateway.js';

const SHUTDOWN_GRACE_MS = 5000;

export interface Sweeper {
  readonly stop: () => void;
}

// Emitting before disconnecting queues the event ahead of the close, so every client gets it.
function endRoom(io: Server, room: string, reason: GameEndReason): void {
  const ended: GameEnded = { reason };
  io.to(room).emit(GAME_EVENTS.ended, ended);
  io.in(room).disconnectSockets(true);
}

// Runs the store sweep on a timer that never keeps the process alive. A game deleted for its age
// may still have players: tell them it ended. An empty game has nobody to tell.
export function startSweeper(io: Server, store: GameStore, intervalMs: number): Sweeper {
  const timer = setInterval(() => {
    // One failed sweep must not take the server, and every running game, down with it.
    try {
      for (const { gameId, reason } of store.sweep()) {
        if (reason === 'expired') {
          endRoom(io, gameRoom(gameId), 'expired');
        }
      }
    } catch {
      logEvent('sweep.failed', {}, 'warn');
    }
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

export async function endAllGames(io: Server, reason: GameEndReason): Promise<void> {
  const ended: GameEnded = { reason };
  const count = (await io.fetchSockets()).length;
  io.emit(GAME_EVENTS.ended, ended);
  io.disconnectSockets(true);
  logEvent('games.ended', { reason, count });
}

export interface ShutdownParts {
  readonly io: Server;
  readonly httpServer: HttpServer;
  readonly sweeper: Sweeper;
  readonly exit: (code: number) => void;
}

// First signal: tell players, close, exit 0 (forced after a grace period). A second one exits now.
export function registerShutdown(
  { io, httpServer, sweeper, exit }: ShutdownParts,
  signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'],
): () => void {
  let shuttingDown = false;
  const handler = (): void => {
    if (shuttingDown) {
      exit(0);
      return;
    }
    shuttingDown = true;
    sweeper.stop();
    setTimeout(() => exit(0), SHUTDOWN_GRACE_MS);
    void endAllGames(io, 'server-restart')
      .then(() => io.close())
      .then(() => {
        // io.close() also closes the HTTP server it is attached to.
        if (httpServer.listening) httpServer.close();
        exit(0);
      })
      .catch(() => exit(1));
  };
  signals.forEach((signal) => process.on(signal, handler));
  return () => signals.forEach((signal) => process.off(signal, handler));
}
