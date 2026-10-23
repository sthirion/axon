import { memo, useState } from 'react';
import { Button } from '../atoms/Button';

export const LINK_COPIED_MESSAGE = 'Link copied';
export const LINK_COPY_FAILED_MESSAGE =
  'Could not copy. Copy the address from the browser address bar instead.';

interface JoinLinkProps {
  readonly gameId: string;
  // The full join link that "Copy link" puts on the clipboard.
  readonly link: string;
}

// Lives in the page header: only the session ID is shown, the button copies the whole link.
export const JoinLink = memo(function JoinLink({ gameId, link }: JoinLinkProps) {
  const [message, setMessage] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage(LINK_COPIED_MESSAGE);
    } catch {
      setMessage(LINK_COPY_FAILED_MESSAGE);
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
        {message}
      </p>
    </div>
  );
});
JoinLink.displayName = 'JoinLink';
