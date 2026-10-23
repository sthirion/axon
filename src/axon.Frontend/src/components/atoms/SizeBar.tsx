import { SIZE_SEGMENTS } from '../../lib/sizeStyles';

interface SizeBarProps {
  // 0 (smallest) to 4 (largest): `level + 1` of the five segments are filled.
  readonly level: number;
}

// Shows the size without colour, so the ramp is readable without colour vision. Decorative: the
// value is always shown as text. It uses the current text colour, so it follows selected cards.
export function SizeBar({ level }: SizeBarProps) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-1.5 bottom-1 flex gap-0.5"
    >
      {Array.from({ length: SIZE_SEGMENTS }, (_, index) => (
        <span
          key={index}
          data-filled={index <= level}
          className={`h-1 flex-1 rounded-full border border-current ${index <= level ? 'bg-current' : ''}`}
        />
      ))}
    </span>
  );
}
