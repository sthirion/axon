import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../../types/game.types';
import { FacilitatorControls } from './FacilitatorControls';

const OK = () => Promise.resolve({ ok: true } as ActionResult);

function renderControls(props: Partial<Parameters<typeof FacilitatorControls>[0]> = {}) {
  return render(
    <FacilitatorControls
      revealed
      suggestedEstimate={5}
      disabled={false}
      onRevote={OK}
      onFinish={OK}
      {...props}
    />,
  );
}

describe('FacilitatorControls', () => {
  it('lists the numeric deck values only and starts on the suggestion', () => {
    renderControls({ suggestedEstimate: 8 });

    const select = screen.getByLabelText('Final estimate');
    expect(select).toHaveValue('8');
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Choose an estimate',
      '0',
      '1',
      '2',
      '3',
      '5',
      '8',
      '13',
      '21',
    ]);
  });

  it('picks up the suggestion when the round is revealed after being mounted while voting', () => {
    const { rerender } = renderControls({ revealed: false, suggestedEstimate: null });

    rerender(
      <FacilitatorControls
        revealed
        suggestedEstimate={5}
        disabled={false}
        onRevote={OK}
        onFinish={OK}
      />,
    );

    expect(screen.getByLabelText('Final estimate')).toHaveValue('5');
  });

  it('starts empty with Record estimate disabled when there is no suggestion', async () => {
    renderControls({ suggestedEstimate: null });

    expect(screen.getByLabelText('Final estimate')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Record estimate' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Final estimate'), '13');
    expect(screen.getByRole('button', { name: 'Record estimate' })).toBeEnabled();
  });

  it('records the chosen number, not the suggestion', async () => {
    const onFinish = vi.fn(OK);
    renderControls({ onFinish });

    await userEvent.selectOptions(screen.getByLabelText('Final estimate'), '13');
    await userEvent.click(screen.getByRole('button', { name: 'Record estimate' }));

    expect(onFinish).toHaveBeenCalledWith({ finalEstimate: 13 });
  });

  it('sends a re-vote and a skip', async () => {
    const onRevote = vi.fn(OK);
    const onFinish = vi.fn(OK);
    renderControls({ onRevote, onFinish });

    await userEvent.click(screen.getByRole('button', { name: 'Re-vote' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));

    expect(onRevote).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ skip: true });
  });

  it('shows only Skip story before the reveal', () => {
    renderControls({ revealed: false });

    expect(screen.getByRole('button', { name: 'Skip story' })).toBeEnabled();
    expect(screen.queryByLabelText('Final estimate')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Re-vote' })).toBeNull();
  });

  it('disables every control while reconnecting', () => {
    renderControls({ disabled: true });

    for (const name of ['Record estimate', 'Re-vote', 'Skip story']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it.each([
    ['Record estimate', 'Recording…'],
    ['Re-vote', 'Starting re-vote…'],
    ['Skip story', 'Skipping…'],
  ])('%s shows "%s" and disables all controls while pending', async (name, pendingLabel) => {
    let settle: (result: ActionResult) => void = () => undefined;
    const pending = () => new Promise<ActionResult>((resolve) => (settle = resolve));
    renderControls({ onRevote: pending, onFinish: pending });

    await userEvent.click(screen.getByRole('button', { name }));

    expect(screen.getByRole('button', { name: pendingLabel })).toBeDisabled();
    for (const other of screen.getAllByRole('button')) expect(other).toBeDisabled();
    settle({ ok: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skip story' })).toBeEnabled());
  });

  it('shows the generic message and re-enables the controls when the request rejects', async () => {
    renderControls({ onFinish: () => Promise.reject(new Error('socket closed')) });

    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(screen.getByRole('button', { name: 'Skip story' })).toBeEnabled();
  });

  it.each([
    ['WRONG_PHASE', 'That action is not available right now.'],
    ['INVALID_CARD', 'That card is not in the deck.'],
    ['FORBIDDEN', 'You are not allowed to do that.'],
    ['TIMEOUT', 'Something went wrong. Try again.'],
  ])('shows the fixed message for %s and re-enables the controls', async (code, text) => {
    renderControls({ onFinish: () => Promise.resolve({ ok: false, code }) });

    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Skip story' })).toBeEnabled();
  });
});
