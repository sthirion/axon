import {
  createGameResponseSchema,
  DEFAULT_SCALE,
  gameExistsResponseSchema,
  type Scale,
} from '@axon/shared';
import type { CreateGameResult } from '../types/game.types';

export async function createGame(
  name: string,
  scale: Scale = DEFAULT_SCALE,
): Promise<CreateGameResult> {
  let response: Response;
  try {
    response = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scale }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (response.status === 201) {
    const parsed = createGameResponseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? { ok: true, ...parsed.data } : { ok: false, reason: 'unavailable' };
  }
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null;
    if (code === 'INVALID_NAME') return { ok: false, reason: 'invalid-name' };
  }
  return { ok: false, reason: 'unavailable' };
}

export async function gameExists(gameId: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/exists`, { signal });
  if (!response.ok) throw new Error(`Game lookup failed with status ${response.status}`);
  return gameExistsResponseSchema.parse(await response.json()).exists;
}
