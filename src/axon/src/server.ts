import { createServer } from 'node:http';
import path from 'node:path';
import { resolvePort } from './config.js';
import { createApp } from './http/app.js';
import { attachSocketIo } from './realtime/socketServer.js';
import { GameStore } from './store/gameStore.js';

const port = resolvePort(process.env);
const staticDir =
  process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../axon.Frontend/dist');

const store = new GameStore();
const httpServer = createServer(createApp({ staticDir, store }));
attachSocketIo(httpServer, store);

httpServer.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', event: 'server.listening', port }));
});
