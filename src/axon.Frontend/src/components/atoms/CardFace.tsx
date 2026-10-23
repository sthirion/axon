import type { Card } from '@axon/shared';
import { MugArt } from '../art/CardArt';

// Digits and sizes as text; coffee is a drawn mug with an accessible name.
export function CardFace({ card }: { readonly card: Card }) {
  if (card === 'coffee') {
    return (
      <>
        <MugArt className="inline-block size-5 align-middle" />
        <span className="sr-only">Coffee break</span>
      </>
    );
  }
  return <>{card}</>;
}
