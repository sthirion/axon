import { describe, expect, it } from 'vitest';
import { DEFAULT_LIFETIME, resolveLifetime } from './config.js';

describe('resolveLifetime', () => {
  it('defaults to 2 minutes empty, 2 hours maximum age and a 30 second sweep', () => {
    expect(resolveLifetime({})).toEqual({
      emptyTtlMs: 120_000,
      maxAgeMs: 7_200_000,
      sweepIntervalMs: 30_000,
    });
    expect(DEFAULT_LIFETIME.maxAgeMs).toBe(2 * 60 * 60 * 1000);
  });

  it('treats empty strings as unset', () => {
    expect(
      resolveLifetime({ GAME_EMPTY_TTL_MS: '', GAME_MAX_AGE_MS: '', SWEEP_INTERVAL_MS: '' }),
    ).toEqual(DEFAULT_LIFETIME);
  });

  it('reads the three variables', () => {
    expect(
      resolveLifetime({
        GAME_EMPTY_TTL_MS: '1500',
        GAME_MAX_AGE_MS: '9000',
        SWEEP_INTERVAL_MS: '250',
      }),
    ).toEqual({ emptyTtlMs: 1500, maxAgeMs: 9000, sweepIntervalMs: 250 });
  });

  it.each(['GAME_EMPTY_TTL_MS', 'GAME_MAX_AGE_MS', 'SWEEP_INTERVAL_MS'])(
    'rejects bad values for %s with a message naming it',
    (name) => {
      for (const value of ['0', '-5', '1.5', 'abc', '1e3', ' 5', '5 ', '99999999999999999999']) {
        expect(() => resolveLifetime({ [name]: value }), `${name}=${value}`).toThrow(
          new RegExp(`Invalid ${name}`),
        );
      }
    },
  );
});
