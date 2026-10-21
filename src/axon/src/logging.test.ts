import { afterEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from './logging.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logEvent', () => {
  it('writes an info line with level, event and gameId only', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logEvent('game.created', { gameId: 'g1' });

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      level: 'info',
      event: 'game.created',
      gameId: 'g1',
    });
  });

  it('writes a warning with the code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logEvent('join.rejected', { gameId: 'g1', code: 'NAME_TAKEN' }, 'warn');

    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      level: 'warn',
      event: 'join.rejected',
      gameId: 'g1',
      code: 'NAME_TAKEN',
    });
  });

  it('omits the gameId when none is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logEvent('join.rejected', { code: 'INVALID_PAYLOAD' }, 'warn');

    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).not.toHaveProperty('gameId');
  });
});
