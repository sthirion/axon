import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThemeMemory } from '../../lib/themeStorage';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  window.localStorage.clear();
  clearThemeMemory();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
});

describe('ThemeToggle', () => {
  it('is a button named "Dark mode" that is not pressed in the light theme', () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole('button', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toBeVisible();
  });

  it('keeps the same accessible name when switched, and only changes aria-pressed', async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement).toHaveClass('dark');
  });

  it.each(['{Enter}', ' '])('switches with the keyboard key %j', async (key) => {
    render(<ThemeToggle />);
    await userEvent.tab();

    await userEvent.keyboard(key);

    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hides its glyph from assistive technology and announces nothing on a switch', async () => {
    const { container } = render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
