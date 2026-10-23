import type { Card, Scale } from '@axon/shared';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { MiniCard } from './MiniCard';
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
  // The session's scale, so the revealed card gets its size colour.
  readonly scale?: Scale;
  // Position in the voters list, to stagger the reveal flip.
  readonly order?: number;
  // Extra controls for this row, shown after the status (for example "Remove").
  readonly action?: ReactNode;
}

export const PlayerRow = memo(function PlayerRow({
  name,
  connected,
  hasVoted,
  revealedCard,
  outlier = false,
  scale,
  order,
  action,
}: PlayerRowProps) {
  // Changes after the first paint are animated; a reload or a late join shows the end state at once.
  const [animate, setAnimate] = useState(false);
  useEffect(() => setAnimate(true), []);
  const miniCard =
    revealedCard !== undefined && revealedCard !== null ? (
      <MiniCard
        key="face"
        variant="face"
        card={revealedCard}
        scale={scale}
        animate={animate}
        order={order}
      />
    ) : revealedCard === null || hasVoted === false ? (
      <MiniCard key="slot" variant="slot" />
    ) : hasVoted === true ? (
      <MiniCard key="back" variant="back" animate={animate} />
    ) : null;
  return (
    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
      <span className="type-name break-all">{name}</span>
      <span className="flex flex-wrap items-baseline gap-x-3">
        {miniCard}
        {revealedCard === undefined && hasVoted !== undefined && <VoteBadge voted={hasVoted} />}
        {revealedCard === null && (
          <span className="type-meta text-slate-600 dark:text-slate-400">No vote</span>
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
