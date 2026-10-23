import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { GAME_END_MESSAGES } from '@axon/shared';
import { GameEnded } from './GameEnded';

describe('GameEnded', () => {
  it.each(Object.values(GAME_END_MESSAGES))(
    'shows the heading, "%s" and a way to start over',
    (message) => {
      render(
        <MemoryRouter>
          <GameEnded message={message} />
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { level: 1, name: 'Session ended' })).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent(message);
      expect(screen.getByRole('link', { name: 'Create a new session' })).toHaveAttribute(
        'href',
        '/',
      );
    },
  );
});
