import type {
  CreateGameResponse,
  GameJoined,
  GameJoinPayload,
  PublicGameState,
} from '@axon/shared';

export type CreateGameResult =
  | ({ readonly ok: true } & CreateGameResponse)
  | { readonly ok: false; readonly reason: 'invalid-name' | 'unavailable' };

export type JoinResult = { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface GameSocketHandlers {
  readonly onJoined: (joined: GameJoined) => void;
  readonly onState: (state: PublicGameState) => void;
  readonly onDisconnect: () => void;
  readonly onRejoinFailed: (code: string) => void;
}

export interface GameSocketClient {
  readonly join: (payload: GameJoinPayload) => Promise<JoinResult>;
  readonly close: () => void;
}
