import { SCALE_DESCRIPTIONS, SCALE_LABELS, SCALES, type Scale } from '@axon/shared';
import { memo, useId } from 'react';

interface ScalePickerProps {
  readonly value: Scale;
  readonly onChange: (scale: Scale) => void;
  readonly disabled?: boolean;
}

// The scale is fixed for the whole session, so it is chosen once, where the session is created.
export const ScalePicker = memo(function ScalePicker({
  value,
  onChange,
  disabled = false,
}: ScalePickerProps) {
  const name = useId();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="type-body font-medium">Voting scale</legend>
      {SCALES.map((scale) => (
        <label
          key={scale}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-slate-500 p-3 dark:border-slate-400"
        >
          <input
            type="radio"
            name={name}
            value={scale}
            checked={value === scale}
            onChange={() => onChange(scale)}
            className="mt-1 size-5 shrink-0 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:accent-indigo-300 dark:focus-visible:outline-slate-100"
          />
          <span className="min-w-0">
            <span className="type-name block">{SCALE_LABELS[scale]}</span>
            <span className="type-meta block text-slate-600 dark:text-slate-400">
              {SCALE_DESCRIPTIONS[scale]}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
});
ScalePicker.displayName = 'ScalePicker';
