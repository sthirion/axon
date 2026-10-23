import { memo, useEffect, useRef, useState } from 'react';
import { actionErrorMessage, GENERIC_ERROR_MESSAGE } from '../../lib/actionErrors';

export const PLAYER_GONE_MESSAGE = 'That player is no longer in the session.';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';

interface RemovePlayerButtonProps {
  readonly name: string;
  readonly disabled: boolean;
  readonly onRemove: () => Promise<ActionResult>;
}

// Removing discards a vote and cannot be undone, so it takes a second, explicit click.
export const RemovePlayerButton = memo(function RemovePlayerButton({
  name,
  disabled,
  onRemove,
}: RemovePlayerButtonProps) {
  const removeRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Return focus to "Remove" when the confirmation closes without removing.
  useEffect(() => {
    if (wasConfirming.current && !confirming) removeRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await onRemove();
      if (result.ok) setConfirming(false);
      else
        setError(
          result.code === 'INVALID_PAYLOAD' ? PLAYER_GONE_MESSAGE : actionErrorMessage(result.code),
        );
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <>
        <Button
          ref={removeRef}
          disabled={disabled}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="bg-slate-600 dark:bg-slate-400"
        >
          Remove <span className="sr-only">{name}</span>
        </Button>
        {error && (
          <span role="alert" className="block type-meta text-red-700 dark:text-red-400">
            {error}
          </span>
        )}
      </>
    );
  }

  return (
    <span role="group" aria-label={`Remove ${name}`} className="flex flex-wrap items-center gap-2">
      <span className="type-meta wrap-anywhere">Remove {name} from the session?</span>
      <Button disabled={disabled || pending} onClick={() => void confirm()}>
        {pending ? 'Removing…' : 'Confirm remove'}
      </Button>
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          setConfirming(false);
        }}
        className="bg-slate-600 dark:bg-slate-400"
      >
        Cancel
      </Button>
      {error && (
        <span role="alert" className="block w-full type-meta text-red-700 dark:text-red-400">
          {error}
        </span>
      )}
    </span>
  );
});
RemovePlayerButton.displayName = 'RemovePlayerButton';
