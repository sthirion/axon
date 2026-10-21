const KEY_PREFIX = 'axon.playerToken.';

// Per-tab fallback for when localStorage is missing or throws; lost on reload.
const memoryTokens = new Map<string, string>();

function key(gameId: string): string {
  return `${KEY_PREFIX}${gameId}`;
}

// localStorage can be missing or throw (private mode, full quota); the app works without it.
export function readPlayerToken(gameId: string): string | null {
  try {
    const stored = window.localStorage.getItem(key(gameId));
    if (stored) return stored;
  } catch {
    // Fall through to the in-memory token.
  }
  return memoryTokens.get(gameId) ?? null;
}

export function writePlayerToken(gameId: string, token: string): void {
  memoryTokens.set(gameId, token);
  try {
    window.localStorage.setItem(key(gameId), token);
  } catch {
    // Ignored: the seat just will not survive a reload.
  }
}

export function removePlayerToken(gameId: string): void {
  memoryTokens.delete(gameId);
  try {
    window.localStorage.removeItem(key(gameId));
  } catch {
    // Ignored: nothing to clean up if storage is unavailable.
  }
}

// Simulates a page reload in tests.
export function clearPlayerTokenMemory(): void {
  memoryTokens.clear();
}
