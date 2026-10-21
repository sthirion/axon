import { describe, expect, it } from 'vitest';
import {
  ackSchema,
  createGameBodySchema,
  createGameResponseSchema,
  ERROR_CODES,
  ERROR_MESSAGES,
  errorBody,
  failedAck,
  GAME_EVENTS,
  gameExistsResponseSchema,
  gameIdSchema,
  gameJoinedSchema,
  gameJoinPayloadSchema,
  playerTokenSchema,
  publicGameStateSchema,
} from '@axon/shared';

const GAME_ID = 'A'.repeat(22);
const TOKEN = 'B'.repeat(43);

describe('gameIdSchema', () => {
  it('accepts 22 base64url characters', () => {
    expect(gameIdSchema.safeParse('Ab_-0123456789abcdefgh').success).toBe(true);
  });

  it.each(['A'.repeat(21), 'A'.repeat(23), `${'A'.repeat(21)}=`, `${'A'.repeat(21)}/`, '', 5])(
    'rejects %j',
    (value) => {
      expect(gameIdSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('playerTokenSchema', () => {
  it('accepts 43 base64url characters', () => {
    expect(playerTokenSchema.safeParse('Ab_-'.repeat(10) + 'abc').success).toBe(true);
  });

  it.each(['B'.repeat(42), 'B'.repeat(44), `${'B'.repeat(42)}+`, 'short', null])(
    'rejects %j',
    (value) => {
      expect(playerTokenSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('createGameBodySchema', () => {
  it('parses a valid name and trims it', () => {
    expect(createGameBodySchema.parse({ name: ' Sven ' })).toEqual({ name: 'Sven' });
  });

  it('strips unknown fields', () => {
    expect(createGameBodySchema.parse({ name: 'Sven', role: 'x', extra: 1 })).toEqual({
      name: 'Sven',
    });
  });

  it.each([{}, { name: 42 }, { name: '   ' }, { name: 'a\u0007b' }])('rejects %j', (body) => {
    expect(createGameBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('createGameResponseSchema', () => {
  it('accepts a game id and token', () => {
    expect(createGameResponseSchema.safeParse({ gameId: GAME_ID, token: TOKEN }).success).toBe(
      true,
    );
  });

  it('rejects a malformed token', () => {
    expect(createGameResponseSchema.safeParse({ gameId: GAME_ID, token: 'x' }).success).toBe(false);
  });
});

describe('gameExistsResponseSchema', () => {
  it('requires a boolean', () => {
    expect(gameExistsResponseSchema.safeParse({ exists: 'yes' }).success).toBe(false);
  });
});

describe('gameJoinPayloadSchema', () => {
  it('requires a string gameId', () => {
    expect(gameJoinPayloadSchema.safeParse({ gameId: 123, name: 'Anna' }).success).toBe(false);
  });

  it.each(['hello', null, 5, undefined, []])('rejects the non-object %j', (payload) => {
    expect(gameJoinPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('keeps token and name unchecked so the gateway can pick the error code', () => {
    const parsed = gameJoinPayloadSchema.parse({ gameId: GAME_ID, token: 5, name: 42 });

    expect(parsed).toEqual({ gameId: GAME_ID, token: 5, name: 42 });
  });

  it('strips a client-supplied role', () => {
    const parsed = gameJoinPayloadSchema.parse({
      gameId: GAME_ID,
      name: 'Eve',
      role: 'facilitator',
    });

    expect(parsed).not.toHaveProperty('role');
  });

  it('does not let __proto__ through', () => {
    const payload = JSON.parse(`{"gameId":"${GAME_ID}","__proto__":{"role":"facilitator"}}`);

    const parsed = gameJoinPayloadSchema.parse(payload);

    expect(Object.keys(parsed)).toEqual(['gameId']);
  });
});

describe('gameJoinedSchema', () => {
  it('accepts a rejoin without token', () => {
    expect(gameJoinedSchema.safeParse({ playerId: 'p1', role: 'voter' }).success).toBe(true);
  });

  it('accepts a first join with token', () => {
    expect(
      gameJoinedSchema.safeParse({ playerId: 'p1', role: 'voter', token: TOKEN }).success,
    ).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(gameJoinedSchema.safeParse({ playerId: 'p1', role: 'admin' }).success).toBe(false);
  });
});

describe('publicGameStateSchema', () => {
  const state = {
    gameId: GAME_ID,
    facilitator: { name: 'Sven', connected: true },
    voters: [{ id: 'p2', name: 'Anna', connected: false }],
  };

  it('accepts the players-only state', () => {
    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
  });

  it('strips fields that must not be public', () => {
    const parsed = publicGameStateSchema.parse({
      ...state,
      voters: [{ id: 'p2', name: 'Anna', connected: true, tokenHash: 'x', socketIds: ['s'] }],
    });

    expect(parsed.voters[0]).toEqual({ id: 'p2', name: 'Anna', connected: true });
  });

  it('rejects a missing facilitator', () => {
    expect(publicGameStateSchema.safeParse({ gameId: GAME_ID, voters: [] }).success).toBe(false);
  });
});

describe('ackSchema', () => {
  it('accepts success', () => {
    expect(ackSchema.safeParse({ ok: true }).success).toBe(true);
  });

  it('accepts a failure with a code the client does not know yet', () => {
    expect(ackSchema.safeParse({ ok: false, code: 'SOMETHING_NEW', message: 'm' }).success).toBe(
      true,
    );
  });

  it('rejects a failure without a message', () => {
    expect(ackSchema.safeParse({ ok: false, code: 'INVALID_NAME' }).success).toBe(false);
  });
});

describe('error codes', () => {
  it.each([
    'GAME_NOT_FOUND',
    'INVALID_NAME',
    'NAME_TAKEN',
    'INVALID_TOKEN',
    'INVALID_PAYLOAD',
    'ALREADY_JOINED',
    'INVALID_REQUEST',
    'PAYLOAD_TOO_LARGE',
  ])('includes %s', (code) => {
    expect(ERROR_CODES).toContain(code);
  });

  it('has a fixed message for every code', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('builds a {code, message} body', () => {
    expect(errorBody('NAME_TAKEN')).toEqual({
      code: 'NAME_TAKEN',
      message: ERROR_MESSAGES.NAME_TAKEN,
    });
  });

  it('builds a failed ack', () => {
    expect(failedAck('INVALID_TOKEN')).toEqual({
      ok: false,
      code: 'INVALID_TOKEN',
      message: ERROR_MESSAGES.INVALID_TOKEN,
    });
  });
});

describe('GAME_EVENTS', () => {
  it('names the events', () => {
    expect(GAME_EVENTS).toEqual({
      join: 'game:join',
      joined: 'game:joined',
      state: 'game:state',
    });
  });
});
