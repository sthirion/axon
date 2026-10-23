import { memo, useState } from 'react';
import { Button } from '../atoms/Button';

export const LINK_COPIED_MESSAGE = 'Link copied';
export const LINK_COPY_FAILED_MESSAGE = 'Could not copy. Select the link and copy it manually.';

interface JoinLinkProps {
  readonly link: string;
}

export const JoinLink = memo(function JoinLink({ link }: JoinLinkProps) {
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
    <div className="space-y-2">
      <p className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 font-mono type-meta break-all select-all">
        {link}
      </p>
      <Button onClick={() => void copy()}>Copy link</Button>
      <p role="status" aria-live="polite" className="min-h-5 type-meta">
        {message}
      </p>
    </div>
  );
});
JoinLink.displayName = 'JoinLink';
