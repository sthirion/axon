import { deckOf, isTooLarge, sizeLevel, type Card, type Scale } from '@axon/shared';
import { memo, useId, useRef, useState, type KeyboardEvent } from 'react';
import { actionErrorMessage } from '../../lib/actionErrors';
import { SIZE_STYLES } from '../../lib/sizeStyles';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';
import { CardFace } from '../atoms/CardFace';
import { SizeBar } from '../atoms/SizeBar';

interface CardDeckProps {
  // The session's scale decides which cards are in the deck.
  readonly scale: Scale;
  // The server-confirmed vote; the deck never updates it optimistically.
  readonly selected: Card | null;
  readonly disabled: boolean;
  readonly onCast: (card: Card | null) => Promise<ActionResult>;
}

// A card is a native radio, so arrows, Space and the group semantics come from the browser.
export const CardDeck = memo(function CardDeck({
  scale,
  selected,
  disabled,
  onCast,
}: CardDeckProps) {
  const deck = deckOf(scale);
  const tooLargeId = `${useId()}-too-large`;
  const hasTooLarge = deck.some((card) => isTooLarge(scale, card));
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
        <div className="grid grid-cols-5 gap-2 md:flex md:flex-wrap">
          {deck.map((card, index) => {
            const level = sizeLevel(scale, card);
            const tooLarge = isTooLarge(scale, card);
            const neutral =
              'border-slate-500 dark:border-slate-400 peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white dark:peer-checked:border-slate-100 dark:peer-checked:bg-slate-100 dark:peer-checked:text-slate-900';
            const look =
              level === null
                ? neutral
                : `${SIZE_STYLES[level].chip} ${SIZE_STYLES[level].selected}`;
            return (
              <label
                key={card}
                className="relative inline-flex min-h-14 min-w-11 md:min-h-11 md:w-14"
              >
                <input
                  ref={index === 0 ? firstCardRef : undefined}
                  type="radio"
                  name={groupName}
                  value={String(card)}
                  checked={selected === card}
                  tabIndex={(selected ?? deck[0]) === card ? 0 : -1}
                  disabled={disabled}
                  aria-describedby={tooLarge ? tooLargeId : undefined}
                  onChange={() => void cast(card)}
                  onKeyDown={preventEnter}
                  className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <span
                  className={`flex min-h-14 w-full min-w-11 items-center justify-center rounded-md border px-3 pb-2 text-lg font-semibold md:min-h-11 ${look} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900 dark:peer-focus-visible:outline-slate-100 peer-disabled:opacity-60`}
                >
                  <CardFace card={card} />
                  {tooLarge && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 right-1 type-meta leading-none"
                    >
                      ⚠
                    </span>
                  )}
                  {level !== null && <SizeBar level={level} />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {hasTooLarge && (
        <>
          <span id={tooLargeId} className="sr-only">
            Too large: consider splitting this story
          </span>
          <p className="type-meta text-slate-700 dark:text-slate-300">
            <span aria-hidden="true">⚠ </span>Too large to take as one story
          </p>
        </>
      )}
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
