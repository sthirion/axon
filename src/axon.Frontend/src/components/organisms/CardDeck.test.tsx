import type { Card } from '@axon/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CardDeck } from './CardDeck';
import type { ActionResult } from '../../types/game.types';

const LABELS = ['0', '1', '2', '3', '5', '8', '13', '21', '?', 'Coffee break'];

function setup(selected: Card | null, disabled = false) {
  const onCast = vi.fn<(card: Card | null) => Promise<ActionResult>>(() =>
    Promise.resolve({ ok: true }),
  );
  const user = userEvent.setup();
  const view = render(<CardDeck selected={selected} disabled={disabled} onCast={onCast} />);
  return { user, onCast, ...view };
}

const radios = () => screen.getAllByRole('radio');
const radio = (name: string) => screen.getByRole('radio', { name });
const withdraw = () => screen.getByRole('button', { name: 'Withdraw vote' });

describe('CardDeck', () => {
  it('is a radio group named "Your vote" with the 10 cards in order', () => {
    setup(null);

    expect(screen.getByRole('radiogroup', { name: 'Your vote' })).toBeInTheDocument();
    expect(radios()).toEqual(LABELS.map((label) => radio(label)));
    expect(radios()).toHaveLength(10);
  });

  it('shows the coffee card as a hidden glyph with the accessible name "Coffee break"', () => {
    setup(null);

    expect(
      radio('Coffee break').closest('label')?.querySelector('[aria-hidden="true"]'),
    ).toHaveTextContent('☕');
  });

  it('checks only the card given as selected', () => {
    setup(13);

    expect(radios().filter((card) => (card as HTMLInputElement).checked)).toEqual([radio('13')]);
  });

  it('checks the coffee card for "coffee"', () => {
    setup('coffee');

    expect(radio('Coffee break')).toBeChecked();
  });

  it('shows 0 as selected, not as "no vote"', () => {
    setup(0);

    expect(radio('0')).toBeChecked();
    expect(withdraw()).toBeEnabled();
  });

  it('checks no card and disables Withdraw while there is no vote', () => {
    setup(null);

    expect(radios().some((card) => (card as HTMLInputElement).checked)).toBe(false);
    expect(withdraw()).toBeDisabled();
  });

  it('does not update the selection by itself when a card is clicked', async () => {
    const { user, onCast } = setup(null);

    await user.click(radio('5'));

    expect(onCast).toHaveBeenCalledExactlyOnceWith(5);
    expect(radio('5')).not.toBeChecked();
  });

  it('sends the string cards as is', async () => {
    const { user, onCast } = setup(null);

    await user.click(radio('?'));
    await user.click(radio('Coffee break'));

    expect(onCast.mock.calls).toEqual([['?'], ['coffee']]);
  });

  it('does not send anything when the checked card is clicked again', async () => {
    const { user, onCast } = setup(5);

    await user.click(radio('5'));

    expect(onCast).not.toHaveBeenCalled();
    expect(radio('5')).toBeChecked();
  });

  describe('keyboard', () => {
    const tabbable = () => radios().filter((card) => card.tabIndex === 0);

    it('makes only the first card tabbable when nothing is selected', async () => {
      const { user } = setup(null);

      expect(tabbable()).toEqual([radio('0')]);
      await user.tab();
      expect(radio('0')).toHaveFocus();
    });

    it('makes only the selected card tabbable and enters on it', async () => {
      const { user } = setup(8);

      expect(tabbable()).toEqual([radio('8')]);
      await user.tab();
      expect(radio('8')).toHaveFocus();
    });

    it('leaves the deck to "Withdraw vote" on Tab', async () => {
      const { user } = setup(8);

      await user.tab();
      await user.tab();

      expect(withdraw()).toHaveFocus();
    });

    it('moves to and selects the next card with ArrowRight and ArrowDown', async () => {
      const { user, onCast } = setup(null);
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(radio('1')).toHaveFocus();
      await user.keyboard('{ArrowDown}');

      expect(radio('2')).toHaveFocus();
      expect(onCast.mock.calls).toEqual([[1], [2]]);
    });

    it('moves to and selects the previous card with ArrowLeft and ArrowUp', async () => {
      const { user, onCast } = setup(8);
      await user.tab();

      await user.keyboard('{ArrowLeft}');
      await user.keyboard('{ArrowUp}');

      expect(radio('3')).toHaveFocus();
      expect(onCast.mock.calls).toEqual([[5], [3]]);
    });

    it('wraps from the last card to the first and back', async () => {
      const user = userEvent.setup();
      const onCast = vi.fn<(card: Card | null) => Promise<ActionResult>>(() =>
        Promise.resolve({ ok: true }),
      );
      // Stands in for the server echo (vote:mine) that updates the confirmed card.
      function Confirming() {
        const [selected, setSelected] = useState<Card | null>('coffee');
        return (
          <CardDeck
            selected={selected}
            disabled={false}
            onCast={(card) => {
              setSelected(card);
              return onCast(card);
            }}
          />
        );
      }
      render(<Confirming />);
      await user.tab();

      await user.keyboard('{ArrowRight}');
      expect(radio('0')).toHaveFocus();
      await user.keyboard('{ArrowLeft}');

      expect(radio('Coffee break')).toHaveFocus();
      expect(onCast.mock.calls).toEqual([[0], ['coffee']]);
    });

    it('selects the focused card with Space', async () => {
      const { user, onCast } = setup(null);
      await user.tab();

      await user.keyboard(' ');

      expect(onCast).toHaveBeenCalledExactlyOnceWith(0);
    });

    it('does nothing on Space for the card that is already selected', async () => {
      const { user, onCast } = setup(5);
      await user.tab();

      await user.keyboard(' ');

      expect(onCast).not.toHaveBeenCalled();
    });

    it('does not submit a surrounding form or send a vote on Enter', async () => {
      const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
      const onCast = vi.fn(() => Promise.resolve({ ok: true } as const));
      const user = userEvent.setup();
      render(
        <form onSubmit={onSubmit}>
          <CardDeck selected={null} disabled={false} onCast={onCast} />
          <button type="submit">Go</button>
        </form>,
      );
      await user.click(screen.getByRole('radio', { name: '3' }));
      onCast.mockClear();

      await user.keyboard('{Enter}');

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onCast).not.toHaveBeenCalled();
    });

    it.each(['{Enter}', ' '])('activates "Withdraw vote" with %j', async (key) => {
      const { user, onCast } = setup(5);
      withdraw().focus();

      await user.keyboard(key);

      expect(onCast).toHaveBeenCalledExactlyOnceWith(null);
    });
  });

  describe('withdraw', () => {
    it('withdraws with null and moves focus to the first card on success', async () => {
      const { user, onCast } = setup(8);

      await user.click(withdraw());

      expect(onCast).toHaveBeenCalledExactlyOnceWith(null);
      await vi.waitFor(() => expect(radio('0')).toHaveFocus());
    });

    it('keeps the selection, the focus and shows the error when the ack fails', async () => {
      const { user, onCast } = setup(8);
      onCast.mockResolvedValueOnce({ ok: false, code: 'WRONG_PHASE' });

      await user.click(withdraw());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That action is not available right now.',
      );
      expect(radio('8')).toBeChecked();
      expect(radio('0')).not.toHaveFocus();
    });
  });

  describe('errors', () => {
    it.each([
      ['INVALID_CARD', 'That card is not in the deck.'],
      ['FORBIDDEN', 'You are not allowed to do that.'],
      ['WRONG_PHASE', 'That action is not available right now.'],
      ['UNKNOWN', 'Something went wrong. Try again.'],
      ['TIMEOUT', 'Something went wrong. Try again.'],
    ])(
      'shows the %s failure in an alert and keeps the previous selection',
      async (code, message) => {
        const { user, onCast } = setup(3);
        onCast.mockResolvedValueOnce({ ok: false, code });

        await user.click(radio('5'));

        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(radio('3')).toBeChecked();
        expect(radio('5')).not.toBeChecked();
        expect(radios().every((card) => !(card as HTMLInputElement).disabled)).toBe(true);
        expect(withdraw()).toBeEnabled();
      },
    );

    it('clears the error on the next attempt', async () => {
      const { user, onCast } = setup(3);
      onCast.mockResolvedValueOnce({ ok: false, code: 'INVALID_CARD' });
      await user.click(radio('5'));
      await screen.findByRole('alert');

      await user.click(radio('8'));

      await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });
  });

  describe('disabled', () => {
    it('disables every card and Withdraw even with a vote', () => {
      setup(5, true);

      expect(radios().every((card) => (card as HTMLInputElement).disabled)).toBe(true);
      expect(withdraw()).toBeDisabled();
    });

    it('sends no vote for keyboard input and clicks', async () => {
      const { user, onCast } = setup(null, true);

      await user.tab();
      await user.keyboard('{ArrowRight}');
      await user.keyboard(' ');
      await user.click(radio('5'));

      expect(onCast).not.toHaveBeenCalled();
    });
  });
});
