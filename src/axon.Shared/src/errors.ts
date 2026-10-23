import { z } from 'zod';

export const ERROR_CODES = [
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
  'REMOVED',
  'INVALID_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  'INTERNAL',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

// Fixed strings: never echo input, paths or internal IDs.
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  GAME_NOT_FOUND: 'This game does not exist or has ended.',
  INVALID_NAME: 'Enter a name of 1 to 30 characters.',
  NAME_TAKEN: 'That name is already taken in this game. Choose another.',
  INVALID_TOKEN: 'Your saved seat is no longer valid. Join again with a name.',
  INVALID_PAYLOAD: 'The request is not valid.',
  ALREADY_JOINED: 'This connection has already joined a game.',
  INVALID_STORY: 'Enter a title of 1 to 200 characters and an optional http or https link.',
  INVALID_CARD: 'That card is not in the deck.',
  FORBIDDEN: 'You are not allowed to do that.',
  WRONG_PHASE: 'That action is not available right now.',
  REMOVED: 'You were removed from this game.',
  INVALID_REQUEST: 'The request body must be a JSON object.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  NOT_FOUND: 'Not found',
  INTERNAL: 'Internal server error',
};

export interface ErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
}

export function errorBody(code: ErrorCode): ErrorBody {
  return { code, message: ERROR_MESSAGES[code] };
}

// `code` is a plain string so a client still parses codes added by a newer server.
export const ackSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);

export type Ack =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string };

export function failedAck(code: ErrorCode): Ack {
  return { ok: false, ...errorBody(code) };
}
