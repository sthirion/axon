import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinLink, LINK_COPIED_MESSAGE, LINK_COPY_FAILED_MESSAGE } from './JoinLink';

const GAME_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const LINK = `http://localhost/g/${GAME_ID}`;

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('JoinLink', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows only the session id as selectable text, not the whole link, and an empty polite status region', () => {
    render(<JoinLink gameId={GAME_ID} link={LINK} />);

    expect(screen.getByText(GAME_ID)).toBeVisible();
    expect(screen.queryByText(LINK)).toBeNull();
    expect(screen.getByText(/Session ID/)).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('writes the link to the clipboard and announces "Link copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<JoinLink gameId={GAME_ID} link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(LINK_COPIED_MESSAGE));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);
  });

  it('shows the manual-copy fallback when the clipboard write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<JoinLink gameId={GAME_ID} link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(LINK_COPY_FAILED_MESSAGE),
    );
    expect(screen.getByText(GAME_ID)).toBeVisible();
    expect(screen.queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the manual-copy fallback when the clipboard is unavailable', async () => {
    render(<JoinLink gameId={GAME_ID} link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(LINK_COPY_FAILED_MESSAGE),
    );
    expect(screen.getByText(GAME_ID)).toBeVisible();
  });
});
