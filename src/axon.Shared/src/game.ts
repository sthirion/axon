import { z } from 'zod';
import { cardSchema } from './deck.js';

export const GAME_EVENTS = {
  join: 'game:join',
  joined: 'game:joined',
  state: 'game:state',
  storySet: 'story:set',
  voteCast: 'vote:cast',
  voteMine: 'vote:mine',
} as const;

export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const PLAYER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PLAYER_NAME_MAX_LENGTH = 30;

export const CONTROL_CHARACTER = /\p{Cc}/u;

export const gameIdSchema = z.string().regex(GAME_ID_PATTERN);

export const playerTokenSchema = z.string().regex(PLAYER_TOKEN_PATTERN);

// Trim, then NFC, then count code points (String.length counts UTF-16 units).
export const playerNameSchema = z
  .string()
  .trim()
  .normalize('NFC')
  .refine((name) => {
    const length = [...name].length;
    return length >= 1 && length <= PLAYER_NAME_MAX_LENGTH;
  })
  .refine((name) => !CONTROL_CHARACTER.test(name));

// Names are unique per game ignoring case; compare keys, never raw names.
export function playerNameKey(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}

export const playerRoleSchema = z.enum(['facilitator', 'voter']);

export type PlayerRole = z.infer<typeof playerRoleSchema>;

export const createGameBodySchema = z.object({ name: playerNameSchema });

export type CreateGameBody = z.infer<typeof createGameBodySchema>;

export const createGameResponseSchema = z.object({
  gameId: gameIdSchema,
  token: playerTokenSchema,
});

export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;

export const gameExistsResponseSchema = z.object({ exists: z.boolean() });

export type GameExistsResponse = z.infer<typeof gameExistsResponseSchema>;

// Server-side envelope: only the shape is checked here so each field can fail with its own
// error code (INVALID_PAYLOAD, GAME_NOT_FOUND, INVALID_TOKEN, INVALID_NAME). Unknown keys
// such as `role` are stripped.
export const gameJoinPayloadSchema = z.object({
  gameId: z.string(),
  token: z.unknown().optional(),
  name: z.unknown().optional(),
});

// What a client sends: `token` (rejoin) or `name` (new voter). `token` wins if both are set.
export interface GameJoinPayload {
  readonly gameId: string;
  readonly token?: string;
  readonly name?: string;
}

export const gameJoinedSchema = z.object({
  playerId: z.string(),
  role: playerRoleSchema,
  token: playerTokenSchema.optional(),
});

export type GameJoined = z.infer<typeof gameJoinedSchema>;

export const gamePhaseSchema = z.enum(['waiting', 'voting']);

export type GamePhase = z.infer<typeof gamePhaseSchema>;

// Strict on purpose: an unexpected key (for example a vote value) must fail validation, not be stripped.
export const publicGameStateSchema = z.strictObject({
  gameId: gameIdSchema,
  phase: gamePhaseSchema,
  story: z.strictObject({ title: z.string(), url: z.string().optional() }).nullable(),
  facilitator: z.strictObject({ name: z.string(), connected: z.boolean() }),
  voters: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      connected: z.boolean(),
      hasVoted: z.boolean(),
    }),
  ),
});

export type PublicGameState = z.infer<typeof publicGameStateSchema>;

// Only a plain object passes; the card itself is validated later so the error code can differ.
export const voteCastEnvelopeSchema = z
  .looseObject({ card: z.unknown() })
  .refine((payload) => 'card' in payload);

// What a client sends: `null` withdraws the vote.
export const voteCastPayloadSchema = z.object({ card: cardSchema.nullable() });

export type VoteCastPayload = z.infer<typeof voteCastPayloadSchema>;

export const voteMineSchema = z.strictObject({ card: cardSchema.nullable() });

export type VoteMine = z.infer<typeof voteMineSchema>;
