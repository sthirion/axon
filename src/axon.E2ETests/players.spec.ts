import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MIN_TARGET = 44;
const OFFLINE_TEXT = /The facilitator is offline\./;
const REMOVED_TEXT = 'You were removed from this session.';

interface Player {
  readonly context: BrowserContext;
  page: Page;
  readonly errors: string[];
}

interface Table {
  readonly facilitator: Player;
  readonly voters: Record<string, Player>;
  readonly all: Player[];
  readonly gameUrl: string;
}

const votersRegion = (page: Page): Locator => page.getByRole('region', { name: 'Voters' });
const row = (page: Page, name: string): Locator =>
  votersRegion(page).getByRole('listitem').filter({ hasText: name });
const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const card = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const resultsRegion = (page: Page): Locator => page.getByRole('region', { name: 'Results' });
const liveRegion = (page: Page): Locator => page.locator('.sr-only[aria-live="polite"]');
const offlineBanner = (page: Page): Locator => page.getByText(OFFLINE_TEXT);

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Facilitator reconnect and removing players @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3100';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  function track(page: Page, errors: string[]): void {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
  }

  async function newPlayer(browser: Browser, viewport = DESKTOP): Promise<Player> {
    const context = await browser.newContext({ baseURL, viewport });
    contexts.push(context);
    const page = await context.newPage();
    const errors: string[] = [];
    track(page, errors);
    return { context, page, errors };
  }

  async function newTable(browser: Browser, names: string[], viewport = DESKTOP): Promise<Table> {
    const facilitator = await newPlayer(browser, viewport);
    await facilitator.page.goto('/');
    await facilitator.page.getByLabel('Your name').fill('Sven');
    await button(facilitator.page, 'Create session').click();
    await expect(
      facilitator.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
    ).toBeVisible();
    const gameUrl = facilitator.page.url();
    const voters: Record<string, Player> = {};
    for (const name of names) {
      const player = await newPlayer(browser, viewport);
      await player.page.goto(gameUrl);
      await player.page.getByLabel('Your name').fill(name);
      await button(player.page, 'Join').click();
      await expect(
        player.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      voters[name] = player;
    }
    await expect(votersRegion(facilitator.page).getByRole('listitem')).toHaveCount(names.length);
    return { facilitator, voters, all: [facilitator, ...Object.values(voters)], gameUrl };
  }

  async function startStory(table: Table, title = 'Login page'): Promise<void> {
    const form = table.facilitator.page.getByRole('form', { name: 'Story' });
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Link').fill('https://example.com/story');
    await form.getByRole('button', { name: 'Start voting' }).click();
    for (const { page } of table.all) {
      await expect(page.getByRole('region', { name: 'Story' })).toContainText(title);
    }
  }

  async function vote(table: Table, name: string, label: string): Promise<void> {
    const page = table.voters[name]!.page;
    await card(page, label).click();
    await expect(card(page, label)).toBeChecked();
    await expect(row(table.facilitator.page, name)).toContainText('Voted');
  }

  // Only players still in the game see results; pass the ones to wait for.
  async function reveal(table: Table, watchers = table.all.map((player) => player.page)) {
    await button(table.facilitator.page, 'Reveal votes').click();
    for (const page of watchers) await expect(resultsRegion(page)).toBeVisible();
  }

  async function closeFacilitator(table: Table): Promise<void> {
    await table.facilitator.page.close();
  }

  async function reopenFacilitator(table: Table): Promise<void> {
    const page = await table.facilitator.context.newPage();
    track(page, table.facilitator.errors);
    table.facilitator.page = page;
    await page.goto(table.gameUrl);
    await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
  }

  async function removeVoter(table: Table, name: string): Promise<void> {
    await button(table.facilitator.page, `Remove ${name}`).click();
    await button(table.facilitator.page, 'Confirm remove').click();
    await expect(row(table.facilitator.page, name)).toHaveCount(0);
  }

  test.describe('Facilitator reconnect', () => {
    test('a reload mid-round keeps the round, the controls and the facilitator role', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await startStory(table);
      await vote(table, 'Anna', '3');
      await vote(table, 'Bob', '8');
      const fac = table.facilitator.page;

      await fac.reload();

      await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
      await expect(fac.getByRole('region', { name: 'Story' })).toContainText('Login page');
      await expect(row(fac, 'Anna')).toContainText('Voted');
      await expect(button(fac, 'Reveal votes')).toBeEnabled();
      await expect(button(fac, 'Skip story')).toBeVisible();
      await reveal(table);
      await fac.reload();
      await expect(resultsRegion(fac)).toContainText('Average: 5.5');
      await expect(row(fac, 'Anna')).toContainText('Vote: 3');
      await expect(button(fac, 'Re-vote')).toBeEnabled();
      await expect(fac.getByLabel('Final estimate')).toBeVisible();
      await button(fac, 'Re-vote').click();
      await expect(card(table.voters['Anna']!.page, '3')).not.toBeChecked();
      expect(table.facilitator.errors).toEqual([]);
    });

    test('voters see the offline banner, keep voting, and it goes away when the facilitator returns', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await startStory(table);
      const anna = table.voters['Anna']!.page;
      const bob = table.voters['Bob']!.page;
      await expect(offlineBanner(anna)).toHaveCount(0);

      await closeFacilitator(table);

      for (const page of [anna, bob]) await expect(offlineBanner(page)).toBeVisible();
      await expect(liveRegion(anna)).toHaveText('The facilitator is offline');
      await expect(card(anna, '5')).toBeEnabled();
      await card(anna, '5').click();
      await expect(card(anna, '5')).toBeChecked();
      await card(anna, '8').click();
      await expect(card(anna, '8')).toBeChecked();
      await button(anna, 'Withdraw vote').click();
      await expect(anna.getByRole('radio', { checked: true })).toHaveCount(0);
      await card(bob, '13').click();
      await expect(row(bob, 'Anna')).toContainText('Not voted');
      for (const name of ['Reveal votes', 'Skip story', 'Re-vote', /^Remove/, 'Record estimate']) {
        await expect(button(anna, name)).toHaveCount(0);
      }
      await expect(anna.getByRole('form', { name: 'Story' })).toHaveCount(0);

      await reopenFacilitator(table);

      for (const page of [anna, bob]) await expect(offlineBanner(page)).toHaveCount(0);
      await expect(liveRegion(anna)).toHaveText('The facilitator is back');
      await expect(offlineBanner(table.facilitator.page)).toHaveCount(0);
      await expect(row(table.facilitator.page, 'Bob')).toContainText('Voted');
      await expect(button(table.facilitator.page, 'Reveal votes')).toBeEnabled();
      await reveal(table);
      await expect(resultsRegion(bob)).toContainText('Average: 13');
    });
  });

  test.describe('Removing players', () => {
    test('shows Remove only to the facilitator, with a confirmation that can be cancelled', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      const fac = table.facilitator.page;
      await expect(button(table.voters['Anna']!.page, /^Remove/)).toHaveCount(0);

      await button(fac, 'Remove Anna').click();
      await expect(fac.getByText('Remove Anna from the session?')).toBeVisible();
      await button(fac, 'Cancel').click();

      await expect(button(fac, 'Remove Anna')).toBeFocused();
      await expect(row(fac, 'Anna')).toBeVisible();
      await expect(row(table.voters['Bob']!.page, 'Anna')).toBeVisible();
      await expect(table.voters['Anna']!.page.getByRole('radiogroup')).toBeVisible();
    });

    test('a removed voter sees the removed page, cannot rejoin, and the others see the row go', async ({
      browser,
    }) => {
      // Given
      const table = await newTable(browser, ['Anna', 'Bob']);
      await startStory(table);
      await vote(table, 'Anna', '3');
      await vote(table, 'Bob', '8');
      const anna = table.voters['Anna']!;

      // When
      await removeVoter(table, 'Anna');

      // Then the removed voter is told and disconnected
      await expect(anna.page.getByRole('heading', { level: 1, name: 'Removed' })).toBeVisible();
      await expect(anna.page.getByText(REMOVED_TEXT)).toBeVisible();
      await expect(anna.page.getByRole('radiogroup')).toHaveCount(0);
      await expect(anna.page.getByLabel('Your name')).toHaveCount(0);
      // and the others no longer see them or their vote
      await expect(row(table.voters['Bob']!.page, 'Anna')).toHaveCount(0);
      await expect(liveRegion(table.voters['Bob']!.page)).toHaveText('Anna was removed');
      await reveal(table, [table.facilitator.page, table.voters['Bob']!.page]);
      await expect(resultsRegion(table.facilitator.page)).toContainText('Average: 8');
      await expect(votersRegion(table.facilitator.page)).not.toContainText('Anna');

      // When the removed voter reloads or reopens the link in the same browser
      await anna.page.reload();
      await expect(anna.page.getByText(REMOVED_TEXT)).toBeVisible();
      const again = await anna.context.newPage();
      await again.goto(table.gameUrl);

      // Then they are still refused
      await expect(again.getByText(REMOVED_TEXT)).toBeVisible();
      await expect(again.getByRole('radiogroup')).toHaveCount(0);
      for (const { errors } of table.all) expect(errors).toEqual([]);
    });

    test('removing a voter after the reveal recalculates the results for everyone', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await startStory(table);
      await vote(table, 'Anna', '3');
      await vote(table, 'Bob', '8');
      await reveal(table);
      await expect(resultsRegion(table.voters['Bob']!.page)).toContainText('Average: 5.5');

      await removeVoter(table, 'Anna');

      for (const page of [table.facilitator.page, table.voters['Bob']!.page]) {
        await expect(resultsRegion(page)).toContainText('Average: 8');
        await expect(resultsRegion(page)).not.toContainText('Outliers');
      }
    });
  });

  for (const [label, viewport] of [
    ['1280x800', DESKTOP],
    ['390x844', MOBILE],
  ] as const) {
    test(`ten voters with long names, the confirmation and the offline banner fit at ${label}`, async ({
      browser,
    }) => {
      const names = Array.from({ length: 10 }, (_, i) => `${'N'.repeat(29)}${i}`);
      const table = await newTable(browser, names, viewport);
      const fac = table.facilitator.page;

      for (const name of names) {
        const target = await button(fac, `Remove ${name}`).boundingBox();
        expect(target!.width).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(target!.height).toBeGreaterThanOrEqual(MIN_TARGET);
      }
      await button(fac, `Remove ${names[0]}`).click();
      await expect(fac.getByRole('group', { name: `Remove ${names[0]}` })).toBeVisible();
      await expectNoHorizontalScroll(fac);
      for (const name of ['Confirm remove', 'Cancel']) {
        const box = await button(fac, name).boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET);
      }
      await closeFacilitator(table);
      const voter = table.voters[names[1]!]!.page;
      await expect(offlineBanner(voter)).toBeVisible();
      await expectNoHorizontalScroll(voter);
    });
  }

  test.describe('Accessibility', () => {
    test('the offline banner, the confirmation and the removed page have no violations', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await startStory(table);
      const fac = table.facilitator.page;
      await button(fac, 'Remove Anna').click();
      const confirming = await new AxeBuilder({ page: fac }).withTags(WCAG_TAGS).analyze();
      expect(confirming.violations).toEqual([]);
      await button(fac, 'Cancel').click();

      await closeFacilitator(table);
      await expect(offlineBanner(table.voters['Bob']!.page)).toBeVisible();
      const banner = await new AxeBuilder({ page: table.voters['Bob']!.page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(banner.violations).toEqual([]);

      await reopenFacilitator(table);
      await removeVoter(table, 'Anna');
      const anna = table.voters['Anna']!.page;
      await expect(anna.getByText(REMOVED_TEXT)).toBeVisible();
      const removed = await new AxeBuilder({ page: anna }).withTags(WCAG_TAGS).analyze();
      expect(removed.violations).toEqual([]);
    });
  });
});
