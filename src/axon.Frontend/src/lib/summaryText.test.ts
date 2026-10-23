import { describe, expect, it } from 'vitest';
import { summaryText } from './summaryText';

describe('summaryText', () => {
  it('lists stories in order with an optional link, an estimate or skipped, and the total', () => {
    expect(
      summaryText(
        [
          { title: 'Login page', url: 'https://e.com/1', estimate: 5 },
          { title: 'Checkout', estimate: 'skipped' },
          { title: 'Search', estimate: 8 },
        ],
        13,
      ),
    ).toBe('1. Login page (https://e.com/1) - 5\n2. Checkout - skipped\n3. Search - 8\nTotal: 13');
  });

  it('is only the total for an empty history', () => {
    expect(summaryText([], 0)).toBe('Total: 0');
  });

  it('copies titles as stored without escaping', () => {
    expect(summaryText([{ title: '<b>x</b> & y', estimate: 0 }], 0)).toBe(
      '1. <b>x</b> & y - 0\nTotal: 0',
    );
  });
});

describe('summaryText for t-shirt sizes', () => {
  it('lists the sizes and leaves the total line out', () => {
    expect(
      summaryText(
        [
          { title: 'Login page', url: 'https://e.com/1', estimate: 'M' },
          { title: 'Checkout', estimate: 'skipped' },
          { title: 'Search', estimate: 'XL' },
        ],
        null,
      ),
    ).toBe('1. Login page (https://e.com/1) - M\n2. Checkout - skipped\n3. Search - XL');
  });

  it('is empty for an empty t-shirt history', () => {
    expect(summaryText([], null)).toBe('');
  });
});
