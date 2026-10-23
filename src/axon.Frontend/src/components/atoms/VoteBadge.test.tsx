import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VoteBadge } from './VoteBadge';

describe('VoteBadge', () => {
  it('shows "Voted" as text with a decorative icon', () => {
    const { container } = render(<VoteBadge voted />);

    expect(screen.getByText('Voted', { exact: false })).toHaveTextContent('✓Voted');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');
  });

  it('shows "Not voted" as text with a decorative icon', () => {
    const { container } = render(<VoteBadge voted={false} />);

    expect(screen.getByText('Not voted', { exact: false })).toHaveTextContent('○Not voted');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('○');
  });
});
