import type { Card } from '@axon/shared';

// Digits as text; coffee is a glyph with an accessible name.
export function CardFace({ card }: { readonly card: Card }) {
  if (card === 'coffee') {
    return (
      <>
        <span aria-hidden="true">☕</span>
        <span className="sr-only">Coffee break</span>
      </>
    );
  }
  return <>{card}</>;
}
