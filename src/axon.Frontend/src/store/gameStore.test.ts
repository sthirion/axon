import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import { gameState } from '../test/fakeSocket';

describe('useGameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts empty and not reconnecting', () => {
    expect(useGameStore.getState().game).toBeNull();
    expect(useGameStore.getState().reconnecting).toBe(false);
  });

  it('holds exactly the game:state it was given', () => {
    const state = { ...gameState(), voters: [{ id: 'v1', name: 'Anna', connected: false }] };

    useGameStore.getState().applyState(state);

    expect(useGameStore.getState().game).toEqual(state);
  });

  it('shows reconnecting without changing the last known game', () => {
    const state = gameState();
    useGameStore.getState().applyState(state);

    useGameStore.getState().setReconnecting(true);

    expect(useGameStore.getState().reconnecting).toBe(true);
    expect(useGameStore.getState().game).toEqual(state);
  });

  it('clears reconnecting when the next game:state arrives', () => {
    useGameStore.getState().setReconnecting(true);

    useGameStore.getState().applyState(gameState());

    expect(useGameStore.getState().reconnecting).toBe(false);
  });

  it('reset drops the game and reconnecting flag', () => {
    useGameStore.getState().applyState(gameState());
    useGameStore.getState().setReconnecting(true);

    useGameStore.getState().reset();

    expect(useGameStore.getState().game).toBeNull();
    expect(useGameStore.getState().reconnecting).toBe(false);
  });
});
