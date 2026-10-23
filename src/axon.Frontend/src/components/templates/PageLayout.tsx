import type { ReactNode } from 'react';
import { ThemeToggle } from '../atoms/ThemeToggle';

export const TEMPORARY_GAMES_NOTICE =
  'Games are temporary. They are kept in memory only and end when the server restarts.';

interface PageLayoutProps {
  readonly children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-xl min-w-0 justify-end p-4 pb-0 sm:px-6">
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-xl min-w-0 space-y-6 p-4 sm:p-6">{children}</main>
      <footer className="mx-auto w-full max-w-xl min-w-0 p-4 text-sm text-slate-700 dark:text-slate-300 sm:px-6">
        <p>{TEMPORARY_GAMES_NOTICE}</p>
      </footer>
    </>
  );
}
