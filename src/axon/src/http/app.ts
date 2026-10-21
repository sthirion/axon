import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { GameStore } from '../store/gameStore.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createGamesRouter } from './games.js';
import { healthHandler } from './health.js';
import { securityHeaders } from './securityHeaders.js';
import { spaFallback } from './spaFallback.js';

export interface AppOptions {
  staticDir: string;
  store: GameStore;
  extendRoutes?: (app: Express) => void;
}

export function createApp({ staticDir, store, extendRoutes }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());

  app.get('/healthz', healthHandler);
  app.use('/api/games', createGamesRouter(store));
  extendRoutes?.(app);

  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    app.use(express.static(staticDir, { redirect: false }));
    app.use(spaFallback(path.join(path.resolve(staticDir), 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
