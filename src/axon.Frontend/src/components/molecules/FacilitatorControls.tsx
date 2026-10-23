import {
  estimateCardsOf,
  isTooLarge,
  type EstimateCard,
  type RoundFinishPayload,
  type Scale,
} from '@axon/shared';
import { memo, useId, useState, type ReactNode } from 'react';
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
  readonly scale: Scale;
  readonly suggestedEstimate: EstimateCard | null;
  readonly busy: boolean;
  readonly recordLabel: string;
  readonly onRecord: (estimate: EstimateCard) => void;
  // Shown after "Record estimate", in the same row.
  readonly children?: ReactNode;
}

// Mounted only while revealed, so each reveal starts on its own suggestion.
function EstimateForm({
  scale,
  suggestedEstimate,
  busy,
  recordLabel,
  onRecord,
  children,
}: EstimateFormProps) {
  const cards = estimateCardsOf(scale);
  const selectId = useId();
  const [estimate, setEstimate] = useState(
    suggestedEstimate === null ? '' : String(suggestedEstimate),
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor={selectId} className="block type-body font-medium">
            Final estimate
          </label>
          <select
            id={selectId}
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            className="block min-h-11 w-full max-w-48 rounded-md border border-slate-500 dark:border-slate-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100"
          >
            <option value="">{NO_ESTIMATE_OPTION}</option>
            {cards.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <Button
          disabled={busy || estimate === ''}
          onClick={() => {
            // The option value is text; send the card itself (a number or a size).
            const card = cards.find((candidate) => String(candidate) === estimate);
            if (card !== undefined) onRecord(card);
          }}
        >
          {recordLabel}
        </Button>
        {children}
      </div>
      <p role="status" className="type-meta min-h-5 font-medium text-red-700 dark:text-red-400">
        {isTooLarge(
          scale,
          cards.find((card) => String(card) === estimate),
        )
          ? 'Too large: consider splitting this story.'
          : ''}
      </p>
    </div>
  );
}

interface FacilitatorControlsProps {
  // Controls that need the reveal (re-vote, final estimate) are shown only while revealed.
  readonly revealed: boolean;
  readonly scale: Scale;
  // The consensus card or the proposal of the scale; the select starts on it.
  readonly suggestedEstimate: EstimateCard | null;
  readonly disabled: boolean;
  readonly onRevote: () => Promise<ActionResult>;
  readonly onFinish: (payload: RoundFinishPayload) => Promise<ActionResult>;
}

export const FacilitatorControls = memo(function FacilitatorControls({
  revealed,
  scale,
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

  const revote = revealed && (
    <Button
      disabled={busy}
      onClick={() => void run('revote', onRevote)}
      className="bg-slate-600 dark:bg-slate-400"
    >
      {label('revote', 'Re-vote')}
    </Button>
  );
  const skip = (
    <Button
      disabled={busy}
      onClick={() => void run('skip', () => onFinish({ skip: true }))}
      className="bg-slate-600 dark:bg-slate-400"
    >
      {label('skip', 'Skip story')}
    </Button>
  );

  return (
    <div className="space-y-3">
      {revealed ? (
        <EstimateForm
          scale={scale}
          suggestedEstimate={suggestedEstimate}
          busy={busy}
          recordLabel={label('record', 'Record estimate')}
          onRecord={(finalEstimate) => void run('record', () => onFinish({ finalEstimate }))}
        >
          {revote}
          {skip}
        </EstimateForm>
      ) : (
        <div className="flex flex-wrap gap-2">{skip}</div>
      )}
      {error && (
        <p role="alert" className="type-meta text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});
FacilitatorControls.displayName = 'FacilitatorControls';
