import type {
  Card,
  CreateGameResponse,
  GameJoined,
  GameJoinPayload,
  PublicGameState,
  StorySetPayload,
} from '@axon/shared';

export type CreateGameResult =
  | ({ readonly ok: true } & CreateGameResponse)
  | { readonly ok: false; readonly reason: 'invalid-name' | 'unavailable' };

export type JoinResult = { readonly ok: true } | { readonly ok: false; readonly code: string };

// Same shape as a join result; `code` is TIMEOUT when no ack arrived in time.
export type ActionResult = JoinResult;

export interface GameSocketHandlers {
  readonly onJoined: (joined: GameJoined) => void;
  readonly onState: (state: PublicGameState) => void;
  readonly onVoteMine: (card: Card | null) => void;
  readonly onDisconnect: () => void;
  readonly onRejoinFailed: (code: string) => void;
}

export interface GameSocketClient {
  readonly join: (payload: GameJoinPayload) => Promise<JoinResult>;
  readonly setStory: (payload: StorySetPayload) => Promise<ActionResult>;
  readonly castVote: (card: Card | null) => Promise<ActionResult>;
  readonly revealRound: () => Promise<ActionResult>;
  readonly close: () => void;
}
