import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('shows a single "Axon" heading on the home route', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Axon' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('offers the create-game form on the home route', () => {
    renderAt('/');

    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create game' })).toBeInTheDocument();
  });

  it('shows the game-not-found view for a malformed game id', () => {
    renderAt('/g/abc123');

    expect(screen.getByRole('heading', { name: 'Game not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a new game' })).toHaveAttribute('href', '/');
  });

  it.each(['/does-not-exist', '/g', '/g/x/y'])('shows "Page not found" on %s', (path) => {
    renderAt(path);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Axon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Game not found' })).not.toBeInTheDocument();
  });
});
