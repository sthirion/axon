import { describe, expect, it } from 'vitest';
import {
  finalEstimateSchema,
  roundFinishEnvelopeSchema,
  roundFinishPayloadSchema,
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

const STATS = {
  distribution: [{ card: 5, count: 1 }],
  average: 5,
  consensus: false,
  outlierIds: [],
  suggestedEstimate: 5,
};

describe('publicGameStateSchema', () => {
  const REVEALED = {
    gameId: GAME_ID,
    phase: 'revealed',
    story: { title: 'T' },
    facilitator: { name: 'Sven', connected: true },
    voters: [
      { id: 'p2', name: 'Anna', connected: false, hasVoted: true, card: 5 },
      { id: 'p3', name: 'Bob', connected: false, hasVoted: false },
    ],
    results: STATS,
    history: [],
    total: 0,
  };

  it('accepts a revealed state with cards and results', () => {
    expect(publicGameStateSchema.safeParse(REVEALED).success).toBe(true);
  });

  it('accepts a revealed state with null stats fields', () => {
    const results = {
      distribution: [{ card: '?', count: 1 }],
      average: null,
      consensus: false,
      outlierIds: [],
      suggestedEstimate: null,
    };

    expect(publicGameStateSchema.safeParse({ ...REVEALED, results }).success).toBe(true);
  });

  const state = {
    gameId: GAME_ID,
    phase: 'waiting',
    story: null,
    facilitator: { name: 'Sven', connected: true },
    voters: [{ id: 'p2', name: 'Anna', connected: false, hasVoted: false }],
    history: [],
    total: 0,
  };

  it('accepts a waiting state', () => {
    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
  });

  it('accepts a voting state with and without a story link', () => {
    const voting = { ...state, phase: 'voting' };

    expect(publicGameStateSchema.safeParse({ ...voting, story: { title: 'T' } }).success).toBe(
      true,
    );
    expect(
      publicGameStateSchema.safeParse({ ...voting, story: { title: 'T', url: 'https://e.com' } })
        .success,
    ).toBe(true);
  });

  it.each([
    ['a top-level vote', { ...state, votes: {} }],
    ['a voter card while waiting', { ...state, voters: [{ ...state.voters[0], card: 5 }] }],
    ['a voter token hash', { ...state, voters: [{ ...state.voters[0], tokenHash: 'x' }] }],
    ['an extra facilitator key', { ...state, facilitator: { ...state.facilitator, card: 5 } }],
    ['an extra story key', { ...state, phase: 'voting', story: { title: 'T', card: 5 } }],
    ['a null story url', { ...state, phase: 'voting', story: { title: 'T', url: null } }],
    ['an unknown phase', { ...state, phase: 'finished' }],
    ['a results object while voting', { ...state, phase: 'voting', results: STATS }],
    ['a results object while waiting', { ...state, results: STATS }],
    [
      'a card while voting',
      { ...state, phase: 'voting', voters: [{ ...state.voters[0], card: 5 }] },
    ],
    ['an extra results key', { ...REVEALED, results: { ...STATS, votes: [] } }],
    ['a card outside the deck', { ...REVEALED, voters: [{ ...REVEALED.voters[0], card: 4 }] }],
    ['a missing phase', { ...state, phase: undefined }],
    ['a missing story', { ...state, story: undefined }],
    ['a missing hasVoted', { ...state, voters: [{ id: 'p2', name: 'Anna', connected: false }] }],
  ])('rejects %s', (_label, value) => {
    expect(publicGameStateSchema.safeParse(value).success).toBe(false);
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
    'INVALID_STORY',
    'INVALID_CARD',
    'FORBIDDEN',
    'WRONG_PHASE',
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
      storySet: 'story:set',
      voteCast: 'vote:cast',
      voteMine: 'vote:mine',
      roundReveal: 'round:reveal',
      roundRevote: 'round:revote',
      roundFinish: 'round:finish',
    });
  });
});

describe('publicGameStateSchema history', () => {
  const state = {
    gameId: GAME_ID,
    phase: 'waiting',
    story: null,
    facilitator: { name: 'Sven', connected: true },
    voters: [],
    history: [
      { title: 'A', url: 'https://e.com/a', estimate: 5 },
      { title: 'B', estimate: 'skipped' },
    ],
    total: 5,
  };

  it('accepts numeric and skipped entries', () => {
    expect(publicGameStateSchema.safeParse(state).success).toBe(true);
  });

  it.each([
    ['a missing history', { ...state, history: undefined }],
    ['a missing total', { ...state, total: undefined }],
    ['an extra entry key', { ...state, history: [{ title: 'A', estimate: 5, votes: [] }] }],
    ['an unknown estimate string', { ...state, history: [{ title: 'A', estimate: 'later' }] }],
    ['a null estimate', { ...state, history: [{ title: 'A', estimate: null }] }],
    ['a string total', { ...state, total: '5' }],
  ])('rejects %s', (_label, value) => {
    expect(publicGameStateSchema.safeParse(value).success).toBe(false);
  });
});

describe('finalEstimateSchema', () => {
  it.each([0, 1, 2, 3, 5, 8, 13, 21])('accepts %d', (value) => {
    expect(finalEstimateSchema.safeParse(value).success).toBe(true);
  });

  it.each(['?', 'coffee', '5', 4, 5.5, -1, null, true, {}, []])('rejects %j', (value) => {
    expect(finalEstimateSchema.safeParse(value).success).toBe(false);
  });
});

describe('roundFinishEnvelopeSchema', () => {
  it.each([
    { finalEstimate: 5 },
    { finalEstimate: 'coffee' },
    { skip: true },
    { finalEstimate: null },
  ])('accepts %j (the value is checked later)', (value) => {
    expect(roundFinishEnvelopeSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    {},
    { finalEstimate: 5, skip: true },
    { skip: false },
    { skip: 'true' },
    { skip: 1 },
    null,
    undefined,
    'skip',
    5,
    [],
  ])('rejects %j', (value) => {
    expect(roundFinishEnvelopeSchema.safeParse(value).success).toBe(false);
  });
});

describe('roundFinishPayloadSchema', () => {
  it('accepts an estimate or a skip and rejects the rest', () => {
    expect(roundFinishPayloadSchema.safeParse({ finalEstimate: 13 }).success).toBe(true);
    expect(roundFinishPayloadSchema.safeParse({ skip: true }).success).toBe(true);
    expect(roundFinishPayloadSchema.safeParse({ finalEstimate: '?' }).success).toBe(false);
    expect(roundFinishPayloadSchema.safeParse({ skip: false }).success).toBe(false);
  });
});
