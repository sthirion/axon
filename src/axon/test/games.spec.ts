import os from 'node:os';
import path from 'node:path';
import { errorBody, type ErrorCode } from '@axon/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { GameStore } from '../src/store/gameStore.js';

const MISSING_STATIC_DIR = path.join(os.tmpdir(), 'axon-games-spec-no-static');
const GAME_ID_FORMAT = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const UNKNOWN_GAME_ID = 'A'.repeat(22);

function anApp(store: GameStore) {
  return createApp({ staticDir: MISSING_STATIC_DIR, store });
}

function postCreate(app: ReturnType<typeof anApp>, body: string | undefined, contentType: string) {
  const req = request(app).post('/api/games');
  const typed = contentType === '' ? req : req.set('Content-Type', contentType);
  return body === undefined ? typed : typed.send(body);
}

describe('/api/games', () => {
  let store: GameStore;
  let app: ReturnType<typeof anApp>;

  beforeEach(() => {
    store = new GameStore();
    app = anApp(store);
  });

  describe('POST /api/games', () => {
    it('with a valid name returns 201 with a 22-char gameId and a 43-char token', async () => {
      // Given
      const body = { name: 'Sven' };

      // When
      const res = await request(app).post('/api/games').send(body);

      // Then
      expect(res.status).toBe(201);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(Object.keys(res.body).sort()).toEqual(['gameId', 'token']);
      expect(res.body.gameId).toMatch(GAME_ID_FORMAT);
      expect(res.body.token).toMatch(TOKEN_FORMAT);
      expect(store.exists(res.body.gameId)).toBe(true);
    });

    it('with a valid name returns Cache-Control no-store, no Set-Cookie and no Location', async () => {
      // Given
      const body = { name: 'Sven' };

      // When
      const res = await request(app).post('/api/games').send(body);

      // Then
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers.location).toBeUndefined();
    });

    it('with surrounding whitespace and extra fields creates a game and ignores the extras', async () => {
      // Given
      const createGame = vi.spyOn(store, 'createGame');
      const body = { name: '  Sven  ', role: 'voter', extra: 1 };

      // When
      const res = await request(app).post('/api/games').send(body);

      // Then
      expect(res.status).toBe(201);
      expect(createGame).toHaveBeenCalledExactlyOnceWith('Sven', undefined);
    });

    it('with a 30 code point name made of emoji returns 201', async () => {
      // Given
      const body = { name: '😀'.repeat(30) };

      // When
      const res = await request(app).post('/api/games').send(body);

      // Then
      expect(res.status).toBe(201);
    });

    it('twice returns two different gameIds and tokens', async () => {
      // Given
      const body = { name: 'Sven' };

      // When
      const first = await request(app).post('/api/games').send(body);
      const second = await request(app).post('/api/games').send(body);

      // Then
      expect(first.body.gameId).not.toBe(second.body.gameId);
      expect(first.body.token).not.toBe(second.body.token);
    });

    const invalidRequests: ReadonlyArray<{
      label: string;
      body: string | undefined;
      type: string;
      status: number;
      code: ErrorCode;
    }> = [
      {
        label: 'whitespace-only name',
        body: '{"name":"   "}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'empty name',
        body: '{"name":""}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'control character in name',
        body: '{"name":"a\\u0007b"}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'tab in name',
        body: '{"name":"a\\tb"}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: '31 code point name',
        body: JSON.stringify({ name: 'a'.repeat(31) }),
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'numeric name',
        body: '{"name":42}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'null name',
        body: '{"name":null}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'empty object',
        body: '{}',
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'long name under the body limit',
        body: JSON.stringify({ name: 'a'.repeat(900) }),
        type: 'application/json',
        status: 400,
        code: 'INVALID_NAME',
      },
      {
        label: 'JSON string body',
        body: '"Sven"',
        type: 'application/json',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: 'JSON array body',
        body: '[]',
        type: 'application/json',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: 'JSON null body',
        body: 'null',
        type: 'application/json',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: 'malformed JSON',
        body: '{not json',
        type: 'application/json',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: 'text/plain body',
        body: 'name=Sven',
        type: 'text/plain',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: 'JSON text sent as text/plain',
        body: '{"name":"Sven"}',
        type: 'text/plain',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: 'no body and no content type',
        body: undefined,
        type: '',
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        label: '2 kB JSON object',
        body: JSON.stringify({ name: 'a'.repeat(2048) }),
        type: 'application/json',
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      },
    ];

    it.each(invalidRequests)(
      'with $label returns $status $code and creates no game',
      async ({ body, type, status, code }) => {
        // Given
        const createGame = vi.spyOn(store, 'createGame');

        // When
        const res = await postCreate(app, body, type);

        // Then
        expect(res.status).toBe(status);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.body).toEqual(errorBody(code));
        expect(createGame).not.toHaveBeenCalled();
      },
    );

    it('with an invalid body still returns no-store and no Set-Cookie', async () => {
      // Given
      const body = '{"name":"   "}';

      // When
      const res = await postCreate(app, body, 'application/json');

      // Then
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('with an error does not leak a stack trace or path', async () => {
      // Given
      const body = '{not json';

      // When
      const res = await postCreate(app, body, 'application/json');

      // Then
      expect(Object.keys(res.body).sort()).toEqual(['code', 'message']);
      expect(res.text).not.toMatch(/\bat\s.+\(|node_modules|\/Users\//);
    });
  });

  describe('GET /api/games/:id/exists', () => {
    it('with an existing game returns 200 {exists:true}', async () => {
      // Given
      const { gameId } = store.createGame('Sven');

      // When
      const res = await request(app).get(`/api/games/${gameId}/exists`);

      // Then
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ exists: true });
    });

    it('with a game created over HTTP returns {exists:true}', async () => {
      // Given
      const created = await request(app).post('/api/games').send({ name: 'Sven' });

      // When
      const res = await request(app).get(`/api/games/${created.body.gameId}/exists`);

      // Then
      expect(res.body).toEqual({ exists: true });
    });

    it.each([
      ['an unknown well-formed id', UNKNOWN_GAME_ID],
      ['a short id', 'abc123'],
      ['an encoded HTML id', '%3Cscript%3E'],
      ['a 23-char id', 'A'.repeat(23)],
      ['an id with an invalid percent escape', '%E0%A4%A'],
    ])('with %s returns 200 {exists:false}', async (_label, id) => {
      // Given
      store.createGame('Sven');

      // When
      const res = await request(app).get(`/api/games/${id}/exists`);

      // Then
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ exists: false });
    });

    it('returns Cache-Control no-store and no Set-Cookie for existing and unknown ids', async () => {
      // Given
      const { gameId } = store.createGame('Sven');

      // When
      const known = await request(app).get(`/api/games/${gameId}/exists`);
      const unknown = await request(app).get(`/api/games/${UNKNOWN_GAME_ID}/exists`);

      // Then
      for (const res of [known, unknown]) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });

    it('does not reveal the token or player names', async () => {
      // Given
      const { gameId, token } = store.createGame('Sven');

      // When
      const res = await request(app).get(`/api/games/${gameId}/exists`);

      // Then
      expect(res.text).not.toContain(token);
      expect(res.text).not.toContain('Sven');
    });
  });

  describe('unknown /api paths', () => {
    it.each(['/api/nope', '/api/games/x/y/z', '/api/games'])(
      'GET %s returns 404 NOT_FOUND JSON and not the SPA',
      async (route) => {
        // Given
        const target = route;

        // When
        const res = await request(app).get(target);

        // Then
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.body).toEqual(errorBody('NOT_FOUND'));
      },
    );
  });

  describe('restart', () => {
    it('with a new app and a new store returns {exists:false} for a previous game', async () => {
      // Given
      const created = await request(app).post('/api/games').send({ name: 'Sven' });
      const before = await request(app).get(`/api/games/${created.body.gameId}/exists`);
      const restarted = anApp(new GameStore());

      // When
      const after = await request(restarted).get(`/api/games/${created.body.gameId}/exists`);

      // Then
      expect(before.body).toEqual({ exists: true });
      expect(after.status).toBe(200);
      expect(after.body).toEqual({ exists: false });
    });
  });
});

describe('POST /api/games with a voting scale', () => {
  let store: GameStore;
  let app: ReturnType<typeof anApp>;

  beforeEach(() => {
    store = new GameStore();
    app = anApp(store);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('creates a Fibonacci session when no scale is sent', async () => {
    const res = await request(app).post('/api/games').send({ name: 'Sven' });

    expect(res.status).toBe(201);
    expect(store.get(res.body.gameId)?.scale).toBe('fibonacci');
  });

  it.each(['fibonacci', 'incremental', 'tshirt'])('creates a %s session', async (scale) => {
    const res = await request(app).post('/api/games').send({ name: 'Sven', scale });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['gameId', 'token']);
    expect(store.get(res.body.gameId)?.scale).toBe(scale);
  });

  it.each([
    ['an unknown scale', 'huge'],
    ['different case', 'Fibonacci'],
    ['a hyphenated name', 't-shirt'],
    ['an empty string', ''],
    ['null', null],
    ['a number', 5],
    ['a boolean', true],
    ['an object', {}],
    ['an array', ['tshirt']],
  ])('rejects %s with 400 INVALID_SCALE and creates nothing', async (_label, scale) => {
    const before = store.get('x'.repeat(22));

    const res = await request(app).post('/api/games').send({ name: 'Sven', scale });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody('INVALID_SCALE' as ErrorCode));
    expect(res.body.message).toBe('Choose Fibonacci, incremental or t-shirt sizes.');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(before).toBeUndefined();
  });

  it('reports a bad name before a bad scale', async () => {
    const res = await request(app).post('/api/games').send({ name: '', scale: 'huge' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_NAME');
  });

  it('ignores other keys as before', async () => {
    const res = await request(app)
      .post('/api/games')
      .send({ name: 'Sven', scale: 'tshirt', role: 'voter', total: 5 });

    expect(res.status).toBe(201);
    expect(store.get(res.body.gameId)?.scale).toBe('tshirt');
  });

  it('keeps the scale for the exists route, which still reveals nothing else', async () => {
    const created = await request(app)
      .post('/api/games')
      .send({ name: 'Sven', scale: 'incremental' });

    const res = await request(app).get(`/api/games/${created.body.gameId}/exists`);

    expect(res.body).toEqual({ exists: true });
  });
});
