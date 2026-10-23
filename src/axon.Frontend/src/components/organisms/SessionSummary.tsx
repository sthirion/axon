import { isTooLarge, type HistoryEntry, type Scale } from '@axon/shared';
import { memo, useId, useState } from 'react';
import { sizeStyle } from '../../lib/sizeStyles';
import { summaryText } from '../../lib/summaryText';
import { Button } from '../atoms/Button';
import { StoryTitle } from '../atoms/StoryTitle';

export const EMPTY_SUMMARY_MESSAGE = 'No stories estimated yet.';
export const COPIED_MESSAGE = 'Summary copied';
export const COPY_ERROR_MESSAGE = 'Could not copy. Select the text instead.';

interface SessionSummaryProps {
  readonly scale: Scale;
  readonly history: readonly HistoryEntry[];
  // `null` for t-shirt sizes, which cannot be added up.
  readonly total: number | null;
}

export const SessionSummary = memo(function SessionSummary({
  scale,
  history,
  total,
}: SessionSummaryProps) {
  const headingId = useId();
  const [status, setStatus] = useState<{ ok: boolean; count: number } | null>(null);

  // A result describes the text that was copied; it goes away once a story is added.
  const current = status?.count === history.length ? status : null;

  async function copy() {
    setStatus(null);
    try {
      await navigator.clipboard.writeText(summaryText(history, total));
      setStatus({ ok: true, count: history.length });
    } catch {
      setStatus({ ok: false, count: history.length });
    }
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <h2 id={headingId} className="type-section">
        Summary
      </h2>
      {history.length === 0 ? (
        <p>{EMPTY_SUMMARY_MESSAGE}</p>
      ) : (
        <ol className="space-y-1">
          {history.map((entry, index) => (
            <li key={index} className="flex min-w-0 flex-wrap justify-between gap-x-3">
              <span className="min-w-0">
                <StoryTitle title={entry.title} url={entry.url} />
              </span>
              <span className="flex items-baseline gap-2">
                {isTooLarge(scale, entry.estimate) && (
                  <span className="type-meta font-medium text-red-700 dark:text-red-400">
                    <span aria-hidden="true">⚠ </span>Too large
                  </span>
                )}
                <span
                  className={`rounded border px-2 font-semibold ${
                    sizeStyle(scale, entry.estimate)?.chip ?? 'border-transparent'
                  }`}
                >
                  {entry.estimate}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {total !== null && <p className="font-medium">Total: {total}</p>}
      <Button disabled={history.length === 0} onClick={() => void copy()}>
        Copy summary
      </Button>
      <p role="status" className="min-h-5 type-meta">
        {current?.ok ? COPIED_MESSAGE : ''}
      </p>
      {current && !current.ok && (
        <p role="alert" className="type-meta text-red-700 dark:text-red-400">
          {COPY_ERROR_MESSAGE}
        </p>
      )}
    </section>
  );
});
SessionSummary.displayName = 'SessionSummary';
