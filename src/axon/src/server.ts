import { createServer } from 'node:http';
import path from 'node:path';
import { resolveLifetime, resolvePort } from './config.js';
import { createApp } from './http/app.js';
import { registerShutdown, startSweeper } from './realtime/lifecycle.js';
import { attachSocketIo } from './realtime/socketServer.js';
import { GameStore } from './store/gameStore.js';

const port = resolvePort(process.env);
const staticDir =
  process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../axon.Frontend/dist');

const lifetime = resolveLifetime(process.env);
const store = new GameStore({ lifetime });
const httpServer = createServer(createApp({ staticDir, store }));
const io = attachSocketIo(httpServer, store);
const sweeper = startSweeper(io, store, lifetime.sweepIntervalMs);
registerShutdown({ io, httpServer, sweeper, exit: (code) => process.exit(code) });

httpServer.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', event: 'server.listening', port }));
});
