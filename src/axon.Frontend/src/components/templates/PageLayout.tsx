import type { ReactNode } from 'react';

export const TEMPORARY_GAMES_NOTICE =
  'Games are temporary. They are kept in memory only and end when the server restarts.';

interface PageLayoutProps {
  readonly children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <>
      <main className="mx-auto w-full max-w-xl min-w-0 space-y-6 p-4 sm:p-6">{children}</main>
      <footer className="mx-auto w-full max-w-xl min-w-0 p-4 text-sm text-slate-700 sm:px-6">
        <p>{TEMPORARY_GAMES_NOTICE}</p>
      </footer>
    </>
  );
}
