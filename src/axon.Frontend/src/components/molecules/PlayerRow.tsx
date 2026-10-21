import { memo } from 'react';
import { StatusBadge } from '../atoms/StatusBadge';

interface PlayerRowProps {
  readonly name: string;
  readonly connected: boolean;
}

export const PlayerRow = memo(function PlayerRow({ name, connected }: PlayerRowProps) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-medium break-all">{name}</span>
      <StatusBadge connected={connected} />
    </span>
  );
});
PlayerRow.displayName = 'PlayerRow';
