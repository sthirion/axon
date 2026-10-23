// Every colour class the app uses, as its Tailwind hex value, and the pairs that must meet WCAG AA.
// A test scans the component sources and fails for a colour class that is not listed here, so a
// new colour cannot slip in without its contrast being checked.
export const SHADES = {
  white: '#ffffff',
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-300': '#cbd5e1',
  'slate-400': '#94a3b8',
  'slate-500': '#64748b',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'red-400': '#f87171',
  'red-700': '#b91c1c',
  'green-400': '#4ade80',
  'green-700': '#15803d',
  'green-800': '#166534',
  'blue-300': '#93c5fd',
  'indigo-300': '#a5b4fc',
  'indigo-600': '#4f46e5',
  'blue-800': '#1e40af',
  'amber-50': '#fffbeb',
  'amber-100': '#fef3c7',
  'amber-400': '#fbbf24',
  'amber-600': '#d97706',
  'amber-900': '#78350f',
  'amber-950': '#451a03',
} as const;

export type Shade = keyof typeof SHADES;

export interface ColourPair {
  readonly name: string;
  readonly foreground: Shade;
  readonly background: Shade;
  // 4.5 for text, 3 for large text and for UI boundaries, focus rings and graphics.
  readonly minimum: 4.5 | 3;
}

export interface ThemedPair {
  readonly name: string;
  readonly minimum: 4.5 | 3;
  readonly light: Pick<ColourPair, 'foreground' | 'background'>;
  readonly dark: Pick<ColourPair, 'foreground' | 'background'>;
}

const pair = (
  name: string,
  minimum: 4.5 | 3,
  light: [Shade, Shade],
  dark: [Shade, Shade],
): ThemedPair => ({
  name,
  minimum,
  light: { foreground: light[0], background: light[1] },
  dark: { foreground: dark[0], background: dark[1] },
});

// The page background is white in light and slate-900 in dark (index.css).
export const PAIRS: readonly ThemedPair[] = [
  pair('body text', 4.5, ['slate-900', 'white'], ['slate-100', 'slate-900']),
  pair(
    'muted text (No vote, offline, not voted)',
    4.5,
    ['slate-600', 'white'],
    ['slate-400', 'slate-900'],
  ),
  pair('footer and hint text', 4.5, ['slate-700', 'white'], ['slate-300', 'slate-900']),
  pair('error text', 4.5, ['red-700', 'white'], ['red-400', 'slate-900']),
  pair('success text (online, voted)', 4.5, ['green-800', 'white'], ['green-400', 'slate-900']),
  pair('link text', 4.5, ['blue-800', 'white'], ['blue-300', 'slate-900']),
  pair('outlier marker', 4.5, ['amber-900', 'white'], ['amber-100', 'slate-900']),
  pair('banner text', 4.5, ['amber-900', 'amber-50'], ['amber-100', 'amber-950']),
  pair('primary button', 4.5, ['white', 'slate-900'], ['slate-900', 'slate-100']),
  pair('primary button hover', 4.5, ['white', 'slate-700'], ['slate-900', 'slate-300']),
  pair('secondary button and toggle', 4.5, ['white', 'slate-600'], ['slate-900', 'slate-400']),
  pair('selected card', 4.5, ['white', 'slate-900'], ['slate-900', 'slate-100']),
  pair('join link box text', 4.5, ['slate-900', 'slate-50'], ['slate-100', 'slate-800']),
  pair('input and card border', 3, ['slate-500', 'white'], ['slate-400', 'slate-900']),
  pair('focus indicator', 3, ['slate-900', 'white'], ['slate-100', 'slate-900']),
  pair('selected card border', 3, ['slate-900', 'white'], ['slate-100', 'slate-900']),
  pair('logo accent on the card', 3, ['indigo-600', 'white'], ['indigo-300', 'slate-900']),
  pair('logo outline', 3, ['slate-900', 'white'], ['slate-100', 'slate-900']),
  pair('results bar', 3, ['slate-700', 'white'], ['slate-300', 'slate-900']),
  pair('online dot', 3, ['green-700', 'white'], ['green-400', 'slate-900']),
];

// Decorative or non-interactive colours with no contrast requirement of their own; the same
// information is always also given as text.
export const DECORATIVE_CLASSES: readonly string[] = [
  'bg-slate-400', // offline dot (aria-hidden; the text says "offline")
  'border-slate-300', // border of the non-interactive join link box
  'dark:border-slate-600', // same box in dark
  'border-amber-400', // banner outline; the banner text carries the message
  'dark:border-amber-600',
];

// Every light colour class and the dark class that must sit next to it in the same file.
export const DARK_COUNTERPART: Readonly<Record<string, string>> = {
  'text-red-700': 'dark:text-red-400',
  'text-slate-700': 'dark:text-slate-300',
  'text-slate-600': 'dark:text-slate-400',
  'text-slate-900': 'dark:text-slate-100',
  'text-green-800': 'dark:text-green-400',
  'text-blue-800': 'dark:text-blue-300',
  'text-amber-900': 'dark:text-amber-100',
  'bg-amber-50': 'dark:bg-amber-950',
  'bg-slate-50': 'dark:bg-slate-800',
  'bg-green-700': 'dark:bg-green-400',
  'bg-slate-700': 'dark:bg-slate-300',
  'bg-slate-600': 'dark:bg-slate-400',
  'border-slate-500': 'dark:border-slate-400',
  'fill-white': 'dark:fill-slate-900',
  'stroke-indigo-600': 'dark:stroke-indigo-300',
  'fill-indigo-600': 'dark:fill-indigo-300',
  'focus-visible:outline-slate-900': 'dark:focus-visible:outline-slate-100',
};
