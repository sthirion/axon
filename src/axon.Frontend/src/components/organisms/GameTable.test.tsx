import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameTable, NO_VOTERS_MESSAGE } from './GameTable';
import { GAME_ID, gameState } from '../../test/fakeSocket';

type Game = Parameters<typeof GameTable>[0]['game'];

const IDLE = {
  role: 'voter',
  myCard: null,
  announcement: '',
  onSetStory: () => Promise.resolve({ ok: true as const }),
  onCastVote: () => Promise.resolve({ ok: true as const }),
} as const;

function renderTable(game: Game, reconnecting = false) {
  return render(<GameTable game={game} reconnecting={reconnecting} {...IDLE} />);
}

describe('GameTable', () => {
  it('shows the facilitator in its own labelled section with an online status', () => {
    renderTable(gameState() as Game);

    const section = screen.getByRole('region', { name: 'Facilitator' });
    expect(within(section).getByText('Sven')).toBeInTheDocument();
    expect(within(section).getByText('online')).toBeInTheDocument();
  });

  it('shows an offline facilitator as text', () => {
    renderTable(gameState({ facilitator: { name: 'Sven', connected: false } }) as Game);

    const section = screen.getByRole('region', { name: 'Facilitator' });
    expect(within(section).getByText('offline')).toBeInTheDocument();
  });

  it('lists voters in the given order with online or offline text', () => {
    renderTable(
      gameState({
        voters: [
          { id: 'v1', name: 'Zed', connected: true },
          { id: 'v2', name: 'Anna', connected: false },
        ],
      }) as Game,
    );

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Zedonline');
    expect(items[1]).toHaveTextContent('Annaoffline');
  });

  it('shows the empty state when there are no voters', () => {
    renderTable(gameState() as Game);

    expect(
      within(screen.getByRole('region', { name: 'Voters' })).getByText(NO_VOTERS_MESSAGE),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the join link built from the origin and game id with a copy button', () => {
    renderTable(gameState() as Game);

    expect(screen.getByText(`${window.location.origin}/g/${GAME_ID}`)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('renders names as text, never as markup', () => {
    const name = '<img src=x onerror=alert(1)>';
    const { container } = renderTable(
      gameState({ voters: [{ id: 'v1', name, connected: true }] }) as Game,
    );

    expect(screen.getByText(name)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the Reconnecting banner in a polite live region only while reconnecting', () => {
    const { container, rerender } = renderTable(gameState() as Game, true);

    expect(screen.getByText('Reconnecting…')).toBeVisible();
    expect(screen.getByText('Reconnecting…').parentElement).toHaveAttribute('aria-live', 'polite');

    rerender(<GameTable game={gameState() as Game} reconnecting={false} {...IDLE} />);

    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('keeps the last known table visible while reconnecting', () => {
    renderTable(
      gameState({ voters: [{ id: 'v1', name: 'Anna', connected: false }] }) as Game,
      true,
    );

    expect(screen.getByText('Anna')).toBeVisible();
    expect(screen.getByText('Reconnecting…')).toBeVisible();
  });

  it('has a single level-1 heading', () => {
    renderTable(gameState() as Game);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  describe('voting', () => {
    const VOTING = {
      phase: 'voting',
      story: { title: 'Login page' },
      voters: [
        { id: 'v1', name: 'Anna', connected: true, hasVoted: true },
        { id: 'v2', name: 'Bob', connected: true, hasVoted: false },
      ],
    };

    it('shows "Voted" and "Not voted" text badges while voting', () => {
      renderTable(gameState(VOTING) as Game);

      const items = within(screen.getByRole('list')).getAllByRole('listitem');
      expect(screen.getByText('Voted')).toBeInTheDocument();
      expect(screen.getByText('Not voted')).toBeInTheDocument();
      expect(items[0]).toHaveTextContent('Anna');
      expect(items[0]).not.toHaveTextContent('Not voted');
      expect(items[1]).toHaveTextContent('Bob');
      expect(items[1]).toHaveTextContent('Not voted');
    });

    it('shows no badge while waiting', () => {
      renderTable(
        gameState({
          voters: [{ id: 'v1', name: 'Anna', connected: true, hasVoted: false }],
        }) as Game,
      );

      expect(screen.queryByText('Voted', { exact: false })).not.toBeInTheDocument();
      expect(screen.queryByText('Not voted')).not.toBeInTheDocument();
    });

    it('never shows a card value in the voters list', () => {
      renderTable(gameState(VOTING) as Game);

      const list = screen.getByRole('list');
      expect(list.textContent).not.toMatch(/\d|\?|☕|coffee/i);
    });

    it('shows the story form and no deck to the facilitator', () => {
      render(
        <GameTable game={gameState() as Game} reconnecting={false} {...IDLE} role="facilitator" />,
      );

      expect(screen.getByRole('form', { name: 'Story' })).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Withdraw vote' })).not.toBeInTheDocument();
    });

    it('shows the waiting message and a disabled deck to a voter while waiting', () => {
      renderTable(gameState() as Game);

      expect(screen.getByText('Waiting for the facilitator to set the story.')).toBeVisible();
      expect(screen.getByRole('radiogroup', { name: 'Your vote' })).toBeInTheDocument();
      expect(
        screen.getAllByRole('radio').every((card) => (card as HTMLInputElement).disabled),
      ).toBe(true);
    });

    it('shows the story and an enabled deck with the confirmed card to a voter while voting', () => {
      render(
        <GameTable game={gameState(VOTING) as Game} reconnecting={false} {...IDLE} myCard={8} />,
      );

      expect(screen.getByText('Login page')).toBeVisible();
      expect(screen.queryByText('Waiting for the facilitator to set the story.')).toBeNull();
      expect(screen.getByRole('radio', { name: '8' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '5' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Withdraw vote' })).toBeEnabled();
    });

    it('disables the deck, Withdraw and Edit story while reconnecting', () => {
      const { rerender } = render(
        <GameTable game={gameState(VOTING) as Game} reconnecting {...IDLE} myCard={8} />,
      );

      expect(
        screen.getAllByRole('radio').every((card) => (card as HTMLInputElement).disabled),
      ).toBe(true);
      expect(screen.getByRole('button', { name: 'Withdraw vote' })).toBeDisabled();

      rerender(
        <GameTable game={gameState(VOTING) as Game} reconnecting {...IDLE} role="facilitator" />,
      );
      expect(screen.getByRole('button', { name: 'Edit story' })).toBeDisabled();
    });

    it('shows neither the deck nor the story form without a known role', () => {
      render(<GameTable game={gameState() as Game} reconnecting={false} {...IDLE} role={null} />);

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    });

    it('renders the announcement in a polite, atomic live region', () => {
      render(
        <GameTable
          game={gameState(VOTING) as Game}
          reconnecting={false}
          {...IDLE}
          announcement="Bob has voted"
        />,
      );

      const region = screen.getByText('Bob has voted');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveAttribute('aria-atomic', 'true');
    });
  });
});
