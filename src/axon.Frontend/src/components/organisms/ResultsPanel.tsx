import { isTooLarge, type RoundStats, type Scale } from '@axon/shared';
import { memo, useId } from 'react';
import { sizeStyle } from '../../lib/sizeStyles';
import { CardFace } from '../atoms/CardFace';
import { Panel } from '../atoms/Panel';

export const NO_AVERAGE_MESSAGE = 'No average';
export const NO_MEDIAN_MESSAGE = 'No median';

interface ResultsPanelProps {
  readonly scale: Scale;
  readonly results: RoundStats;
  // Names of the outlier voters, in vote order.
  readonly outlierNames: readonly string[];
}

// The consensus value is the proposed card (a number or a size); without sized votes there is none.
export function consensusText(results: RoundStats): string | null {
  if (results.consensus) return `Consensus: ${results.suggestedEstimate}`;
  return results.median === null ? null : 'No consensus';
}

// Numbers have an average; sizes only have a middle one.
export function centreText(results: RoundStats, scale: Scale): string {
  if (scale === 'tshirt') {
    return results.median === null ? NO_MEDIAN_MESSAGE : `Median: ${results.median}`;
  }
  return results.average === null ? NO_AVERAGE_MESSAGE : `Average: ${results.average}`;
}

function voteCount(count: number): string {
  return `${count} ${count === 1 ? 'vote' : 'votes'}`;
}

export const ResultsPanel = memo(function ResultsPanel({
  scale,
  results,
  outlierNames,
}: ResultsPanelProps) {
  const headingId = useId();
  const max = Math.max(1, ...results.distribution.map((entry) => entry.count));
  const consensus = consensusText(results);

  return (
    <Panel aria-labelledby={headingId}>
      <h2 id={headingId} className="type-section">
        Results
      </h2>
      <ul className="space-y-1">
        {results.distribution.map(({ card, count }) => (
          <li key={card} className="flex flex-wrap items-center gap-x-3">
            <span className="w-8 shrink-0 text-right font-semibold">
              <CardFace card={card} />
            </span>
            <span className="w-5 shrink-0 text-center font-bold text-green-800 dark:text-green-400">
              {card === results.suggestedEstimate && (
                <>
                  <span aria-hidden="true">✓</span>
                  <span className="sr-only">Recommended</span>
                </>
              )}
            </span>
            <span aria-hidden="true" className="h-4 min-w-0 flex-1">
              <span
                className={`block h-full rounded ${
                  sizeStyle(scale, card)?.bar ?? 'bg-slate-700 dark:bg-slate-300'
                }`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="shrink-0 type-meta">{voteCount(count)}</span>
            {isTooLarge(scale, card) && (
              <span className="basis-full pl-11 type-meta font-medium text-red-700 dark:text-red-400">
                <span aria-hidden="true">⚠ </span>Too large
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="font-medium">{centreText(results, scale)}</p>
      {consensus && <p className="font-medium">{consensus}</p>}
      {outlierNames.length > 0 && <p>Outliers: {outlierNames.join(', ')}</p>}
    </Panel>
  );
});
ResultsPanel.displayName = 'ResultsPanel';
