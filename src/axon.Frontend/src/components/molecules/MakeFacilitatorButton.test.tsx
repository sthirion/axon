import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../../types/game.types';
import { CANNOT_HAND_OVER_MESSAGE, MakeFacilitatorButton } from './MakeFacilitatorButton';

const OK = () => Promise.resolve({ ok: true } as ActionResult);

function renderButton(onHandOver: () => Promise<ActionResult> = OK, disabled = false) {
  return render(<MakeFacilitatorButton name="Anna" disabled={disabled} onHandOver={onHandOver} />);
}

describe('MakeFacilitatorButton', () => {
  it('names the voter and sends nothing on the first click', async () => {
    const onHandOver = vi.fn(OK);
    renderButton(onHandOver);

    await userEvent.click(screen.getByRole('button', { name: 'Make facilitator Anna' }));

    expect(onHandOver).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Make Anna the facilitator' })).toBeVisible();
    expect(screen.getByText('Make Anna the facilitator?')).toBeVisible();
  });

  it('hands over only after "Confirm handover"', async () => {
    const onHandOver = vi.fn(OK);
    renderButton(onHandOver);

    await userEvent.click(screen.getByRole('button', { name: 'Make facilitator Anna' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));

    expect(onHandOver).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
  });

  it('cancels without sending anything and returns focus to the button', async () => {
    const onHandOver = vi.fn(OK);
    renderButton(onHandOver);
    await userEvent.click(screen.getByRole('button', { name: 'Make facilitator Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onHandOver).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Make facilitator Anna' })).toHaveFocus();
  });

  it('shows a friendly alert when the player can no longer take over, and keeps the choice open', async () => {
    renderButton(() => Promise.resolve({ ok: false, code: 'INVALID_PAYLOAD' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make facilitator Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(CANNOT_HAND_OVER_MESSAGE);
    expect(screen.getByRole('button', { name: 'Confirm handover' })).toBeEnabled();
  });

  it('shows the generic error when the request throws', async () => {
    renderButton(() => Promise.reject(new Error('boom')));
    await userEvent.click(screen.getByRole('button', { name: 'Make facilitator Anna' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('is disabled while reconnecting', async () => {
    renderButton(OK, true);
    expect(screen.getByRole('button', { name: 'Make facilitator Anna' })).toBeDisabled();
  });
});
