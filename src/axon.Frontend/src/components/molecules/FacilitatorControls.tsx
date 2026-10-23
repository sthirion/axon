import { FINAL_ESTIMATES, type FinalEstimate, type RoundFinishPayload } from '@axon/shared';
import { memo, useId, useState } from 'react';
import { actionErrorMessage, GENERIC_ERROR_MESSAGE } from '../../lib/actionErrors';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';

export const NO_ESTIMATE_OPTION = 'Choose an estimate';

type Action = 'revote' | 'record' | 'skip';

const PENDING_LABEL: Record<Action, string> = {
  revote: 'Starting re-vote…',
  record: 'Recording…',
  skip: 'Skipping…',
};

interface EstimateFormProps {
  readonly suggestedEstimate: number | null;
  readonly busy: boolean;
  readonly recordLabel: string;
  readonly onRecord: (estimate: FinalEstimate) => void;
}

// Mounted only while revealed, so each reveal starts on its own suggestion.
function EstimateForm({ suggestedEstimate, busy, recordLabel, onRecord }: EstimateFormProps) {
  const selectId = useId();
  const [estimate, setEstimate] = useState(
    suggestedEstimate === null ? '' : String(suggestedEstimate),
  );

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={selectId} className="block text-sm font-medium">
          Final estimate
        </label>
        <select
          id={selectId}
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
          className="block min-h-11 w-full max-w-48 rounded-md border border-slate-500 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <option value="">{NO_ESTIMATE_OPTION}</option>
          {FINAL_ESTIMATES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <Button
        disabled={busy || estimate === ''}
        onClick={() => onRecord(Number(estimate) as FinalEstimate)}
      >
        {recordLabel}
      </Button>
    </div>
  );
}

interface FacilitatorControlsProps {
  // Controls that need the reveal (re-vote, final estimate) are shown only while revealed.
  readonly revealed: boolean;
  // The consensus value or closest deck value; the select starts on it.
  readonly suggestedEstimate: number | null;
  readonly disabled: boolean;
  readonly onRevote: () => Promise<ActionResult>;
  readonly onFinish: (payload: RoundFinishPayload) => Promise<ActionResult>;
}

export const FacilitatorControls = memo(function FacilitatorControls({
  revealed,
  suggestedEstimate,
  disabled,
  onRevote,
  onFinish,
}: FacilitatorControlsProps) {
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action, send: () => Promise<ActionResult>) {
    if (pending) return;
    setError(null);
    setPending(action);
    try {
      const result = await send();
      if (!result.ok) setError(actionErrorMessage(result.code));
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  const busy = disabled || pending !== null;
  const label = (action: Action, text: string) =>
    pending === action ? PENDING_LABEL[action] : text;

  return (
    <section aria-label="Round controls" className="space-y-3">
      {revealed && (
        <EstimateForm
          suggestedEstimate={suggestedEstimate}
          busy={busy}
          recordLabel={label('record', 'Record estimate')}
          onRecord={(finalEstimate) => void run('record', () => onFinish({ finalEstimate }))}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {revealed && (
          <Button
            disabled={busy}
            onClick={() => void run('revote', onRevote)}
            className="bg-slate-600"
          >
            {label('revote', 'Re-vote')}
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={() => void run('skip', () => onFinish({ skip: true }))}
          className="bg-slate-600"
        >
          {label('skip', 'Skip story')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
});
FacilitatorControls.displayName = 'FacilitatorControls';
