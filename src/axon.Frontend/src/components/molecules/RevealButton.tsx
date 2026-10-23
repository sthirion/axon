import { memo, useId, useState } from 'react';
import { actionErrorMessage, GENERIC_ERROR_MESSAGE } from '../../lib/actionErrors';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';

export const NO_VOTES_HINT = 'Waiting for at least one vote.';

interface RevealButtonProps {
  readonly hasVotes: boolean;
  readonly disabled: boolean;
  readonly onReveal: () => Promise<ActionResult>;
}

export const RevealButton = memo(function RevealButton({
  hasVotes,
  disabled,
  onReveal,
}: RevealButtonProps) {
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await onReveal();
      if (!result.ok) setError(actionErrorMessage(result.code));
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        disabled={disabled || !hasVotes || pending}
        aria-describedby={hasVotes ? undefined : hintId}
        onClick={() => void handleClick()}
      >
        {pending ? 'Revealing…' : 'Reveal votes'}
      </Button>
      {!hasVotes && (
        <p id={hintId} className="type-meta text-slate-700 dark:text-slate-300">
          {NO_VOTES_HINT}
        </p>
      )}
      {error && (
        <p role="alert" className="type-meta text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});
RevealButton.displayName = 'RevealButton';
