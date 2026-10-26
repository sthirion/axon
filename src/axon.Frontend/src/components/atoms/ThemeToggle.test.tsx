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
  it('is a button labelled with the current theme, "Light mode" in the light theme', () => {
    render(<ThemeToggle />);

    expect(screen.getByRole('button', { name: 'Light mode' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Dark mode' })).toBeNull();
  });

  it('changes its label to "Dark mode" when switched', async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button', { name: 'Light mode' }));

    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeVisible();
    expect(document.documentElement).toHaveClass('dark');
  });

  it.each(['{Enter}', ' '])('switches with the keyboard key %j', async (key) => {
    render(<ThemeToggle />);
    await userEvent.tab();

    await userEvent.keyboard(key);

    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeVisible();
  });

  it('hides its glyph from assistive technology and announces nothing on a switch', async () => {
    const { container } = render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button', { name: 'Light mode' }));

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
