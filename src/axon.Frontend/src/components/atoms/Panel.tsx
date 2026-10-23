import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

type PanelProps = Omit<ComponentProps<'section'>, 'ref'> & {
  // `div` for a panel that is not a landmark (its content is already named).
  readonly as?: 'section' | 'div';
};

// One shaded, bordered box per section, so the page is easy to scan. The border is decorative; the
// heading carries the meaning. No overflow-hidden, so focus rings are never cut off.
export function Panel({ as: Tag = 'section', className, ...props }: PanelProps) {
  return (
    <Tag
      data-panel
      className={cn(
        'min-w-0 space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm sm:p-5 dark:border-slate-600 dark:bg-slate-800 dark:shadow-none',
        className,
      )}
      {...props}
    />
  );
}
