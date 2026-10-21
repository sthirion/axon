import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { healthResponseSchema } from '@axon/shared';
import { io as ioClient } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/http/app.js';
import { attachSocketIo } from '../src/realtime/socketServer.js';
import { GameStore } from '../src/store/gameStore.js';

const INDEX_HTML =
  '<!doctype html><html lang="en"><head><title>Axon</title></head><body><h1>Axon</h1></body></html>';
const NOT_FOUND = { code: 'NOT_FOUND', message: 'Not found' };
const INTERNAL = { code: 'INTERNAL', message: 'Internal server error' };

const EXPECTED_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
];

function aStaticFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-static-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), INDEX_HTML);
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log("axon");');
  return dir;
}

function parseCsp(value: string): string[] {
  return value
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean);
}

describe('app', () => {
  let staticDir: string;
  let httpServer: http.Server;
  let io: SocketServer;
  let baseUrl: string;

  beforeAll(async () => {
    staticDir = aStaticFixture();
    const store = new GameStore();
    const app = createApp({
      staticDir,
      store,
      extendRoutes: (instance) => {
        instance.get('/__test/throw', () => {
          throw new Error('boom at /Users/secret/path/server.ts');
        });
      },
    });
    httpServer = http.createServer(app);
    io = attachSocketIo(httpServer, store);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await io.close();
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  describe('/healthz', () => {
    it('GET /healthz returns 200 JSON, no-store and the exact health body', async () => {
      // Given
      const route = '/healthz';

      // When
      const res = await request(baseUrl).get(route);

      // Then
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toBe('{"status":"ok"}');
      expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
    });

    it('HEAD /healthz returns 200 with an empty body', async () => {
      // Given
      const route = '/healthz';

      // When
      const res = await request(baseUrl).head(route);

      // Then
      expect(res.status).toBe(200);
      expect(res.text ?? '').toBe('');
    });

    it('POST /healthz returns 404 JSON and not the SPA', async () => {
      // Given
      const route = '/healthz';

      // When
      const res = await request(baseUrl).post(route);

      // Then
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body).toEqual(NOT_FOUND);
    });
  });

  describe('app shell', () => {
    it.each(['/', '/g/abc123'])('GET %s returns index.html', async (route) => {
      // Given
      const expected = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf8');

      // When
      const res = await request(baseUrl).get(route);

      // Then
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
      expect(res.text).toBe(expected);
    });

    it('HEAD /g/abc123 returns 200 text/html with an empty body', async () => {
      // Given
      const route = '/g/abc123';

      // When
      const res = await request(baseUrl).head(route);

      // Then
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
      expect(res.text ?? '').toBe('');
    });

    it('GET / without a static folder returns 404 JSON and /healthz still returns 200', async () => {
      // Given
      const app = createApp({
        staticDir: path.join(staticDir, 'does-not-exist'),
        store: new GameStore(),
      });

      // When
      const health = await request(app).get('/healthz');
      const root = await request(app).get('/');

      // Then
      expect(health.status).toBe(200);
      expect(root.status).toBe(404);
      expect(root.headers['content-type']).toMatch(/^application\/json/);
      expect(root.body).toEqual(NOT_FOUND);
    });
  });

  describe('routing outside the SPA', () => {
    it.each(['get', 'post'] as const)('%s /api/does-not-exist returns 404 JSON', async (method) => {
      // Given
      const route = '/api/does-not-exist';

      // When
      const res = await request(baseUrl)[method](route);

      // Then
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it.each(['/api/does-not-exist', '/assets/missing.js'])(
      'HEAD %s returns 404 and never HTML',
      async (route) => {
        // Given
        const client = request(baseUrl);

        // When
        const res = await client.head(route);

        // Then
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).not.toMatch(/text\/html/);
        expect(res.text ?? '').toBe('');
      },
    );

    it('GET /socket.io polling returns 200 and is not the SPA', async () => {
      // Given
      const route = '/socket.io/?EIO=4&transport=polling';

      // When
      const res = await request(baseUrl).get(route);

      // Then
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).not.toMatch(/text\/html/);
      expect(res.text).not.toContain('<html');
    });

    it('GET /assets/missing.js returns 404 JSON', async () => {
      // Given
      const route = '/assets/missing.js';

      // When
      const res = await request(baseUrl).get(route);

      // Then
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('POST / returns 404 JSON', async () => {
      // Given
      const route = '/';

      // When
      const res = await request(baseUrl).post(route);

      // Then
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it('GET /__test/throw returns 500 JSON without stack, path or message', async () => {
      // Given
      const route = '/__test/throw';

      // When
      const res = await request(baseUrl).get(route);

      // Then
      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body).toEqual(INTERNAL);
      expect(res.text).not.toMatch(/boom|stack|\/Users|server\.ts/);
    });
  });

  describe('security headers', () => {
    const responseClasses = [
      ['200 JSON', 'get', '/healthz'],
      ['200 HEAD', 'head', '/healthz'],
      ['200 HTML', 'get', '/'],
      ['200 HTML (SPA fallback)', 'get', '/g/abc123'],
      ['200 static file', 'get', '/assets/app.js'],
      ['404 API', 'get', '/api/does-not-exist'],
      ['404 missing file', 'get', '/assets/missing.js'],
      ['404 wrong method', 'post', '/'],
      ['500', 'get', '/__test/throw'],
    ] as const;

    it.each(responseClasses)(
      '%s (%s %s) carries the helmet headers',
      async (_label, method, route) => {
        // Given
        const client = request(baseUrl);

        // When
        const res = await client[method](route);

        // Then
        const csp = String(res.headers['content-security-policy']);
        expect(parseCsp(csp)).toEqual(EXPECTED_CSP);
        expect(csp).not.toContain('unsafe-eval');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['referrer-policy']).toBe('no-referrer');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
        expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
        expect(res.headers['x-powered-by']).toBeUndefined();
      },
    );
  });

  describe('Socket.IO', () => {
    it('client connecting to / receives connect', async () => {
      // Given
      const client = ioClient(baseUrl, { reconnection: false });

      // When
      const outcome = await new Promise<string>((resolve) => {
        client.on('connect', () => resolve('connect'));
        client.on('connect_error', (err) => resolve(`connect_error: ${err.message}`));
      });
      client.close();

      // Then
      expect(outcome).toBe('connect');
    });

    it('client connecting to /nope receives connect_error Invalid namespace', async () => {
      // Given
      const client = ioClient(`${baseUrl}/nope`, { reconnection: false });

      // When
      const message = await new Promise<string>((resolve) => {
        client.on('connect', () => resolve('connect'));
        client.on('connect_error', (err) => resolve(err.message));
      });
      client.close();

      // Then
      expect(message).toBe('Invalid namespace');
    });

    it('registers only the game gateway connection listener', () => {
      // Given
      const mainNamespace = io.of('/');

      // When
      const namespaceListeners = mainNamespace.listenerCount('connection');
      const serverListeners = io.listenerCount('connection');

      // Then
      expect(namespaceListeners).toBe(1);
      expect(serverListeners).toBe(1);
    });
  });
});
