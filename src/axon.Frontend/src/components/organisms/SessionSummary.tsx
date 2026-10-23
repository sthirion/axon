import type { HistoryEntry } from '@axon/shared';
import { memo, useId, useState } from 'react';
import { summaryText } from '../../lib/summaryText';
import { Button } from '../atoms/Button';

export const EMPTY_SUMMARY_MESSAGE = 'No stories estimated yet.';
export const COPIED_MESSAGE = 'Summary copied';
export const COPY_ERROR_MESSAGE = 'Could not copy. Select the text instead.';

interface SessionSummaryProps {
  readonly history: readonly HistoryEntry[];
  readonly total: number;
}

export const SessionSummary = memo(function SessionSummary({
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
      <h2 id={headingId} className="text-lg font-semibold">
        Summary
      </h2>
      {history.length === 0 ? (
        <p>{EMPTY_SUMMARY_MESSAGE}</p>
      ) : (
        <ol className="space-y-1">
          {history.map((entry, index) => (
            <li key={index} className="flex min-w-0 flex-wrap justify-between gap-x-3">
              <span className="min-w-0 wrap-anywhere">
                <span className="font-medium">{entry.title}</span>
                {entry.url && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-blue-800 dark:text-blue-300 underline wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100"
                  >
                    {entry.url} <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </span>
              <span className="font-semibold">{entry.estimate}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="font-medium">Total: {total}</p>
      <Button disabled={history.length === 0} onClick={() => void copy()}>
        Copy summary
      </Button>
      <p role="status" className="min-h-5 text-sm">
        {current?.ok ? COPIED_MESSAGE : ''}
      </p>
      {current && !current.ok && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {COPY_ERROR_MESSAGE}
        </p>
      )}
    </section>
  );
});
SessionSummary.displayName = 'SessionSummary';
