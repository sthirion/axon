import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { GameNotFound } from './GameNotFound';

describe('GameNotFound', () => {
  it('shows the heading, the explanation and a link back to the create page', () => {
    render(
      <MemoryRouter>
        <GameNotFound />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Game not found' })).toBeInTheDocument();
    expect(screen.getByText('This game does not exist or has ended.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a new game' })).toHaveAttribute('href', '/');
  });
});
