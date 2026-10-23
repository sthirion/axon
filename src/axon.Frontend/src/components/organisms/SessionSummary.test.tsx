import type { HistoryEntry } from '@axon/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COPIED_MESSAGE,
  COPY_ERROR_MESSAGE,
  EMPTY_SUMMARY_MESSAGE,
  SessionSummary,
} from './SessionSummary';

const HISTORY: HistoryEntry[] = [
  { title: 'Login page', url: 'https://e.com/1', estimate: 5 },
  { title: '<img src=x onerror=alert(1)>', estimate: 'skipped' },
];

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionSummary', () => {
  it('shows the empty message, a total of 0 and a disabled copy button', () => {
    render(<SessionSummary history={[]} total={0} />);

    expect(screen.getByText(EMPTY_SUMMARY_MESSAGE)).toBeVisible();
    expect(screen.getByText('Total: 0')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy summary' })).toBeDisabled();
  });

  it('lists the stories in order with estimate or skipped and the total', () => {
    render(<SessionSummary history={HISTORY} total={5} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Login page');
    expect(items[0]).toHaveTextContent('5');
    expect(items[1]).toHaveTextContent('skipped');
    expect(screen.getByText('Total: 5')).toBeVisible();
  });

  it('opens a link safely in a new tab and shows a title as text only', () => {
    const { container } = render(<SessionSummary history={HISTORY} total={5} />);

    const link = screen.getByRole('link', { name: /^Login page.*\(opens in a new tab\)$/ });
    expect(link).toHaveAttribute('href', 'https://e.com/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText(/e\.com/)).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });

  it('copies the plain text and announces it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<SessionSummary history={HISTORY} total={5} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy summary' }));

    expect(writeText).toHaveBeenCalledWith(
      '1. Login page (https://e.com/1) - 5\n2. <img src=x onerror=alert(1)> - skipped\nTotal: 5',
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPIED_MESSAGE));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an alert when the clipboard is unavailable', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<SessionSummary history={HISTORY} total={5} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy summary' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(COPY_ERROR_MESSAGE);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('forgets the copied message once a story is added', async () => {
    stubClipboard(() => Promise.resolve());
    const { rerender } = render(<SessionSummary history={HISTORY} total={5} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPIED_MESSAGE));

    rerender(<SessionSummary history={[...HISTORY, { title: 'Next', estimate: 3 }]} total={8} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('SessionSummary for t-shirt sizes', () => {
  const SIZES: HistoryEntry[] = [
    { title: 'Login page', estimate: 'M' },
    { title: 'Checkout', estimate: 'skipped' },
  ];

  it('shows the sizes and no total', () => {
    render(<SessionSummary history={SIZES} total={null} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Login pageM');
    expect(items[1]).toHaveTextContent('Checkoutskipped');
    expect(screen.queryByText(/Total/)).toBeNull();
  });

  it('shows no total and the empty message for an empty t-shirt history', () => {
    render(<SessionSummary history={[]} total={null} />);

    expect(screen.getByText(EMPTY_SUMMARY_MESSAGE)).toBeVisible();
    expect(screen.queryByText(/Total/)).toBeNull();
  });

  it('copies the sizes without a total line', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<SessionSummary history={SIZES} total={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy summary' }));

    expect(writeText).toHaveBeenCalledWith('1. Login page - M\n2. Checkout - skipped');
  });

  it('still shows a total of 0 for a numeric session', () => {
    render(<SessionSummary history={[]} total={0} />);

    expect(screen.getByText('Total: 0')).toBeVisible();
  });
});

describe('SessionSummary for link-only stories', () => {
  it('shows the link as the clickable text and no title', () => {
    render(
      <SessionSummary history={[{ title: '', url: 'https://e.com/1', estimate: 5 }]} total={5} />,
    );

    const link = screen.getByRole('link', { name: 'https://e.com/1 (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://e.com/1');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('copies the link once in place of the title', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(
      <SessionSummary history={[{ title: '', url: 'https://e.com/1', estimate: 5 }]} total={5} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy summary' }));

    expect(writeText).toHaveBeenCalledWith('1. https://e.com/1 - 5\nTotal: 5');
  });
});
