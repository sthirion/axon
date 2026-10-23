import type { Card } from '@axon/shared';
import { memo, type ReactNode } from 'react';
import { CardFace } from '../atoms/CardFace';
import { StatusBadge } from '../atoms/StatusBadge';
import { VoteBadge } from '../atoms/VoteBadge';

interface PlayerRowProps {
  readonly name: string;
  readonly connected: boolean;
  // Omitted while no voting is open, so no badge is shown.
  readonly hasVoted?: boolean;
  // Set only after the reveal: the voter's card, or `null` for "No vote". Replaces the badge.
  readonly revealedCard?: Card | null;
  readonly outlier?: boolean;
  // Extra controls for this row, shown after the status (for example "Remove").
  readonly action?: ReactNode;
}

export const PlayerRow = memo(function PlayerRow({
  name,
  connected,
  hasVoted,
  revealedCard,
  outlier = false,
  action,
}: PlayerRowProps) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
      <span className="type-name break-all">{name}</span>
      <span className="flex flex-wrap items-baseline gap-x-3">
        {revealedCard === undefined && hasVoted !== undefined && <VoteBadge voted={hasVoted} />}
        {revealedCard === null && (
          <span className="type-meta text-slate-600 dark:text-slate-400">No vote</span>
        )}
        {revealedCard !== undefined && revealedCard !== null && (
          <span className="inline-flex min-w-8 justify-center rounded border border-slate-500 dark:border-slate-400 px-2 font-semibold">
            <span className="sr-only">Vote: </span>
            <CardFace card={revealedCard} />
          </span>
        )}
        {outlier && (
          <span className="type-meta font-medium text-amber-900 dark:text-amber-100">
            <span aria-hidden="true" className="mr-1">
              ▲
            </span>
            Outlier
          </span>
        )}
        <StatusBadge connected={connected} />
        {action}
      </span>
    </span>
  );
});
PlayerRow.displayName = 'PlayerRow';
