import { memo } from 'react';
import { cn } from '../../lib/utils';

interface VoteBadgeProps {
  readonly voted: boolean;
}

// Status is text first; the icon is decoration. Never carries a card value.
export const VoteBadge = memo(function VoteBadge({ voted }: VoteBadgeProps) {
  return (
    <span
      className={cn(
        'text-sm',
        voted ? 'text-green-800 dark:text-green-400' : 'text-slate-600 dark:text-slate-400',
      )}
    >
      <span aria-hidden="true" className="mr-1">
        {voted ? '✓' : '○'}
      </span>
      {voted ? 'Voted' : 'Not voted'}
    </span>
  );
});
VoteBadge.displayName = 'VoteBadge';
