import type { PublicGameState, RoundStats } from '@axon/shared';
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

function describeResults(results: RoundStats): string {
  if (results.average === null) return 'No numeric votes';
  return results.consensus
    ? `Consensus: ${results.average}`
    : `No consensus, average ${results.average}`;
}

// Describes what changed between two consecutive snapshots; never includes a card value.
export function describeVoteChanges(
  previous: PublicGameState,
  next: PublicGameState,
  ownPlayerId: string | null,
): string {
  const messages: string[] = [];
  if (previous.phase === 'waiting' && next.phase === 'voting' && next.story) {
    messages.push(`Voting is open: ${next.story.title}`);
  }
  if (next.history.length > previous.history.length) {
    const finished = next.history[next.history.length - 1];
    return finished?.estimate === 'skipped'
      ? 'Story skipped'
      : `Estimate recorded: ${finished?.estimate}`;
  }
  if (previous.phase === 'revealed' && next.phase === 'voting') return 'Re-vote started';
  if (previous.phase !== 'revealed' && next.phase === 'revealed') {
    messages.push('Votes revealed');
    if (next.results) messages.push(describeResults(next.results));
    return messages.join('. ');
  }
  for (const voter of next.voters) {
    if (voter.id === ownPlayerId) continue;
    const before = previous.voters.find((candidate) => candidate.id === voter.id);
    if (!before || before.hasVoted === voter.hasVoted) continue;
    messages.push(voter.hasVoted ? `${voter.name} has voted` : `${voter.name} withdrew their vote`);
  }
  return messages.join('. ');
}

// Text for a polite live region. Baseline snapshots (join, rejoin) and connection-only changes are silent.
export function useVoteAnnouncement(): string {
  const game = useGameStore((state) => state.game);
  const isSnapshot = useGameStore((state) => state.isSnapshot);
  const playerId = useGameStore((state) => state.playerId);
  const [seen, setSeen] = useState<{ game: PublicGameState | null; message: string }>({
    game,
    message: '',
  });

  if (seen.game !== game) {
    const message =
      !isSnapshot && seen.game && game ? describeVoteChanges(seen.game, game, playerId) : '';
    setSeen({ game, message });
  }
  return seen.message;
}
