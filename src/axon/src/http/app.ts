import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { healthHandler } from './health.js';
import { securityHeaders } from './securityHeaders.js';
import { spaFallback } from './spaFallback.js';

export interface AppOptions {
  staticDir: string;
  extendRoutes?: (app: Express) => void;
}

export function createApp({ staticDir, extendRoutes }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());

  app.get('/healthz', healthHandler);
  extendRoutes?.(app);

  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    app.use(express.static(staticDir, { redirect: false }));
    app.use(spaFallback(path.join(path.resolve(staticDir), 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
