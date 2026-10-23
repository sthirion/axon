import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PageLayout, TEMPORARY_SESSIONS_NOTICE } from './PageLayout';

function renderLayout(props: Partial<Parameters<typeof PageLayout>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PageLayout {...props}>
        <button type="button">First in content</button>
      </PageLayout>
    </MemoryRouter>,
  );
}

describe('PageLayout', () => {
  it('shows the children in main and the temporary-sessions notice in a footer', () => {
    renderLayout();

    expect(screen.getByRole('main')).toHaveTextContent('First in content');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(TEMPORARY_SESSIONS_NOTICE);
    expect(TEMPORARY_SESSIONS_NOTICE).toBe(
      'Sessions are temporary. They are kept in memory only and end when the server restarts.',
    );
  });

  it('keeps the footer free of interactive elements', () => {
    renderLayout();

    expect(screen.getByRole('contentinfo').querySelectorAll('a, button, input')).toHaveLength(0);
  });

  it('shows the name and subtitle as plain text in the header, with no heading', () => {
    renderLayout();

    const header = screen.getByRole('banner');
    expect(within(header).getByText('Planning Poker')).toBeVisible();
    expect(within(header).getByText('Story refinement')).toBeVisible();
    expect(within(header).queryByRole('heading')).toBeNull();
  });

  it('leaves the brand text out when brand is false', () => {
    renderLayout({ brand: false });

    const header = screen.getByRole('banner');
    expect(within(header).queryByText('Planning Poker')).toBeNull();
    expect(within(header).queryByText('Story refinement')).toBeNull();
  });

  it('puts the logo link last in the header, after the theme toggle, and as the only link home', () => {
    renderLayout();

    const header = screen.getByRole('banner');
    const controls = within(header).getAllByRole('button', { name: 'Dark mode' });
    const logo = within(header).getByRole('link', { name: 'Planning Poker home' });
    expect(controls).toHaveLength(1);
    expect(logo).toHaveAttribute('href', '/');
    expect(within(header).getAllByRole('link')).toHaveLength(1);
    expect(
      controls[0]!.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(logo.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('puts the theme toggle first in the tab order, then the logo, then the content', async () => {
    renderLayout();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Planning Poker home' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'First in content' })).toHaveFocus();
  });

  it('widens the container only for the estimation page', () => {
    const { unmount } = renderLayout();
    expect(screen.getByRole('main').className).toContain('max-w-xl');
    unmount();

    renderLayout({ wide: true });
    expect(screen.getByRole('main').className).toContain('lg:max-w-6xl');
  });
});
