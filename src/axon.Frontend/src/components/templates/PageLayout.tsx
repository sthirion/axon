import type { ReactNode } from 'react';

interface PageLayoutProps {
  readonly children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return <main className="mx-auto w-full max-w-xl min-w-0 space-y-6 p-4 sm:p-6">{children}</main>;
}
