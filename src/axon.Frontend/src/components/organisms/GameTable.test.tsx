import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameTable, NO_VOTERS_MESSAGE } from './GameTable';
import { GAME_ID, gameState } from '../../test/fakeSocket';

type Game = Parameters<typeof GameTable>[0]['game'];

function renderTable(game: Game, reconnecting = false) {
  return render(<GameTable game={game} reconnecting={reconnecting} />);
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

    expect(within(screen.getByRole('region', { name: 'Voters' })).getByText(NO_VOTERS_MESSAGE)).toBeInTheDocument();
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

    rerender(<GameTable game={gameState() as Game} reconnecting={false} />);

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
});
