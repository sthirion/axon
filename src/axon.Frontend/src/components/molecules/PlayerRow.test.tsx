import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerRow } from './PlayerRow';

const miniCards = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('span')].filter((el) =>
    el.className.includes('h-[45px]'),
  );

describe('PlayerRow mini cards', () => {
  it('shows an empty slot and "Not voted" for a voter who has not voted', () => {
    const { container } = render(
      <PlayerRow name="Anna" connected hasVoted={false} scale="fibonacci" />,
    );

    expect(miniCards(container)).toHaveLength(1);
    expect(miniCards(container)[0]).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('Not voted');
  });

  it('shows a card back and "Voted" for a voter who has voted, without revealing a value', () => {
    const { container } = render(<PlayerRow name="Anna" connected hasVoted scale="fibonacci" />);

    expect(miniCards(container)).toHaveLength(1);
    expect(miniCards(container)[0]!.querySelector('svg')).not.toBeNull();
    expect(container).toHaveTextContent('Voted');
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('shows the face with the value after the reveal, and keeps the text', () => {
    const { container } = render(
      <PlayerRow name="Anna" connected revealedCard={8} scale="fibonacci" />,
    );

    expect(miniCards(container)).toHaveLength(1);
    expect(container).toHaveTextContent('AnnaVote: 8');
  });

  it('shows a slot and "No vote" for a voter without a vote after the reveal', () => {
    const { container } = render(
      <PlayerRow name="Anna" connected revealedCard={null} scale="fibonacci" />,
    );

    expect(miniCards(container)).toHaveLength(1);
    expect(container).toHaveTextContent('No vote');
    expect(container.textContent).not.toMatch(/Vote:/);
  });

  it('shows no mini card for the facilitator or while waiting', () => {
    const { container } = render(<PlayerRow name="Sven" connected />);

    expect(miniCards(container)).toHaveLength(0);
  });

  it('does not animate a card that is there on the first paint', () => {
    const voted = render(<PlayerRow name="Anna" connected hasVoted scale="fibonacci" />);
    expect(voted.container.innerHTML).not.toContain('animate-deal');
    voted.unmount();

    const revealed = render(<PlayerRow name="Anna" connected revealedCard={5} scale="fibonacci" />);
    expect(revealed.container.innerHTML).not.toContain('animate-flip');
  });

  it('deals a card in once when the voter votes during the session, and flips it on the reveal', () => {
    const view = render(<PlayerRow name="Anna" connected hasVoted={false} scale="fibonacci" />);
    expect(view.container.innerHTML).not.toContain('animate-');

    view.rerender(<PlayerRow name="Anna" connected hasVoted scale="fibonacci" />);
    expect(view.container.innerHTML).toContain('animate-deal');

    view.rerender(<PlayerRow name="Anna" connected revealedCard={5} scale="fibonacci" order={2} />);
    expect(view.container.innerHTML).toContain('animate-flip');
    expect(view.container.innerHTML).not.toContain('animate-deal');
    expect(screen.getByText('Vote:', { exact: false })).toBeInTheDocument();
  });

  it('staggers the flip with the voter position', () => {
    const view = render(<PlayerRow name="Anna" connected hasVoted scale="fibonacci" />);

    view.rerender(<PlayerRow name="Anna" connected revealedCard={5} scale="fibonacci" order={3} />);

    expect(view.container.innerHTML).toContain('--delay: 240ms');
  });
});
