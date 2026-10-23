import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageLayout, TEMPORARY_GAMES_NOTICE } from './PageLayout';

describe('PageLayout', () => {
  it('shows the children in main and the temporary-games notice in a footer', () => {
    render(
      <PageLayout>
        <p>Content</p>
      </PageLayout>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('Content');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(TEMPORARY_GAMES_NOTICE);
    expect(TEMPORARY_GAMES_NOTICE).toBe(
      'Games are temporary. They are kept in memory only and end when the server restarts.',
    );
  });

  it('keeps the footer free of interactive elements', () => {
    render(
      <PageLayout>
        <p>Content</p>
      </PageLayout>,
    );

    expect(screen.getByRole('contentinfo').querySelectorAll('a, button, input')).toHaveLength(0);
  });
});
