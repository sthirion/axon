import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../../types/game.types';
import { RemovePlayerButton } from './RemovePlayerButton';

const OK = () => Promise.resolve({ ok: true } as ActionResult);

function renderButton(onRemove: () => Promise<ActionResult> = OK, disabled = false) {
  return render(<RemovePlayerButton name="Anna" disabled={disabled} onRemove={onRemove} />);
}

describe('RemovePlayerButton', () => {
  it('names the voter and sends nothing on the first click', async () => {
    const onRemove = vi.fn(OK);
    renderButton(onRemove);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Remove Anna' })).toBeVisible();
    expect(screen.getByText('Remove Anna from the session?')).toBeVisible();
  });

  it('removes only after "Confirm remove"', async () => {
    const onRemove = vi.fn(OK);
    renderButton(onRemove);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
  });

  it('cancels without sending anything and returns focus to Remove', async () => {
    const onRemove = vi.fn(OK);
    renderButton(onRemove);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Anna' })).toHaveFocus();
  });

  it('shows "Removing…" and ignores a second click while pending', async () => {
    let settle: (result: ActionResult) => void = () => undefined;
    const onRemove = vi.fn(() => new Promise<ActionResult>((resolve) => (settle = resolve)));
    renderButton(onRemove);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));

    const pending = screen.getByRole('button', { name: 'Removing…' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.click(pending);
    expect(onRemove).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
  });

  it.each([
    ['FORBIDDEN', 'You are not allowed to do that.'],
    ['INVALID_PAYLOAD', 'That player is no longer in the session.'],
    ['TIMEOUT', 'Something went wrong. Try again.'],
  ])('shows the fixed message for %s and allows another attempt', async (code, text) => {
    renderButton(() => Promise.resolve({ ok: false, code }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeEnabled();
  });

  it('shows the generic message and recovers when the request rejects', async () => {
    renderButton(() => Promise.reject(new Error('socket closed')));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeEnabled();
  });

  it('does not show a stale error after Cancel', async () => {
    renderButton(() => Promise.resolve({ ok: false, code: 'FORBIDDEN' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is disabled while reconnecting', () => {
    renderButton(OK, true);

    expect(screen.getByRole('button', { name: 'Remove Anna' })).toBeDisabled();
  });
});
