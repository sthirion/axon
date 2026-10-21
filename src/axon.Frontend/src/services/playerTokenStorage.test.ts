import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlayerTokenMemory,
  readPlayerToken,
  removePlayerToken,
  writePlayerToken,
} from './playerTokenStorage';

const GAME_ID = 'AAAAAAAAAAAAAAAAAAAAAA';

describe('playerTokenStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('writes and reads the token under axon.playerToken.<gameId>', () => {
    writePlayerToken(GAME_ID, 'abc');

    expect(window.localStorage.getItem(`axon.playerToken.${GAME_ID}`)).toBe('abc');
    expect(readPlayerToken(GAME_ID)).toBe('abc');
  });

  it('returns null when no token is stored for the game', () => {
    writePlayerToken('BBBBBBBBBBBBBBBBBBBBBB', 'other');

    expect(readPlayerToken(GAME_ID)).toBeNull();
  });

  it('removes only the token of the given game', () => {
    writePlayerToken(GAME_ID, 'abc');
    writePlayerToken('BBBBBBBBBBBBBBBBBBBBBB', 'other');

    removePlayerToken(GAME_ID);

    expect(readPlayerToken(GAME_ID)).toBeNull();
    expect(readPlayerToken('BBBBBBBBBBBBBBBBBBBBBB')).toBe('other');
  });

  describe('when storage throws', () => {
    beforeEach(() => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('denied');
      });
    });

    it('does not throw and reads null when nothing was written', () => {
      expect(readPlayerToken(GAME_ID)).toBeNull();
      expect(() => removePlayerToken(GAME_ID)).not.toThrow();
    });

    it('keeps the written token in memory for the rest of the tab session', () => {
      expect(() => writePlayerToken(GAME_ID, 'abc')).not.toThrow();

      expect(readPlayerToken(GAME_ID)).toBe('abc');
    });

    it('forgets the in-memory token on remove and after the memory is cleared', () => {
      writePlayerToken(GAME_ID, 'abc');
      removePlayerToken(GAME_ID);
      expect(readPlayerToken(GAME_ID)).toBeNull();

      writePlayerToken(GAME_ID, 'abc');
      clearPlayerTokenMemory();
      expect(readPlayerToken(GAME_ID)).toBeNull();
    });
  });
});
