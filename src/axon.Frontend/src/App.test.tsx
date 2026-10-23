import { render, screen, within } from '@testing-library/react';
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
  it('shows a single "Planning Poker" heading with the subtitle under it on the home route', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Planning Poker' })).toBeInTheDocument();
    expect(screen.getByText('Story refinement')).toBeVisible();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(within(screen.getByRole('banner')).queryByText('Planning Poker')).toBeNull();
  });

  it('shows the logo link to the home page on every route', () => {
    for (const path of ['/', '/g/abc123', '/does-not-exist']) {
      const { unmount } = renderAt(path);

      expect(screen.getByRole('link', { name: 'Planning Poker home' })).toHaveAttribute(
        'href',
        '/',
      );
      unmount();
    }
  });

  it('offers the create-game form on the home route', () => {
    renderAt('/');

    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeInTheDocument();
  });

  it('shows the game-not-found view for a malformed game id', () => {
    renderAt('/g/abc123');

    expect(screen.getByRole('heading', { name: 'Session not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a new session' })).toHaveAttribute('href', '/');
  });

  it.each(['/does-not-exist', '/g', '/g/x/y'])('shows "Page not found" on %s', (path) => {
    renderAt(path);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Planning Poker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Session not found' })).not.toBeInTheDocument();
  });
});
