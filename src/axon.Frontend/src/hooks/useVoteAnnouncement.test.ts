import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { describeVoteChanges, useVoteAnnouncement } from './useVoteAnnouncement';
import { useGameStore } from '../store/gameStore';
import { gameState } from '../test/fakeSocket';

const ANNA = { id: 'p1', name: 'Anna', connected: true, hasVoted: false };
const BOB = { id: 'p2', name: 'Bob', connected: true, hasVoted: false };
const STORY = { title: 'Login page' };

const voting = (voters: object[]) => gameState({ phase: 'voting', story: STORY, voters });

describe('describeVoteChanges', () => {
  it('announces a voter who has voted', () => {
    expect(describeVoteChanges(voting([ANNA]), voting([{ ...ANNA, hasVoted: true }]), null)).toBe(
      'Anna has voted',
    );
  });

  it('announces a voter who withdrew', () => {
    expect(describeVoteChanges(voting([{ ...ANNA, hasVoted: true }]), voting([ANNA]), null)).toBe(
      'Anna withdrew their vote',
    );
  });

  it('announces that voting is open with the story title', () => {
    expect(describeVoteChanges(gameState({ voters: [ANNA] }), voting([ANNA]), null)).toBe(
      'Voting is open: Login page',
    );
  });

  it('says nothing for a story edit while voting', () => {
    const edited = gameState({ phase: 'voting', story: { title: 'Other' }, voters: [ANNA] });

    expect(describeVoteChanges(voting([ANNA]), edited, null)).toBe('');
  });

  it('says nothing for a connection-only change', () => {
    expect(describeVoteChanges(voting([ANNA]), voting([{ ...ANNA, connected: false }]), null)).toBe(
      '',
    );
  });

  it('does not announce the own vote', () => {
    expect(describeVoteChanges(voting([ANNA]), voting([{ ...ANNA, hasVoted: true }]), 'p1')).toBe(
      '',
    );
  });

  it('ignores voters that were not in the previous state', () => {
    expect(
      describeVoteChanges(voting([ANNA]), voting([ANNA, { ...BOB, hasVoted: true }]), null),
    ).toBe('');
  });
});

describe('describeVoteChanges after reveal', () => {
  const revealed = gameState({
    phase: 'revealed',
    story: STORY,
    voters: [ANNA],
    results: {
      distribution: [{ card: 5, count: 1 }],
      average: 5,
      consensus: false,
      outlierIds: [],
      suggestedEstimate: 5,
    },
  });

  it('announces a re-vote', () => {
    expect(describeVoteChanges(revealed, voting([ANNA]), null)).toBe('Re-vote started');
  });

  it('announces a recorded estimate and a skip, without a card or a voter name', () => {
    const recorded = gameState({
      voters: [ANNA],
      history: [{ title: 'Login page', estimate: 5 }],
      total: 5,
    });
    const skipped = gameState({
      voters: [ANNA],
      history: [{ title: 'Login page', estimate: 'skipped' }],
    });

    expect(describeVoteChanges(revealed, recorded, null)).toBe('Estimate recorded: 5');
    expect(describeVoteChanges(voting([ANNA]), skipped, null)).toBe('Story skipped');
  });

  it('says nothing when the history is unchanged', () => {
    const waiting = gameState({ voters: [ANNA], history: [{ title: 'A', estimate: 3 }] });

    expect(describeVoteChanges(waiting, waiting, null)).toBe('');
  });
});

describe('describeVoteChanges on reveal', () => {
  const stats = (overrides: object) => ({
    distribution: [{ card: 5, count: 2 }],
    average: 5,
    consensus: true,
    outlierIds: [],
    suggestedEstimate: 5,
    ...overrides,
  });
  const revealed = (results: object) =>
    gameState({ phase: 'revealed', story: STORY, voters: [ANNA], results });

  it.each([
    ['consensus', stats({}), 'Votes revealed. Consensus: 5'],
    [
      'no consensus',
      stats({ consensus: false, average: 5.3 }),
      'Votes revealed. No consensus, average 5.3',
    ],
    [
      'no numeric votes',
      stats({ average: null, consensus: false, distribution: [{ card: '?', count: 1 }] }),
      'Votes revealed. No numeric votes',
    ],
  ])('announces the reveal with %s', (_label, results, expected) => {
    expect(describeVoteChanges(voting([ANNA]), revealed(results), null)).toBe(expected);
  });

  it('never includes a card value other than the average', () => {
    const message = describeVoteChanges(voting([ANNA]), revealed(stats({ average: 8 })), null);

    expect(message).not.toMatch(/Anna/);
  });

  it('says nothing when the state stays revealed', () => {
    expect(describeVoteChanges(revealed(stats({})), revealed(stats({})), null)).toBe('');
  });
});

describe('useVoteAnnouncement', () => {
  const apply = (state: ReturnType<typeof gameState>) =>
    act(() => useGameStore.getState().applyState(state));

  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('is silent for the first snapshot, even when someone already voted', () => {
    const { result } = renderHook(() => useVoteAnnouncement());

    apply(voting([{ ...ANNA, hasVoted: true }]));

    expect(result.current).toBe('');
  });

  it('announces another voter voting and withdrawing', () => {
    const { result } = renderHook(() => useVoteAnnouncement());
    apply(voting([ANNA, BOB]));

    apply(voting([ANNA, { ...BOB, hasVoted: true }]));
    expect(result.current).toBe('Bob has voted');

    apply(voting([ANNA, BOB]));
    expect(result.current).toBe('Bob withdrew their vote');
  });

  it('announces when voting opens', () => {
    const { result } = renderHook(() => useVoteAnnouncement());
    apply(gameState({ voters: [ANNA] }));

    apply(voting([ANNA]));

    expect(result.current).toBe('Voting is open: Login page');
  });

  it('clears the announcement on a connection-only change', () => {
    const { result } = renderHook(() => useVoteAnnouncement());
    apply(voting([ANNA]));
    apply(voting([{ ...ANNA, hasVoted: true }]));

    apply(voting([{ ...ANNA, hasVoted: true, connected: false }]));

    expect(result.current).toBe('');
  });

  it('does not announce the own vote', () => {
    const { result } = renderHook(() => useVoteAnnouncement());
    act(() => useGameStore.getState().applyJoined({ playerId: 'p1', role: 'voter' }));
    apply(voting([ANNA]));

    apply(voting([{ ...ANNA, hasVoted: true }]));

    expect(result.current).toBe('');
  });

  it('treats the first state after a reconnect as a baseline', () => {
    const { result } = renderHook(() => useVoteAnnouncement());
    apply(voting([ANNA, BOB]));
    act(() => useGameStore.getState().setReconnecting(true));

    apply(voting([ANNA, { ...BOB, hasVoted: true }]));
    expect(result.current).toBe('');

    apply(voting([ANNA, BOB]));
    expect(result.current).toBe('Bob withdrew their vote');
  });

  it('announces the reveal once and is silent when joining an already revealed game', () => {
    const results = {
      distribution: [{ card: 5, count: 2 }],
      average: 5,
      consensus: true,
      outlierIds: [],
      suggestedEstimate: 5,
    };
    const { result } = renderHook(() => useVoteAnnouncement());
    apply(voting([ANNA]));

    apply(gameState({ phase: 'revealed', story: STORY, voters: [ANNA], results }));
    expect(result.current).toBe('Votes revealed. Consensus: 5');

    act(() => useGameStore.getState().reset());
    apply(gameState({ phase: 'revealed', story: STORY, voters: [ANNA], results }));
    expect(result.current).toBe('');
  });
});
