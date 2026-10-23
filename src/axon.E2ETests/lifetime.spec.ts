import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MOBILE = { width: 390, height: 844 };
const NOTICE =
  'Sessions are temporary. They are kept in memory only and end when the server restarts.';
const NOT_FOUND = 'This session does not exist or has ended.';
const EXPIRED = 'The session ended because it reached its 2-hour limit.';

// The server for this file runs with GAME_EMPTY_TTL_MS=4000, GAME_MAX_AGE_MS=10000 and a 250 ms
// sweep (see playwright.config.ts), so these tests stand in for 2 minutes and 2 hours.
test.describe('Game lifetime @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3101';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  async function newContext(browser: Browser, viewport = { width: 1280, height: 800 }) {
    const context = await browser.newContext({ baseURL, viewport });
    contexts.push(context);
    return context;
  }

  async function createGame(page: Page, name = 'Sven'): Promise<string> {
    await page.goto('/');
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Create session' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    return page.url();
  }

  async function joinGame(browser: Browser, gameUrl: string, name: string): Promise<Page> {
    const page = await (await newContext(browser)).newPage();
    await page.goto(gameUrl);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    return page;
  }

  test.describe('Temporary-games notice', () => {
    test('is shown on the create page, the join prompt, the game table and game not found', async ({
      browser,
    }) => {
      const facilitator = await (await newContext(browser)).newPage();
      await facilitator.goto('/');
      await expect(facilitator.getByRole('contentinfo')).toHaveText(NOTICE);

      const gameUrl = await createGame(facilitator);
      await expect(facilitator.getByRole('contentinfo')).toHaveText(NOTICE);
      const guest = await (await newContext(browser)).newPage();
      await guest.goto(gameUrl);
      await expect(guest.getByRole('heading', { level: 1, name: 'Join session' })).toBeVisible();
      await expect(guest.getByRole('contentinfo')).toHaveText(NOTICE);
      await guest.goto('/g/AAAAAAAAAAAAAAAAAAAAAA');
      await expect(guest.getByText(NOT_FOUND)).toBeVisible();
      await expect(guest.getByRole('contentinfo')).toHaveText(NOTICE);
    });
  });

  test.describe('Empty games', () => {
    test('a game everybody left is "Session not found" after the TTL', async ({ browser }) => {
      const context = await newContext(browser);
      const page = await context.newPage();
      const gameUrl = await createGame(page);
      await page.close();

      const visitor = await (await newContext(browser)).newPage();
      await expect(async () => {
        await visitor.goto(gameUrl);
        await expect(
          visitor.getByRole('heading', { level: 1, name: 'Session not found' }),
        ).toBeVisible({
          timeout: 1000,
        });
      }).toPass({ timeout: 15_000, intervals: [500] });
      await expect(visitor.getByText(NOT_FOUND)).toBeVisible();
    });

    test('a game reopened before the TTL keeps its state', async ({ browser }) => {
      const context = await newContext(browser);
      const page = await context.newPage();
      const gameUrl = await createGame(page);
      const form = page.getByRole('form', { name: 'Story' });
      await form.getByLabel('Title').fill('Login page');
      await form.getByRole('button', { name: 'Start voting' }).click();
      await expect(page.getByRole('region', { name: 'Story' })).toContainText('Login page');
      await page.close();

      const reopened = await context.newPage();
      await reopened.goto(gameUrl);

      await expect(
        reopened.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      await expect(reopened.getByRole('region', { name: 'Story' })).toContainText('Login page');
      await expect(reopened.getByRole('button', { name: 'Skip story' })).toBeVisible();
    });
  });

  test.describe('Age cap', () => {
    test('connected players are told the game ended and the link stops working', async ({
      browser,
    }) => {
      const facilitator = await (await newContext(browser)).newPage();
      const gameUrl = await createGame(facilitator);
      const voter = await joinGame(browser, gameUrl, 'Anna');

      for (const page of [facilitator, voter]) {
        await expect(page.getByRole('heading', { level: 1, name: 'Session ended' })).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByText(EXPIRED)).toBeVisible();
        await expect(page.getByRole('link', { name: 'Create a new session' })).toHaveAttribute(
          'href',
          '/',
        );
        await expect(page.getByRole('radiogroup')).toHaveCount(0);
        await expect(page.getByRole('contentinfo')).toHaveText(NOTICE);
      }
      const late = await (await newContext(browser)).newPage();
      await late.goto(gameUrl);
      await expect(
        late.getByRole('heading', { level: 1, name: 'Session not found' }),
      ).toBeVisible();
    });

    test('the ended page has no accessibility violations and fits a phone', async ({ browser }) => {
      const context = await newContext(browser, MOBILE);
      const page = await context.newPage();
      await createGame(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Session ended' })).toBeVisible({
        timeout: 20_000,
      });

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );

      expect(results.violations).toEqual([]);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});
