import type { RoundStats } from '@axon/shared';
import { memo, useId } from 'react';
import { CardFace } from '../atoms/CardFace';

export const NO_AVERAGE_MESSAGE = 'No average';

interface ResultsPanelProps {
  readonly results: RoundStats;
  // Names of the outlier voters, in vote order.
  readonly outlierNames: readonly string[];
}

export function consensusText(results: RoundStats): string | null {
  if (results.consensus) return `Consensus: ${results.average}`;
  return results.average === null ? null : 'No consensus';
}

function voteCount(count: number): string {
  return `${count} ${count === 1 ? 'vote' : 'votes'}`;
}

export const ResultsPanel = memo(function ResultsPanel({
  results,
  outlierNames,
}: ResultsPanelProps) {
  const headingId = useId();
  const max = Math.max(1, ...results.distribution.map((entry) => entry.count));
  const consensus = consensusText(results);

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3">
      <h2 id={headingId} className="text-lg font-semibold">
        Results
      </h2>
      <ul className="space-y-1">
        {results.distribution.map(({ card, count }) => (
          <li key={card} className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-right font-semibold">
              <CardFace card={card} />
            </span>
            <span aria-hidden="true" className="h-4 min-w-0 flex-1">
              <span
                className="block h-full rounded bg-slate-700"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="shrink-0 text-sm">{voteCount(count)}</span>
          </li>
        ))}
      </ul>
      <p className="font-medium">
        {results.average === null ? NO_AVERAGE_MESSAGE : `Average: ${results.average}`}
      </p>
      {consensus && <p className="font-medium">{consensus}</p>}
      {outlierNames.length > 0 && <p>Outliers: {outlierNames.join(', ')}</p>}
    </section>
  );
});
ResultsPanel.displayName = 'ResultsPanel';
