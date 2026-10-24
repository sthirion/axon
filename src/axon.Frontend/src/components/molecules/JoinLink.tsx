import { memo, useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';

export const LINK_COPIED_MESSAGE = 'Link copied';
export const LINK_COPY_FAILED_MESSAGE =
  'Could not copy. Copy the address from the browser address bar instead.';
// How long the check mark (and the failure text) stays before it is gone.
export const COPY_FEEDBACK_MS = 5000;

interface JoinLinkProps {
  readonly gameId: string;
  // The full join link that "Copy link" puts on the clipboard.
  readonly link: string;
}

// Lives in the page header: only the session ID is shown, the button copies the whole link.
// Success is a check mark that fades out (screen readers hear "Link copied"); a failure is text.
export const JoinLink = memo(function JoinLink({ gameId, link }: JoinLinkProps) {
  const [feedback, setFeedback] = useState<{ ok: boolean; count: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function show(ok: boolean) {
    clearTimeout(timer.current);
    setFeedback((previous) => ({ ok, count: (previous?.count ?? 0) + 1 }));
    timer.current = setTimeout(() => setFeedback(null), COPY_FEEDBACK_MS);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      show(true);
    } catch {
      show(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 font-mono type-meta break-all select-all">
        <span className="sr-only">Session ID: </span>
        {gameId}
      </p>
      <Button onClick={() => void copy()}>Copy link</Button>
      <p role="status" aria-live="polite" className="type-meta">
        {feedback?.ok === true && (
          <>
            <span
              key={feedback.count}
              aria-hidden="true"
              className="animate-fade-out inline-block text-lg font-bold text-green-800 dark:text-green-400"
            >
              ✓
            </span>
            <span className="sr-only">{LINK_COPIED_MESSAGE}</span>
          </>
        )}
        {feedback?.ok === false && LINK_COPY_FAILED_MESSAGE}
      </p>
    </div>
  );
});
JoinLink.displayName = 'JoinLink';
