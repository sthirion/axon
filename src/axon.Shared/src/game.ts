import { z } from 'zod';

export const GAME_EVENTS = {
  join: 'game:join',
  joined: 'game:joined',
  state: 'game:state',
} as const;

export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const PLAYER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PLAYER_NAME_MAX_LENGTH = 30;

const CONTROL_CHARACTER = /\p{Cc}/u;

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

export const publicGameStateSchema = z.object({
  gameId: gameIdSchema,
  facilitator: z.object({ name: z.string(), connected: z.boolean() }),
  voters: z.array(z.object({ id: z.string(), name: z.string(), connected: z.boolean() })),
});

export type PublicGameState = z.infer<typeof publicGameStateSchema>;
