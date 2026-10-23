import type { RoundStats, Scale } from '@axon/shared';
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
  median: 5,
  consensus: false,
  outlierIds: [],
  suggestedEstimate: 5,
};

function renderPanel(
  results: Partial<RoundStats> = {},
  outlierNames: string[] = [],
  scale: Scale = 'fibonacci',
) {
  return render(
    <ResultsPanel scale={scale} results={{ ...STATS, ...results }} outlierNames={outlierNames} />,
  );
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
    renderPanel({
      distribution: [{ card: 5, count: 2 }],
      average: 5,
      median: 5,
      consensus: true,
    });

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
      median: null,
      suggestedEstimate: null,
    });

    expect(screen.getByText(NO_AVERAGE_MESSAGE)).toBeVisible();
    expect(screen.queryByText(/consensus/i)).toBeNull();
    expect(screen.getByRole('list')).toHaveTextContent('?2 votes');
  });
});

describe('consensusText', () => {
  it('is null without numeric votes', () => {
    expect(consensusText({ ...STATS, average: null, median: null })).toBeNull();
  });
});

describe('ResultsPanel for t-shirt sizes', () => {
  const SIZES: Partial<RoundStats> = {
    distribution: [
      { card: 'S', count: 1 },
      { card: 'M', count: 2 },
      { card: 'coffee', count: 1 },
    ],
    average: null,
    median: 'M',
    suggestedEstimate: 'M',
  };

  it('shows the median size and never an average', () => {
    renderPanel(SIZES, [], 'tshirt');

    expect(screen.getByText('Median: M')).toBeVisible();
    expect(screen.queryByText(/Average|No average/)).toBeNull();
    expect(screen.getByText('No consensus')).toBeVisible();
  });

  it('lists the sizes in the given order with their counts', () => {
    renderPanel(SIZES, [], 'tshirt');

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('S1 vote');
    expect(items[1]).toHaveTextContent('M2 votes');
  });

  it('shows consensus with the size', () => {
    renderPanel(
      {
        ...SIZES,
        distribution: [{ card: 'L', count: 3 }],
        median: 'L',
        suggestedEstimate: 'L',
        consensus: true,
      },
      [],
      'tshirt',
    );

    expect(screen.getByText('Consensus: L')).toBeVisible();
  });

  it('shows "No median" and no consensus line when only ? and coffee were voted', () => {
    renderPanel(
      {
        distribution: [{ card: '?', count: 2 }],
        average: null,
        median: null,
        suggestedEstimate: null,
      },
      [],
      'tshirt',
    );

    expect(screen.getByText('No median')).toBeVisible();
    expect(screen.queryByText(/consensus/i)).toBeNull();
  });

  it('names the outlier voters', () => {
    renderPanel(SIZES, ['Anna', 'Bob'], 'tshirt');

    expect(screen.getByText('Outliers: Anna, Bob')).toBeVisible();
  });
});

describe('ResultsPanel and the too-large flag', () => {
  it('says "Too large" next to the cards at or above the threshold, and only those', () => {
    renderPanel(
      {
        distribution: [
          { card: 5, count: 1 },
          { card: 8, count: 1 },
          { card: 13, count: 2 },
          { card: 21, count: 1 },
          { card: '?', count: 1 },
        ],
      },
      [],
      'fibonacci',
    );

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent?.includes('Too large'))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });

  it.each([
    ['incremental', 7, false],
    ['incremental', 8, true],
    ['tshirt', 'M', false],
    ['tshirt', 'L', true],
  ] as const)('flags %s %s: %s', (scale, card, flagged) => {
    renderPanel(
      { distribution: [{ card, count: 1 }], median: card, suggestedEstimate: card },
      [],
      scale,
    );

    expect(screen.queryByText('Too large', { exact: false }) !== null).toBe(flagged);
  });
});
