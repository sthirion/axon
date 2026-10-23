import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../../types/game.types';
import { RevealButton } from './RevealButton';

function renderButton(
  onReveal: () => Promise<ActionResult>,
  props: { hasVotes?: boolean; disabled?: boolean } = {},
) {
  return render(<RevealButton hasVotes disabled={false} onReveal={onReveal} {...props} />);
}

describe('RevealButton', () => {
  it('is disabled with a hint and sends nothing when there are no votes', async () => {
    const onReveal = vi.fn();
    renderButton(onReveal, { hasVotes: false });

    await userEvent.click(screen.getByRole('button', { name: 'Reveal votes' }));

    expect(screen.getByRole('button', { name: 'Reveal votes' })).toBeDisabled();
    expect(screen.getByText('Waiting for at least one vote.')).toBeVisible();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('is disabled when the parent disables it', () => {
    renderButton(() => Promise.resolve({ ok: true }), { disabled: true });

    expect(screen.getByRole('button', { name: 'Reveal votes' })).toBeDisabled();
  });

  it('shows "Revealing…" and ignores a second click while the request is pending', async () => {
    let settle: (result: ActionResult) => void = () => undefined;
    const onReveal = vi.fn(() => new Promise<ActionResult>((resolve) => (settle = resolve)));
    renderButton(onReveal);

    await userEvent.click(screen.getByRole('button', { name: 'Reveal votes' }));

    const pending = screen.getByRole('button', { name: 'Revealing…' });
    expect(pending).toBeDisabled();
    await userEvent.click(pending);
    expect(onReveal).toHaveBeenCalledTimes(1);
    settle({ ok: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reveal votes' })).toBeEnabled());
  });

  it.each([
    ['WRONG_PHASE', 'That action is not available right now.'],
    ['FORBIDDEN', 'You are not allowed to do that.'],
    ['TIMEOUT', 'Something went wrong. Try again.'],
    ['SOMETHING_ELSE', 'Something went wrong. Try again.'],
  ])('shows the fixed message for %s in an alert and re-enables the button', async (code, text) => {
    renderButton(() => Promise.resolve({ ok: false, code }));

    await userEvent.click(screen.getByRole('button', { name: 'Reveal votes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Reveal votes' })).toBeEnabled();
  });

  it('clears the previous error on the next attempt', async () => {
    const onReveal = vi
      .fn<() => Promise<ActionResult>>()
      .mockResolvedValueOnce({ ok: false, code: 'WRONG_PHASE' })
      .mockResolvedValueOnce({ ok: true });
    renderButton(onReveal);

    await userEvent.click(screen.getByRole('button', { name: 'Reveal votes' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Reveal votes' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
