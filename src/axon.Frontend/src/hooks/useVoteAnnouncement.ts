import { isTooLarge, type PublicGameState, type RoundStats, type Scale } from '@axon/shared';
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

function describeResults(results: RoundStats, scale: Scale): string {
  if (results.median === null) return 'No sized votes';
  const base = results.consensus
    ? `Consensus: ${results.suggestedEstimate}`
    : // Numbers have an average; t-shirt sizes only a middle size.
      results.average === null
      ? `No consensus, median ${results.median}`
      : `No consensus, average ${results.average}`;
  return isTooLarge(scale, results.suggestedEstimate)
    ? `${base}, too large to take as one story`
    : base;
}

// Describes what changed between two consecutive snapshots; never includes a card value.
export function describeVoteChanges(
  previous: PublicGameState,
  next: PublicGameState,
  ownPlayerId: string | null,
): string {
  const messages: string[] = [];
  if (previous.facilitator.connected !== next.facilitator.connected) {
    messages.push(
      next.facilitator.connected ? 'The facilitator is back' : 'The facilitator is offline',
    );
  }
  for (const voter of previous.voters) {
    if (!next.voters.some((candidate) => candidate.id === voter.id)) {
      messages.push(`${voter.name} was removed`);
    }
  }
  if (next.history.length > previous.history.length) {
    const finished = next.history[next.history.length - 1];
    messages.push(
      finished?.estimate === 'skipped'
        ? 'Story skipped'
        : `Estimate recorded: ${finished?.estimate}${
            isTooLarge(next.scale, finished?.estimate) ? ', too large to take as one story' : ''
          }`,
    );
  } else if (previous.phase === 'revealed' && next.phase === 'voting') {
    messages.push('Re-vote started');
  } else if (previous.phase !== 'revealed' && next.phase === 'revealed') {
    messages.push('Votes revealed');
    if (next.results) messages.push(describeResults(next.results, next.scale));
  } else {
    if (previous.phase === 'waiting' && next.phase === 'voting' && next.story) {
      // A link-only story has no title to read out.
      messages.push(
        next.story.title === '' ? 'Voting is open' : `Voting is open: ${next.story.title}`,
      );
    }
    for (const voter of next.voters) {
      if (voter.id === ownPlayerId) continue;
      const before = previous.voters.find((candidate) => candidate.id === voter.id);
      if (!before || before.hasVoted === voter.hasVoted) continue;
      messages.push(
        voter.hasVoted ? `${voter.name} has voted` : `${voter.name} withdrew their vote`,
      );
    }
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
