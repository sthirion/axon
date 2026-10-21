import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { GameStore } from '../store/gameStore.js';
import { registerGateway } from './gateway.js';

export function attachSocketIo(httpServer: HttpServer, store: GameStore): Server {
  // No cookie: sessions are identified by the per-game token only.
  const io = new Server(httpServer, { cookie: false });
  registerGateway(io, store);
  return io;
}
