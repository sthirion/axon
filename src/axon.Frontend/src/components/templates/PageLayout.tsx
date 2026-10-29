import type { ReactNode } from 'react';
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from '../../lib/brand';
import { cn } from '../../lib/utils';
import { Logo } from '../atoms/Logo';
import { ThemeToggle } from '../atoms/ThemeToggle';

export const TEMPORARY_SESSIONS_NOTICE =
  'Sessions are temporary. They are kept in memory only and end when the server restarts.';

interface PageLayoutProps {
  readonly children: ReactNode;
  // The create page shows the name as its own heading, so its header carries no brand text.
  readonly brand?: boolean;
  // The estimation page uses the full width (two columns on desktop); other pages stay narrow.
  readonly wide?: boolean;
  // Extra header content, shown before the theme toggle (the join link of an open session).
  readonly headerExtra?: ReactNode;
}

export function PageLayout({ children, brand = true, wide = false, headerExtra }: PageLayoutProps) {
  const width = wide ? 'max-w-3xl lg:max-w-6xl' : 'max-w-xl';
  return (
    <>
      <header
        className={cn(
          'mx-auto flex w-full min-w-0 flex-wrap items-center justify-between gap-3 p-4 pb-0 sm:px-6',
          width,
        )}
      >
        <div className="min-w-0">
          {brand && (
            <>
              <p className="type-brand">{PRODUCT_NAME}</p>
              <p className="type-meta text-slate-600 dark:text-slate-400">{PRODUCT_SUBTITLE}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {headerExtra}
          <ThemeToggle />
          <Logo />
        </div>
      </header>
      <main className={cn('mx-auto w-full min-w-0 space-y-6 p-4 sm:p-6', width)}>{children}</main>
      <footer
        className={cn(
          'mx-auto w-full min-w-0 p-4 type-meta text-slate-700 sm:px-6 dark:text-slate-300',
          width,
        )}
      >
        <p>{TEMPORARY_SESSIONS_NOTICE}</p>
      </footer>
    </>
  );
}
