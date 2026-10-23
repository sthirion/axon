import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MiniCard } from './MiniCard';

describe('MiniCard', () => {
  it('draws a decorative card back with no text', () => {
    const { container } = render(<MiniCard variant="back" />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('draws an empty slot with no text', () => {
    const { container } = render(<MiniCard variant="slot" />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows the value of a face as text with the sr-only "Vote: " prefix', () => {
    const { container } = render(<MiniCard variant="face" card={13} scale="fibonacci" />);

    expect(container).toHaveTextContent('Vote: 13');
    expect(screen.getByText('Vote:', { exact: false })).toHaveClass('sr-only');
  });

  it('marks a too-large face with a hidden warning and the text "(too large)" for assistive tech only', () => {
    const { container } = render(<MiniCard variant="face" card={13} scale="fibonacci" />);

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('⚠');
    expect(screen.getByText('(too large)', { exact: false })).toHaveClass('sr-only');
  });

  it('does not mark a small face', () => {
    const { container } = render(<MiniCard variant="face" card={5} scale="fibonacci" />);

    expect(container).not.toHaveTextContent('⚠');
    expect(container).not.toHaveTextContent('too large');
  });

  it('shows the coffee face as a mug with the name "Coffee break"', () => {
    const { container } = render(<MiniCard variant="face" card="coffee" scale="fibonacci" />);

    expect(container).toHaveTextContent('Coffee break');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders nothing for a face without a card', () => {
    const { container } = render(<MiniCard variant="face" />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['back', 'animate-deal'],
    ['face', 'animate-flip'],
  ] as const)('animates a %s only when asked to, with the %s class', (variant, animation) => {
    const still = render(<MiniCard variant={variant} card={5} scale="fibonacci" />);
    expect(still.container.firstElementChild?.className).not.toContain(animation);
    still.unmount();

    const moving = render(<MiniCard variant={variant} card={5} scale="fibonacci" animate />);
    expect(moving.container.firstElementChild?.className).toContain(animation);
  });

  it('staggers the flip by 80 ms per voter, at most 640 ms', () => {
    const delay = (order: number) => {
      const { container, unmount } = render(
        <MiniCard variant="face" card={5} scale="fibonacci" animate order={order} />,
      );
      const value = (container.firstElementChild as HTMLElement).style.getPropertyValue('--delay');
      unmount();
      return value;
    };

    expect(delay(0)).toBe('0ms');
    expect(delay(3)).toBe('240ms');
    expect(delay(8)).toBe('640ms');
    expect(delay(20)).toBe('640ms');
  });
});
