import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Button({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={cn(
        'min-h-11 min-w-11 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
