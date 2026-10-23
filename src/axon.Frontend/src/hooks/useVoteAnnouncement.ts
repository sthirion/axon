import type { PublicGameState } from '@axon/shared';
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

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
