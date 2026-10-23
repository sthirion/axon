import { memo, useEffect, useRef, useState } from 'react';
import { actionErrorMessage, GENERIC_ERROR_MESSAGE } from '../../lib/actionErrors';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';

export const CANNOT_HAND_OVER_MESSAGE = 'That player can no longer take over. Try someone else.';

interface MakeFacilitatorButtonProps {
  readonly name: string;
  readonly disabled: boolean;
  readonly onHandOver: () => Promise<ActionResult>;
}

// Handing over moves all control to someone else, so it takes a second, explicit click. On success
// the page changes role, so there is nothing to close here.
export const MakeFacilitatorButton = memo(function MakeFacilitatorButton({
  name,
  disabled,
  onHandOver,
}: MakeFacilitatorButtonProps) {
  const openRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Return focus to "Make facilitator" when the confirmation closes without handing over.
  useEffect(() => {
    if (wasConfirming.current && !confirming) openRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function confirm() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await onHandOver();
      if (result.ok) setConfirming(false);
      else
        setError(
          result.code === 'INVALID_PAYLOAD'
            ? CANNOT_HAND_OVER_MESSAGE
            : actionErrorMessage(result.code),
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
          ref={openRef}
          disabled={disabled}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="bg-slate-600 dark:bg-slate-400"
        >
          Make facilitator <span className="sr-only">{name}</span>
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
    <span
      role="group"
      aria-label={`Make ${name} the facilitator`}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="type-meta wrap-anywhere">Make {name} the facilitator?</span>
      <Button disabled={disabled || pending} onClick={() => void confirm()}>
        {pending ? 'Handing over…' : 'Confirm handover'}
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
MakeFacilitatorButton.displayName = 'MakeFacilitatorButton';
