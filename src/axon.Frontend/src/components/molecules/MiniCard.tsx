import { isTooLarge, type Card, type Scale } from '@axon/shared';
import { useState } from 'react';
import { sizeStyle } from '../../lib/sizeStyles';
import { CardBack } from '../art/CardArt';
import { CardFace } from '../atoms/CardFace';

interface MiniCardProps {
  readonly variant: 'back' | 'slot' | 'face';
  readonly card?: Card;
  readonly scale?: Scale;
  // True once the page is showing: a card that appears now is animated, the first paint is not.
  readonly animate?: boolean;
  // Position in the list, to stagger the flip.
  readonly order?: number;
}

const BOX = 'inline-flex h-[45px] w-8 shrink-0 items-center justify-center rounded border';

// A small card for another player: a back once they voted, an empty slot until then, the face after
// the reveal. The back and the slot are decorative; the face carries the value as text.
export function MiniCard({ variant, card, scale, animate = false, order = 0 }: MiniCardProps) {
  // Decided once, when this card appears: a card that was already there on the first paint never
  // animates later, and a card that appears during the session animates once.
  const [play] = useState(animate);
  if (variant === 'slot') {
    return (
      <span
        aria-hidden="true"
        className={`${BOX} border-dashed border-slate-500 dark:border-slate-400`}
      />
    );
  }
  if (variant === 'back') {
    return (
      <span
        aria-hidden="true"
        className={`${BOX} overflow-hidden border-indigo-700 bg-indigo-700 text-indigo-100 dark:border-indigo-300 dark:bg-indigo-300 dark:text-indigo-950 ${play ? 'animate-deal' : ''}`}
      >
        <CardBack className="size-full" />
      </span>
    );
  }
  if (card === undefined) return null;
  const look =
    (scale !== undefined && sizeStyle(scale, card)?.chip) ||
    'border-slate-500 bg-white text-slate-900 dark:border-slate-400 dark:bg-slate-900 dark:text-slate-100';
  const tooLarge = scale !== undefined && isTooLarge(scale, card);
  return (
    <span
      className={`${BOX} flex-col font-semibold ${look} ${play ? 'animate-flip' : ''}`}
      style={{ '--delay': `${Math.min(order, 8) * 80}ms` } as React.CSSProperties}
    >
      <span className="sr-only">Vote: </span>
      <CardFace card={card} />
      {tooLarge && (
        <>
          <span aria-hidden="true" className="type-meta leading-none">
            ⚠
          </span>
          <span className="sr-only"> (too large)</span>
        </>
      )}
    </span>
  );
}
