import { Link } from 'react-router';
import { LOGO_LINK_LABEL } from '../../lib/brand';

// Two playing cards, the front one carrying a code-bracket glyph. Original artwork; the outline uses
// currentColor and one indigo accent, so it works in both themes. Decorative inside the link.
export function Logo() {
  return (
    <Link
      to="/"
      aria-label={LOGO_LINK_LABEL}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:size-12 dark:text-slate-100 dark:focus-visible:outline-slate-100"
    >
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="size-full">
        <rect
          x="7"
          y="9"
          width="24"
          height="32"
          rx="4"
          transform="rotate(-12 19 25)"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <g transform="rotate(8 30 25)">
          <rect
            x="17"
            y="8"
            width="25"
            height="33"
            rx="4"
            strokeWidth="2.5"
            stroke="currentColor"
            className="fill-white dark:fill-slate-900"
          />
          <g
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-indigo-600 dark:stroke-indigo-300"
          >
            <path d="M26 21 L22 26 L26 31" />
            <path d="M33 21 L37 26 L33 31" />
            <path d="M31 19 L28 33" />
          </g>
          <circle cx="22" cy="14" r="1.8" className="fill-indigo-600 dark:fill-indigo-300" />
        </g>
      </svg>
    </Link>
  );
}
