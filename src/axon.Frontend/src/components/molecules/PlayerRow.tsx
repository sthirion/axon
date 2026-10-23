import { memo } from 'react';
import { StatusBadge } from '../atoms/StatusBadge';
import { VoteBadge } from '../atoms/VoteBadge';

interface PlayerRowProps {
  readonly name: string;
  readonly connected: boolean;
  // Omitted while no voting is open, so no badge is shown.
  readonly hasVoted?: boolean;
}

export const PlayerRow = memo(function PlayerRow({ name, connected, hasVoted }: PlayerRowProps) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-medium break-all">{name}</span>
      <span className="flex flex-wrap items-baseline gap-x-3">
        {hasVoted !== undefined && <VoteBadge voted={hasVoted} />}
        <StatusBadge connected={connected} />
      </span>
    </span>
  );
});
PlayerRow.displayName = 'PlayerRow';
