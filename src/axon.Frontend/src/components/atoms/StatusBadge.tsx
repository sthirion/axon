import { memo } from 'react';
import { cn } from '../../lib/utils';

interface StatusBadgeProps {
  readonly connected: boolean;
}

// Status is text first; the dot is decoration.
export const StatusBadge = memo(function StatusBadge({ connected }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'type-meta',
        connected ? 'text-green-800 dark:text-green-400' : 'text-slate-600 dark:text-slate-400',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mr-1 inline-block size-2 rounded-full',
          connected ? 'bg-green-700 dark:bg-green-400' : 'bg-slate-400',
        )}
      />
      {connected ? 'online' : 'offline'}
    </span>
  );
});
StatusBadge.displayName = 'StatusBadge';
