import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoryTitle } from './StoryTitle';

describe('StoryTitle', () => {
  it('is plain text without a link', () => {
    render(<StoryTitle title="Login page" />);

    expect(screen.getByText('Login page')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is the link itself with a link, named by the title plus "(opens in a new tab)"', () => {
    render(<StoryTitle title="Login page" url="https://example.com/1" />);

    const link = screen.getByRole('link', { name: 'Login page (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://example.com/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText(/example\.com/)).toBeNull();
  });

  it('hides the arrow glyph from assistive technology', () => {
    const { container } = render(<StoryTitle title="T" url="https://example.com" />);

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('↗');
  });

  it('renders a markup title as literal text in both forms and injects no element', () => {
    const title = '<img src=x onerror=alert(1)>';
    const plain = render(<StoryTitle title={title} />);
    expect(screen.getByText(title)).toBeVisible();
    expect(plain.container.querySelector('img')).toBeNull();
    plain.unmount();

    const linked = render(<StoryTitle title={title} url="https://example.com" />);
    expect(screen.getByRole('link')).toHaveTextContent(title);
    expect(linked.container.querySelector('img')).toBeNull();
  });
});
