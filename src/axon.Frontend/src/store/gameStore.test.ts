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
    const state = {
      ...gameState(),
      voters: [{ id: 'v1', name: 'Anna', connected: false, hasVoted: false }],
    };

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

  it('keeps the role and player id from game:joined', () => {
    useGameStore.getState().applyJoined({ playerId: 'p1', role: 'facilitator' });

    expect(useGameStore.getState().role).toBe('facilitator');
    expect(useGameStore.getState().playerId).toBe('p1');
  });

  it('keeps the own card from vote:mine, including a withdrawal', () => {
    useGameStore.getState().applyVoteMine(8);
    expect(useGameStore.getState().myCard).toBe(8);

    useGameStore.getState().applyVoteMine(null);
    expect(useGameStore.getState().myCard).toBeNull();
  });

  it('does not touch the own card when game:state arrives', () => {
    useGameStore.getState().applyVoteMine('coffee');

    useGameStore.getState().applyState(gameState());

    expect(useGameStore.getState().myCard).toBe('coffee');
  });

  it('marks the first state and the first state after a disconnect as snapshots', () => {
    useGameStore.getState().applyState(gameState());
    expect(useGameStore.getState().isSnapshot).toBe(true);

    useGameStore.getState().applyState(gameState());
    expect(useGameStore.getState().isSnapshot).toBe(false);

    useGameStore.getState().setReconnecting(true);
    useGameStore.getState().applyState(gameState());
    expect(useGameStore.getState().isSnapshot).toBe(true);
  });

  it('reset also drops the role, player id and own card', () => {
    useGameStore.getState().applyJoined({ playerId: 'p1', role: 'voter' });
    useGameStore.getState().applyVoteMine(5);

    useGameStore.getState().reset();

    expect(useGameStore.getState().role).toBeNull();
    expect(useGameStore.getState().playerId).toBeNull();
    expect(useGameStore.getState().myCard).toBeNull();
  });
});
