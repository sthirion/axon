import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, gameExists } from './gameApiService';
import { GAME_ID, TOKEN } from '../test/fakeSocket';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('gameApiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createGame', () => {
    it('posts the name as JSON and returns the gameId and token on 201', async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ gameId: GAME_ID, token: TOKEN }, 201));
      vi.stubGlobal('fetch', fetchMock);

      const result = await createGame('Sven');

      expect(result).toEqual({ ok: true, gameId: GAME_ID, token: TOKEN });
      expect(fetchMock).toHaveBeenCalledWith('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sven', scale: 'fibonacci' }),
      });
    });

    it('reports invalid-name for a 400 INVALID_NAME', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(json({ code: 'INVALID_NAME', message: 'x' }, 400)),
      );

      expect(await createGame('Sven')).toEqual({ ok: false, reason: 'invalid-name' });
    });

    it.each([
      ['a 400 with another code', () => json({ code: 'INVALID_REQUEST', message: 'x' }, 400)],
      ['a 400 without a JSON body', () => new Response('nope', { status: 400 })],
      ['a 413', () => json({ code: 'PAYLOAD_TOO_LARGE', message: 'x' }, 413)],
      ['a 500', () => json({ code: 'INTERNAL', message: 'x' }, 500)],
      ['a 201 with a malformed body', () => json({ gameId: 'short' }, 201)],
      ['a 201 that is not JSON', () => new Response('nope', { status: 201 })],
    ])('reports unavailable for %s', async (_label, makeResponse) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse()));

      expect(await createGame('Sven')).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('reports unavailable on a network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      expect(await createGame('Sven')).toEqual({ ok: false, reason: 'unavailable' });
    });
  });

  describe('gameExists', () => {
    it.each([true, false])('returns exists=%s from the response', async (exists) => {
      const fetchMock = vi.fn().mockResolvedValue(json({ exists }));
      vi.stubGlobal('fetch', fetchMock);

      expect(await gameExists(GAME_ID)).toBe(exists);
      expect(fetchMock).toHaveBeenCalledWith(`/api/games/${GAME_ID}/exists`, { signal: undefined });
    });

    it('throws on a non-2xx response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)));

      await expect(gameExists(GAME_ID)).rejects.toThrow();
    });

    it('throws when the body does not match the schema', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ exists: 'yes' })));

      await expect(gameExists(GAME_ID)).rejects.toThrow();
    });
  });
});
