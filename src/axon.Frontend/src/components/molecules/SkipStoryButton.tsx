import { memo, useState } from 'react';
import { actionErrorMessage, GENERIC_ERROR_MESSAGE } from '../../lib/actionErrors';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';

interface SkipStoryButtonProps {
  readonly disabled: boolean;
  readonly onSkip: () => Promise<ActionResult>;
}

// Skips the story while votes are still hidden; shows its own failure under the button.
export const SkipStoryButton = memo(function SkipStoryButton({
  disabled,
  onSkip,
}: SkipStoryButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await onSkip();
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
        disabled={disabled || pending}
        onClick={() => void handleClick()}
        className="bg-slate-600 dark:bg-slate-400"
      >
        {pending ? 'Skipping…' : 'Skip story'}
      </Button>
      {error && (
        <p role="alert" className="type-meta text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});
SkipStoryButton.displayName = 'SkipStoryButton';
