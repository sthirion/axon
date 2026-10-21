import express, { type NextFunction, type Request } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_ID_PATTERN, PLAYER_TOKEN_PATTERN } from '@axon/shared';
import { GameStore } from '../store/gameStore.js';
import {
  createGameHandler,
  createGamesRouter,
  gameExistsHandler,
  gamesErrorHandler,
} from './games.js';
import { createFakeResponse } from './testing/fakes.js';

function aRequest(parts: { body?: unknown; params?: Record<string, string> }): Request {
  return { body: parts.body, params: parts.params ?? {} } as unknown as Request;
}

function bodyParserError(type: string, status: number): Error {
  return Object.assign(new Error('parser failure with /secret/path'), { type, status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createGameHandler', () => {
  it('creates a game and answers 201 with gameId and token', () => {
    const store = new GameStore();
    const fake = createFakeResponse();

    createGameHandler(store)(aRequest({ body: { name: 'Sven' } }), fake.res, vi.fn());

    expect(fake.statusCode).toBe(201);
    const body = fake.body as { gameId: string; token: string };
    expect(body.gameId).toMatch(GAME_ID_PATTERN);
    expect(body.token).toMatch(PLAYER_TOKEN_PATTERN);
    expect(Object.keys(body).sort()).toEqual(['gameId', 'token']);
  });

  it('stores the trimmed name for the facilitator', () => {
    const store = new GameStore();
    const fake = createFakeResponse();

    createGameHandler(store)(aRequest({ body: { name: '  Sven  ' } }), fake.res, vi.fn());

    const game = store.get((fake.body as { gameId: string }).gameId)!;
    expect(game.players.get(game.facilitatorId)?.name).toBe('Sven');
  });

  it('ignores extra fields in the body', () => {
    const store = new GameStore();
    const fake = createFakeResponse();

    createGameHandler(store)(aRequest({ body: { name: 'Sven', role: 'x' } }), fake.res, vi.fn());

    expect(fake.statusCode).toBe(201);
  });

  it.each([
    ['whitespace-only', { name: '   ' }],
    ['a control character', { name: 'a\u0007b' }],
    ['a number', { name: 42 }],
    ['a missing name', {}],
    ['31 characters', { name: 'a'.repeat(31) }],
  ])('answers 400 INVALID_NAME for %s and creates no game', (_label, body) => {
    const store = new GameStore();
    const createSpy = vi.spyOn(store, 'createGame');
    const fake = createFakeResponse();

    createGameHandler(store)(aRequest({ body }), fake.res, vi.fn());

    expect(fake.statusCode).toBe(400);
    expect(fake.body).toMatchObject({ code: 'INVALID_NAME' });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing body (wrong content type)', undefined],
    ['a string', 'Sven'],
    ['null', null],
    ['an array', [{ name: 'Sven' }]],
  ])('answers 400 INVALID_REQUEST for %s', (_label, body) => {
    const store = new GameStore();
    const fake = createFakeResponse();

    createGameHandler(store)(aRequest({ body }), fake.res, vi.fn());

    expect(fake.statusCode).toBe(400);
    expect(fake.body).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('logs only the event and the game id', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fake = createFakeResponse();

    createGameHandler(new GameStore())(aRequest({ body: { name: 'Sven' } }), fake.res, vi.fn());

    const { gameId, token } = fake.body as { gameId: string; token: string };
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({ level: 'info', event: 'game.created', gameId });
    expect(line).not.toContain(token);
    expect(line).not.toContain('Sven');
  });
});

describe('gameExistsHandler', () => {
  it('answers true for an existing game', () => {
    const store = new GameStore();
    const { gameId } = store.createGame('Sven');
    const fake = createFakeResponse();

    gameExistsHandler(store)(aRequest({ params: { id: gameId } }), fake.res, vi.fn());

    expect(fake.statusCode).toBe(200);
    expect(fake.body).toEqual({ exists: true });
  });

  it.each([
    ['an unknown id', 'A'.repeat(22)],
    ['a too short id', 'abc123'],
    ['a too long id', 'A'.repeat(23)],
    ['markup', '<script>'],
  ])('answers 200 with exists false for %s', (_label, id) => {
    const fake = createFakeResponse();

    gameExistsHandler(new GameStore())(aRequest({ params: { id } }), fake.res, vi.fn());

    expect(fake.statusCode).toBe(200);
    expect(fake.body).toEqual({ exists: false });
  });
});

describe('gamesErrorHandler', () => {
  const next: NextFunction = vi.fn();
  const handle = (err: unknown) => {
    const fake = createFakeResponse();
    gamesErrorHandler(err, aRequest({}), fake.res, next);
    return fake;
  };

  it('maps an oversized body to 413 PAYLOAD_TOO_LARGE', () => {
    const fake = handle(bodyParserError('entity.too.large', 413));

    expect(fake.statusCode).toBe(413);
    expect(fake.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('maps malformed JSON to 400 INVALID_REQUEST', () => {
    const fake = handle(bodyParserError('entity.parse.failed', 400));

    expect(fake.statusCode).toBe(400);
    expect(fake.body).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('does not leak the parser message', () => {
    const fake = handle(bodyParserError('entity.parse.failed', 400));

    expect(JSON.stringify(fake.body)).not.toContain('secret');
  });

  it('treats an undecodable id as an unknown game', () => {
    const fake = handle(new URIError('malformed'));

    expect(fake.statusCode).toBe(200);
    expect(fake.body).toEqual({ exists: false });
  });

  it('passes unexpected errors on', () => {
    const error = new Error('boom');
    const forwarded = vi.fn();
    const fake = createFakeResponse();

    gamesErrorHandler(error, aRequest({}), fake.res, forwarded);

    expect(forwarded).toHaveBeenCalledWith(error);
    expect(fake.statusCode).toBeUndefined();
  });

  it('passes server errors on instead of masking them as 400', () => {
    const error = bodyParserError('x', 500);
    const forwarded = vi.fn();

    gamesErrorHandler(error, aRequest({}), createFakeResponse().res, forwarded);

    expect(forwarded).toHaveBeenCalledWith(error);
  });
});

describe('createGamesRouter wiring', () => {
  const appWith = (store: GameStore) => {
    const app = express();
    app.use('/api/games', createGamesRouter(store));
    return app;
  };

  it('answers an oversized body with 413 and the error body, not 500', async () => {
    const response = await request(appWith(new GameStore()))
      .post('/api/games')
      .send({ name: 'a'.repeat(2048) });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers malformed JSON with 400 INVALID_REQUEST', async () => {
    const response = await request(appWith(new GameStore()))
      .post('/api/games')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
  });

  it('answers a non-JSON content type with 400 INVALID_REQUEST', async () => {
    const response = await request(appWith(new GameStore()))
      .post('/api/games')
      .set('Content-Type', 'text/plain')
      .send('name=Sven');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
  });

  it('sets no-store and no cookie on the create response', async () => {
    const response = await request(appWith(new GameStore()))
      .post('/api/games')
      .send({ name: 'Sven' });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('answers exists with 200 even when the id cannot be URL-decoded', async () => {
    const response = await request(appWith(new GameStore())).get('/api/games/%E0%A4%A/exists');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ exists: false });
  });
});
