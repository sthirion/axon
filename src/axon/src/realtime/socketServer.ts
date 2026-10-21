import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

export function attachSocketIo(httpServer: HttpServer): Server {
  return new Server(httpServer);
}
