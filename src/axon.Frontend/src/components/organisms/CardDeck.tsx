import { DECK, type Card } from '@axon/shared';
import { memo, useId, useRef, useState, type KeyboardEvent } from 'react';
import { actionErrorMessage } from '../../lib/actionErrors';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';
import { CardFace } from '../atoms/CardFace';

interface CardDeckProps {
  // The server-confirmed vote; the deck never updates it optimistically.
  readonly selected: Card | null;
  readonly disabled: boolean;
  readonly onCast: (card: Card | null) => Promise<ActionResult>;
}

// A card is a native radio, so arrows, Space and the group semantics come from the browser.
export const CardDeck = memo(function CardDeck({ selected, disabled, onCast }: CardDeckProps) {
  const groupName = useId();
  const firstCardRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function cast(card: Card | null): Promise<boolean> {
    setError(null);
    const result = await onCast(card);
    if (!result.ok) setError(actionErrorMessage(result.code));
    return result.ok;
  }

  async function withdraw() {
    if (await cast(null)) firstCardRef.current?.focus();
  }

  function preventEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.preventDefault();
  }

  return (
    <div className="space-y-3">
      <fieldset role="radiogroup" className="min-w-0 space-y-2">
        <legend className="type-section">Your vote</legend>
        <div className="grid grid-cols-5 gap-2 md:grid-cols-10 lg:flex lg:flex-wrap">
          {DECK.map((card, index) => (
            <label key={card} className="relative inline-flex min-h-14 min-w-11 lg:min-h-11">
              <input
                ref={index === 0 ? firstCardRef : undefined}
                type="radio"
                name={groupName}
                value={String(card)}
                checked={selected === card}
                tabIndex={(selected ?? DECK[0]) === card ? 0 : -1}
                disabled={disabled}
                onChange={() => void cast(card)}
                onKeyDown={preventEnter}
                className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span className="flex min-h-14 w-full min-w-11 items-center lg:min-h-11 lg:w-auto justify-center rounded-md border border-slate-500 dark:border-slate-400 px-3 text-lg font-semibold peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white dark:peer-checked:border-slate-100 dark:peer-checked:bg-slate-100 dark:peer-checked:text-slate-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900 dark:peer-focus-visible:outline-slate-100 peer-disabled:opacity-60">
                <CardFace card={card} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="type-meta text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <Button disabled={disabled || selected === null} onClick={() => void withdraw()}>
        Withdraw vote
      </Button>
    </div>
  );
});
CardDeck.displayName = 'CardDeck';
