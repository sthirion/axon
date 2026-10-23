import type { RoundStats } from '@axon/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { consensusText, NO_AVERAGE_MESSAGE, ResultsPanel } from './ResultsPanel';

const STATS: RoundStats = {
  distribution: [
    { card: 3, count: 1 },
    { card: 5, count: 3 },
    { card: 'coffee', count: 1 },
  ],
  average: 4.6,
  consensus: false,
  outlierIds: [],
  suggestedEstimate: 5,
};

function renderPanel(results: Partial<RoundStats> = {}, outlierNames: string[] = []) {
  return render(<ResultsPanel results={{ ...STATS, ...results }} outlierNames={outlierNames} />);
}

describe('ResultsPanel', () => {
  it('lists each card with its vote count as text, singular and plural', () => {
    renderPanel();

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('31 vote');
    expect(items[1]).toHaveTextContent('53 votes');
    expect(items[2]).toHaveTextContent('Coffee break1 vote');
  });

  it('scales the bars to the highest count and hides them from assistive tech', () => {
    const { container } = renderPanel();

    const bars = [...container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span')];
    expect(bars.map((bar) => bar.style.width)).toEqual([
      '33.33333333333333%',
      '100%',
      '33.33333333333333%',
    ]);
  });

  it('shows the average and no consensus message text', () => {
    renderPanel();

    expect(screen.getByText('Average: 4.6')).toBeVisible();
    expect(screen.getByText('No consensus')).toBeVisible();
    expect(screen.queryByText(/Outliers/)).toBeNull();
  });

  it('shows consensus with the value', () => {
    renderPanel({ distribution: [{ card: 5, count: 2 }], average: 5, consensus: true });

    expect(screen.getByText('Consensus: 5')).toBeVisible();
  });

  it('shows outlier names', () => {
    renderPanel({}, ['Anna', 'Bob']);

    expect(screen.getByText('Outliers: Anna, Bob')).toBeVisible();
  });

  it('shows "No average" and no consensus line when there are no numeric votes', () => {
    renderPanel({
      distribution: [{ card: '?', count: 2 }],
      average: null,
      suggestedEstimate: null,
    });

    expect(screen.getByText(NO_AVERAGE_MESSAGE)).toBeVisible();
    expect(screen.queryByText(/consensus/i)).toBeNull();
    expect(screen.getByRole('list')).toHaveTextContent('?2 votes');
  });
});

describe('consensusText', () => {
  it('is null without numeric votes', () => {
    expect(consensusText({ ...STATS, average: null })).toBeNull();
  });
});
