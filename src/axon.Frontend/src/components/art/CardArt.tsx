import { sizeLevel, type Card, type Scale } from '@axon/shared';
import { useId, type ReactNode } from 'react';

// Original developer pictures, drawn with the current text colour so they follow the card colours.
// Everything here is decorative: the card value is the text.
function Svg({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

type ArtProps = { readonly className?: string };

// Level 0: a terminal window with a prompt.
export const TerminalArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <rect x="6" y="9" width="36" height="30" rx="3" />
    <path d="M6 17 H42" />
    <path d="M13 24 L19 28 L13 32" />
    <path d="M24 33 H33" />
  </Svg>
);

// Level 1: a laptop.
export const LaptopArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <rect x="10" y="11" width="28" height="20" rx="2" />
    <path d="M5 36 H43 L40 39 H8 Z" />
    <path d="M20 34 H28" />
  </Svg>
);

// Level 2: a server rack with lights.
export const ServerArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <rect x="9" y="8" width="30" height="9" rx="1.5" />
    <rect x="9" y="19" width="30" height="9" rx="1.5" />
    <rect x="9" y="30" width="30" height="9" rx="1.5" />
    <circle cx="14" cy="12.5" r="1" fill="currentColor" />
    <circle cx="14" cy="23.5" r="1" fill="currentColor" />
    <circle cx="14" cy="34.5" r="1" fill="currentColor" />
    <path d="M22 12.5 H34 M22 23.5 H34 M22 34.5 H34" />
  </Svg>
);

// Level 3: a bug.
export const BugArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <ellipse cx="24" cy="29" rx="8" ry="11" />
    <circle cx="24" cy="14" r="5" />
    <path d="M24 18 V40" />
    <path d="M16 25 L8 22 M16 31 L8 33 M16 37 L10 42" />
    <path d="M32 25 L40 22 M32 31 L40 33 M32 37 L38 42" />
    <path d="M21 10 L17 5 M27 10 L31 5" />
  </Svg>
);

// Level 4: a server on fire.
export const FireArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <rect x="9" y="30" width="30" height="9" rx="1.5" />
    <circle cx="14" cy="34.5" r="1" fill="currentColor" />
    <path
      d="M24 5 C27 12 33 14 31 21 C30 26 27 28 24 28 C20 28 17 25 18 20 C19 17 21 16 21 12 C23 13 24 10 24 5 Z"
      fill="currentColor"
    />
  </Svg>
);

// `?`: a speech bubble with a question mark.
export const QuestionArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d="M8 10 H40 V32 H26 L18 40 V32 H8 Z" />
    <path d="M20 19 C20 14 28 14 28 19 C28 23 24 22 24 26" />
    <circle cx="24" cy="29" r="0.5" fill="currentColor" />
  </Svg>
);

// Coffee: a mug with steam (this replaces the emoji).
export const MugArt = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d="M10 19 H32 V31 A7 7 0 0 1 25 38 H17 A7 7 0 0 1 10 31 Z" />
    <path d="M32 22 H35 A4 4 0 0 1 35 30 H32" />
    <path d="M16 14 C13 11 19 10 16 6 M24 14 C21 11 27 10 24 6" />
  </Svg>
);

const BY_LEVEL = [TerminalArt, LaptopArt, ServerArt, BugArt, FireArt] as const;

// The picture of a card: by size level for sized cards, one each for `?` and coffee.
export function CardArt({
  scale,
  card,
  className,
}: {
  readonly scale: Scale;
  readonly card: Card;
  readonly className?: string;
}) {
  if (card === 'coffee') return <MugArt className={className} />;
  if (card === '?') return <QuestionArt className={className} />;
  const level = sizeLevel(scale, card);
  if (level === null) return null;
  const Art = BY_LEVEL[level];
  return <Art className={className} />;
}

// The back of a card: a pattern of code marks on circuit lines, in indigo.
export function CardBack({ className }: { readonly className?: string }) {
  const patternId = useId(); // one id per back: they would clash on a page with several
  return (
    <svg
      viewBox="0 0 32 45"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <defs>
        <pattern id={patternId} width="16" height="15" patternUnits="userSpaceOnUse">
          <path
            d="M3 3 L1 5 L3 7 M7 3 L9 5 L7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M11 4 L13 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path d="M2 11 H8 M8 11 V13" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <circle cx="8" cy="13" r="0.9" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="32" height="45" fill={`url(#${patternId})`} />
    </svg>
  );
}
