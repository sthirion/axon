import type { Card, GameJoined, PlayerRole, PublicGameState } from '@axon/shared';
import { create } from 'zustand';

interface GameStoreState {
  readonly game: PublicGameState | null;
  readonly reconnecting: boolean;
  // True for the first game:state after joining or rejoining: it is a baseline, not a change.
  readonly isSnapshot: boolean;
  readonly role: PlayerRole | null;
  readonly playerId: string | null;
  readonly myCard: Card | null;
  readonly applyJoined: (joined: GameJoined) => void;
  readonly applyState: (game: PublicGameState) => void;
  readonly applyVoteMine: (card: Card | null) => void;
  readonly setReconnecting: (reconnecting: boolean) => void;
  readonly reset: () => void;
}

const EMPTY = {
  game: null,
  reconnecting: false,
  isSnapshot: true,
  role: null,
  playerId: null,
  myCard: null,
} as const;

// Only server events write here (game:joined, game:state, vote:mine); there are no optimistic updates.
export const useGameStore = create<GameStoreState>((set) => ({
  ...EMPTY,
  applyJoined: ({ role, playerId }) => set({ role, playerId }),
  applyState: (game) =>
    set((state) => ({
      game,
      reconnecting: false,
      isSnapshot: state.game === null || state.reconnecting,
    })),
  applyVoteMine: (myCard) => set({ myCard }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  reset: () => set(EMPTY),
}));
