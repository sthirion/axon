import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import {
  createGameBodySchema,
  createGameResponseSchema,
  errorBody,
  gameExistsResponseSchema,
  gameIdSchema,
} from '@axon/shared';
import { logEvent } from '../logging.js';
import type { GameStore } from '../store/gameStore.js';

export const CREATE_GAME_BODY_LIMIT = '1kb';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

export function createGameHandler(store: GameStore): RequestHandler {
  return (req, res) => {
    const body: unknown = req.body;
    if (!isJsonObject(body)) {
      res.status(400).json(errorBody('INVALID_REQUEST'));
      return;
    }
    const parsed = createGameBodySchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json(errorBody('INVALID_NAME'));
      return;
    }
    const created = createGameResponseSchema.parse(store.createGame(parsed.data.name));
    logEvent('game.created', { gameId: created.gameId });
    res.status(201).json(created);
  };
}

// A malformed ID gets the same answer as an unknown one, so callers cannot tell them apart.
export function gameExistsHandler(store: GameStore): RequestHandler {
  return (req, res) => {
    const id = req.params.id;
    const exists = gameIdSchema.safeParse(id).success && store.exists(id as string);
    res.status(200).json(gameExistsResponseSchema.parse({ exists }));
  };
}

// Body-parser errors must become {code,message}, not reach the 500 handler.
export const gamesErrorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (err instanceof URIError) {
    // Only the exists route has path params; an undecodable ID is just an unknown game.
    res.status(200).json({ exists: false });
    return;
  }
  const { type, status } = (err ?? {}) as { type?: unknown; status?: unknown };
  if (type === 'entity.too.large') {
    res.status(413).json(errorBody('PAYLOAD_TOO_LARGE'));
    return;
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(400).json(errorBody('INVALID_REQUEST'));
    return;
  }
  next(err);
};

export function createGamesRouter(store: GameStore): Router {
  const router = Router();
  router.use(noStore);
  router.post('/', express.json({ limit: CREATE_GAME_BODY_LIMIT }), createGameHandler(store));
  router.get('/:id/exists', gameExistsHandler(store));
  router.use(gamesErrorHandler);
  return router;
}
