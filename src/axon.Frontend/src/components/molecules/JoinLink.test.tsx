import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinLink, LINK_COPIED_MESSAGE, LINK_COPY_FAILED_MESSAGE } from './JoinLink';

const LINK = 'http://localhost/g/AAAAAAAAAAAAAAAAAAAAAA';

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('JoinLink', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows the link as selectable text and an empty polite status region', () => {
    render(<JoinLink link={LINK} />);

    expect(screen.getByText(LINK)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('writes the link to the clipboard and announces "Link copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<JoinLink link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(LINK_COPIED_MESSAGE));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);
  });

  it('shows the manual-copy fallback when the clipboard write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<JoinLink link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(LINK_COPY_FAILED_MESSAGE));
    expect(screen.getByText(LINK)).toBeVisible();
    expect(screen.queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the manual-copy fallback when the clipboard is unavailable', async () => {
    render(<JoinLink link={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(LINK_COPY_FAILED_MESSAGE));
    expect(screen.getByText(LINK)).toBeVisible();
  });
});
