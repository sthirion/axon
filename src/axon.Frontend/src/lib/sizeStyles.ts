import { sizeLevel, type Scale, type SizeLevel } from '@axon/shared';

// Every class is written out in full so Tailwind can see it. One ramp, five steps (green to red):
// `chip` is the quiet tint of an unselected card or a chip, `selected` the solid look of a checked
// deck card, `bar` the solid colour of a results bar.
export interface LevelStyle {
  readonly chip: string;
  readonly selected: string;
  readonly bar: string;
}

export const SIZE_STYLES: Readonly<Record<SizeLevel, LevelStyle>> = {
  0: {
    chip: 'border-emerald-700 bg-emerald-100 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100',
    selected:
      'peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:peer-checked:border-emerald-300 dark:peer-checked:bg-emerald-300 dark:peer-checked:text-slate-900',
    bar: 'bg-emerald-700 dark:bg-emerald-300',
  },
  1: {
    chip: 'border-lime-700 bg-lime-100 text-lime-950 dark:border-lime-400 dark:bg-lime-950 dark:text-lime-100',
    selected:
      'peer-checked:border-lime-700 peer-checked:bg-lime-700 peer-checked:text-white dark:peer-checked:border-lime-300 dark:peer-checked:bg-lime-300 dark:peer-checked:text-slate-900',
    bar: 'bg-lime-700 dark:bg-lime-300',
  },
  2: {
    chip: 'border-amber-700 bg-amber-100 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100',
    selected:
      'peer-checked:border-amber-700 peer-checked:bg-amber-700 peer-checked:text-white dark:peer-checked:border-amber-300 dark:peer-checked:bg-amber-300 dark:peer-checked:text-slate-900',
    bar: 'bg-amber-700 dark:bg-amber-300',
  },
  3: {
    chip: 'border-orange-700 bg-orange-100 text-orange-950 dark:border-orange-400 dark:bg-orange-950 dark:text-orange-100',
    selected:
      'peer-checked:border-orange-700 peer-checked:bg-orange-700 peer-checked:text-white dark:peer-checked:border-orange-300 dark:peer-checked:bg-orange-300 dark:peer-checked:text-slate-900',
    bar: 'bg-orange-700 dark:bg-orange-300',
  },
  4: {
    chip: 'border-red-700 bg-red-100 text-red-950 dark:border-red-400 dark:bg-red-950 dark:text-red-100',
    selected:
      'peer-checked:border-red-700 peer-checked:bg-red-700 peer-checked:text-white dark:peer-checked:border-red-300 dark:peer-checked:bg-red-300 dark:peer-checked:text-slate-900',
    bar: 'bg-red-700 dark:bg-red-300',
  },
};

export const SIZE_SEGMENTS = 5;

// The colour look of a sized card, or undefined for `?`, coffee and anything outside the scale.
export function sizeStyle(scale: Scale, card: unknown): LevelStyle | undefined {
  const level = sizeLevel(scale, card);
  return level === null ? undefined : SIZE_STYLES[level];
}
