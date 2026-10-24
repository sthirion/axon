import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../../types/game.types';
import { SkipStoryButton } from './SkipStoryButton';

const OK = () => Promise.resolve({ ok: true } as ActionResult);

describe('SkipStoryButton', () => {
  it('skips on click', async () => {
    const onSkip = vi.fn(OK);
    render(<SkipStoryButton disabled={false} onSkip={onSkip} />);

    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('is disabled while reconnecting', () => {
    render(<SkipStoryButton disabled onSkip={OK} />);

    expect(screen.getByRole('button', { name: 'Skip story' })).toBeDisabled();
  });

  it('shows the server failure in an alert and the generic one when the request throws', async () => {
    const { rerender } = render(
      <SkipStoryButton
        disabled={false}
        onSkip={() => Promise.resolve({ ok: false, code: 'FORBIDDEN' })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are not allowed to do that.');

    rerender(<SkipStoryButton disabled={false} onSkip={() => Promise.reject(new Error('boom'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows a pending label and ignores a second click while waiting', async () => {
    let settle: (r: ActionResult) => void = () => {};
    const onSkip = vi.fn(() => new Promise<ActionResult>((resolve) => (settle = resolve)));
    render(<SkipStoryButton disabled={false} onSkip={onSkip} />);

    await userEvent.click(screen.getByRole('button', { name: 'Skip story' }));
    expect(screen.getByRole('button', { name: 'Skipping…' })).toBeDisabled();
    settle({ ok: true });

    expect(await screen.findByRole('button', { name: 'Skip story' })).toBeEnabled();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
