import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

test.describe('App shell smoke @TEST', () => {
  test('player opening the home page sees the Planning Poker app shell', async ({ page }) => {
    // Given
    const heading = page.getByRole('heading', { level: 1 });

    // When
    await page.goto('/');

    // Then
    await expect(page).toHaveTitle('Planning Poker');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(heading).toHaveCount(1);
    await expect(heading).toHaveText('Planning Poker');
  });

  test('home page loads without console errors or CSP violations', async ({ page }) => {
    // Given
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
      });
    });

    // When
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Planning Poker' })).toBeVisible();

    // Then
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('home page has no accessibility violations', async ({ page }) => {
    // Given
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Planning Poker' })).toBeVisible();

    // When
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Then
    expect(results.violations).toEqual([]);
  });

  test('deep link to an unknown game shows the game-not-found view', async ({ page }) => {
    // Given
    const heading = page.getByRole('heading', { level: 1 });
    const createLink = page.getByRole('link', { name: 'Create a new session' });

    // When
    await page.goto('/g/abc123');

    // Then
    await expect(heading).toHaveText('Session not found');
    await expect(createLink).toHaveAttribute('href', '/');
  });

  test('unknown route shows the page-not-found view', async ({ page }) => {
    // Given
    const heading = page.getByRole('heading', { level: 1 });

    // When
    await page.goto('/does-not-exist');

    // Then
    await expect(heading).toHaveText('Page not found');
  });
});
