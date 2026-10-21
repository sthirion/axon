import type { PublicGameState } from '@axon/shared';
import { create } from 'zustand';

interface GameStoreState {
  readonly game: PublicGameState | null;
  readonly reconnecting: boolean;
  readonly applyState: (game: PublicGameState) => void;
  readonly setReconnecting: (reconnecting: boolean) => void;
  readonly reset: () => void;
}

// Only game:state writes `game`; there are no optimistic updates.
export const useGameStore = create<GameStoreState>((set) => ({
  game: null,
  reconnecting: false,
  applyState: (game) => set({ game, reconnecting: false }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  reset: () => set({ game: null, reconnecting: false }),
}));
