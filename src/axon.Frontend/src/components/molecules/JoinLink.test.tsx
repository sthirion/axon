import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COPY_FEEDBACK_MS,
  JoinLink,
  LINK_COPIED_MESSAGE,
  LINK_COPY_FAILED_MESSAGE,
} from './JoinLink';

const GAME_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const LINK = `http://localhost/g/${GAME_ID}`;

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('JoinLink', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows no session id, only Copy link and an empty polite status region', () => {
    render(<JoinLink link={LINK} />);

    expect(screen.queryByText(GAME_ID)).toBeNull();
    expect(screen.queryByText(LINK)).toBeNull();
    expect(screen.queryByText(/Session ID/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('writes the link to the clipboard, shows a check mark and announces "Link copied" to screen readers only', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<JoinLink link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(LINK_COPIED_MESSAGE));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);
    expect(screen.getByText(LINK_COPIED_MESSAGE)).toHaveClass('sr-only');
    const check = screen.getByText('✓');
    expect(check).toHaveAttribute('aria-hidden', 'true');
    expect(check).toHaveClass('animate-fade-out');
  });

  it('removes the check mark and the announcement after 5 seconds', async () => {
    vi.useFakeTimers();
    try {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      render(<JoinLink link={LINK} />);

      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS - 1);
      });
      expect(screen.getByText('✓')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(screen.queryByText('✓')).toBeNull();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the five seconds when copying again', async () => {
    vi.useFakeTimers();
    try {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      render(<JoinLink link={LINK} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByText('✓')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the manual-copy fallback when the clipboard write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<JoinLink link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(LINK_COPY_FAILED_MESSAGE),
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
    expect(screen.queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the manual-copy fallback when the clipboard is unavailable', async () => {
    render(<JoinLink link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(LINK_COPY_FAILED_MESSAGE),
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });
});
