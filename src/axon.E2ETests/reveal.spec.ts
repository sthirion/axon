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
const LONG_NAME = 'N'.repeat(30);

interface Player {
  readonly page: Page;
  readonly errors: string[];
  readonly sent: string[];
}

interface Table {
  readonly facilitator: Player;
  readonly voters: Record<string, Player>;
}

const votersRegion = (page: Page): Locator => page.getByRole('region', { name: 'Voters' });
const row = (page: Page, name: string): Locator =>
  votersRegion(page).getByRole('listitem').filter({ hasText: name });
const resultsRegion = (page: Page): Locator => page.getByRole('region', { name: 'Results' });
const revealButton = (page: Page): Locator => page.getByRole('button', { name: 'Reveal votes' });
const card = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const liveRegion = (page: Page): Locator => page.locator('.sr-only[aria-live="polite"]');

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Reveal votes with distribution, average, consensus and outliers @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3100';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  async function newPlayer(browser: Browser, viewport = DESKTOP): Promise<Player> {
    const context = await browser.newContext({ baseURL, viewport });
    contexts.push(context);
    const page = await context.newPage();
    const errors: string[] = [];
    const sent: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => sent.push(String(frame.payload)));
    });
    return { page, errors, sent };
  }

  // Creates a game, joins every named voter and starts voting on a story.
  async function newTable(browser: Browser, names: string[], viewport = DESKTOP): Promise<Table> {
    const facilitator = await newPlayer(browser, viewport);
    await facilitator.page.goto('/');
    await facilitator.page.getByLabel('Your name').fill('Sven');
    await facilitator.page.getByRole('button', { name: 'Create session' }).click();
    await expect(
      facilitator.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
    ).toBeVisible();
    const gameId = /\/g\/([A-Za-z0-9_-]{22})$/.exec(new URL(facilitator.page.url()).pathname)![1];
    const voters: Record<string, Player> = {};
    for (const name of names) {
      const player = await newPlayer(browser, viewport);
      await player.page.goto(`/g/${gameId}`);
      await player.page.getByLabel('Your name').fill(name);
      await player.page.getByRole('button', { name: 'Join' }).click();
      await expect(
        player.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      voters[name] = player;
    }
    await expect(votersRegion(facilitator.page).getByRole('listitem')).toHaveCount(names.length);
    const form = facilitator.page.getByRole('form', { name: 'Story' });
    await form.getByLabel('Title').fill('Login page');
    await form.getByLabel('Link').fill('https://example.com/story');
    await form.getByRole('button', { name: 'Start voting' }).click();
    for (const { page } of [facilitator, ...Object.values(voters)]) {
      await expect(page.getByRole('region', { name: 'Story' })).toContainText('Login page');
    }
    return { facilitator, voters };
  }

  async function vote(table: Table, name: string, label: string): Promise<void> {
    const page = table.voters[name]!.page;
    await card(page, label).click();
    await expect(card(page, label)).toBeChecked();
    await expect(row(table.facilitator.page, name)).toContainText('Voted');
  }

  async function reveal(table: Table): Promise<void> {
    await revealButton(table.facilitator.page).click();
    for (const { page } of [table.facilitator, ...Object.values(table.voters)]) {
      await expect(resultsRegion(page)).toBeVisible();
    }
  }

  test.describe('Reveal', () => {
    test('shows every card, the distribution, the average and outliers to every player', async ({
      browser,
    }) => {
      // Given
      const table = await newTable(browser, ['Anna', 'Bob', 'Cy', 'Di']);
      await vote(table, 'Anna', '3');
      await vote(table, 'Bob', '8');
      await vote(table, 'Cy', '?');
      for (const { page } of [table.facilitator, ...Object.values(table.voters)]) {
        await expect(votersRegion(page)).not.toContainText(/\b3\b|\b8\b/);
        await expect(resultsRegion(page)).toHaveCount(0);
      }

      // When
      await reveal(table);

      // Then
      for (const { page } of [table.facilitator, ...Object.values(table.voters)]) {
        await expect(row(page, 'Anna')).toContainText('Vote: 3');
        await expect(row(page, 'Anna')).toContainText('Outlier');
        await expect(row(page, 'Bob')).toContainText('Vote: 8');
        await expect(row(page, 'Bob')).toContainText('Outlier');
        await expect(row(page, 'Cy')).toContainText('Vote: ?');
        await expect(row(page, 'Cy')).not.toContainText('Outlier');
        await expect(row(page, 'Di')).toContainText('No vote');
        const results = resultsRegion(page);
        await expect(results).toContainText('Average: 5.5');
        await expect(results).toContainText('No consensus');
        await expect(results).toContainText('Outliers: Anna, Bob');
        await expect(results.getByRole('listitem')).toHaveCount(3);
        await expect(results.getByRole('listitem').nth(0)).toContainText('1 vote');
      }
    });

    test('shows consensus and no outliers when all numeric votes are equal', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob', 'Cy']);
      await vote(table, 'Anna', '5');
      await vote(table, 'Bob', '5');
      await vote(table, 'Cy', 'Coffee break');

      await reveal(table);

      const results = resultsRegion(table.voters['Cy']!.page);
      await expect(results).toContainText('Consensus: 5');
      await expect(results).toContainText('Average: 5');
      await expect(results).not.toContainText('Outliers');
      await expect(row(table.facilitator.page, 'Cy')).toContainText('Coffee break');
      await expect(row(table.facilitator.page, 'Anna')).not.toContainText('Outlier');
    });

    test('shows "No average" and no consensus or outliers with only ? and coffee votes', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await vote(table, 'Anna', '?');
      await vote(table, 'Bob', 'Coffee break');

      await reveal(table);

      const results = resultsRegion(table.facilitator.page);
      await expect(results).toContainText('No average');
      await expect(results).not.toContainText(/consensus|Outlier/i);
      await expect(table.facilitator.page.getByText('Outlier')).toHaveCount(0);
    });

    test('keeps Reveal disabled with a hint until a vote exists and when it is withdrawn', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      const page = table.facilitator.page;

      await expect(revealButton(page)).toBeDisabled();
      await expect(page.getByText('Waiting for at least one vote.')).toBeVisible();
      await vote(table, 'Anna', '8');
      await expect(revealButton(page)).toBeEnabled();
      await table.voters['Anna']!.page.getByRole('button', { name: 'Withdraw vote' }).click();
      await expect(row(page, 'Anna')).toContainText('Not voted');
      await expect(revealButton(page)).toBeDisabled();
    });

    test('shows voters no Reveal button and sends no round:reveal', async ({ browser }) => {
      const table = await newTable(browser, ['Anna']);
      await vote(table, 'Anna', '8');

      await expect(revealButton(table.voters['Anna']!.page)).toHaveCount(0);
      expect(table.voters['Anna']!.sent.filter((frame) => frame.includes('round:reveal'))).toEqual(
        [],
      );
    });
  });

  test.describe('After the reveal', () => {
    test('locks the deck, keeps the own card, and freezes the story', async ({ browser }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await vote(table, 'Anna', '13');
      await reveal(table);

      const anna = table.voters['Anna']!.page;
      await expect(card(anna, '13')).toBeChecked();
      for (const radio of await anna.getByRole('radio').all()) {
        await expect(radio).toBeDisabled();
      }
      await expect(anna.getByRole('button', { name: 'Withdraw vote' })).toBeDisabled();
      await expect(revealButton(table.facilitator.page)).toHaveCount(0);
      await expect(table.facilitator.page.getByRole('button', { name: 'Edit story' })).toHaveCount(
        0,
      );
      await expect(table.facilitator.page.getByRole('region', { name: 'Story' })).toContainText(
        'Login page',
      );
    });

    test('a reload and a late joiner see the revealed round', async ({ browser }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await vote(table, 'Anna', '3');
      await vote(table, 'Bob', '5');
      await reveal(table);

      const anna = table.voters['Anna']!.page;
      await anna.reload();

      await expect(row(anna, 'Bob')).toContainText('Vote: 5');
      await expect(card(anna, '3')).toBeChecked();
      await expect(resultsRegion(anna)).toContainText('Average: 4');
      const gameUrl = anna.url();
      const late = await newPlayer(browser);
      await late.page.goto(gameUrl);
      await late.page.getByLabel('Your name').fill('Cy');
      await late.page.getByRole('button', { name: 'Join' }).click();
      await expect(row(late.page, 'Cy')).toContainText('No vote');
      await expect(row(late.page, 'Anna')).toContainText('Vote: 3');
      await expect(resultsRegion(late.page)).toContainText('Average: 4');
    });
  });

  test.describe('Announcements', () => {
    test('the live region announces the reveal and the result once', async ({ browser }) => {
      const table = await newTable(browser, ['Anna', 'Bob']);
      await vote(table, 'Anna', '5');
      await vote(table, 'Bob', '5');

      await reveal(table);

      await expect(liveRegion(table.voters['Anna']!.page)).toHaveText(
        'Votes revealed. Consensus: 5',
      );
      await expect(liveRegion(table.facilitator.page)).toHaveText('Votes revealed. Consensus: 5');
    });

    test('a reloaded page announces nothing for an already revealed round', async ({ browser }) => {
      const table = await newTable(browser, ['Anna']);
      await vote(table, 'Anna', '5');
      await reveal(table);
      const anna = table.voters['Anna']!.page;

      await anna.reload();

      await expect(resultsRegion(anna)).toBeVisible();
      await expect(liveRegion(anna)).toHaveText('');
    });
  });

  for (const [label, viewport] of [
    ['1280x800', DESKTOP],
    ['390x844', MOBILE],
  ] as const) {
    test.describe(`Responsive ${label}`, () => {
      test('ten voters with long names and every distinct card fit with no horizontal scroll', async ({
        browser,
      }) => {
        const names = Array.from({ length: 10 }, (_, i) => `${LONG_NAME.slice(0, 29)}${i}`);
        const table = await newTable(browser, names, viewport);
        const labels = ['1', '2', '3', '5', '8', '13', '21', '?', 'Coffee break'];
        for (const [i, name] of names.entries())
          await vote(table, name, labels[i % labels.length]!);

        await expect(revealButton(table.facilitator.page)).toBeVisible();
        const box = await revealButton(table.facilitator.page).boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET);
        await reveal(table);

        for (const { page } of [table.facilitator, table.voters[names[0]!]!]) {
          await expectNoHorizontalScroll(page);
          await expect(resultsRegion(page).getByRole('listitem')).toHaveCount(9);
          const results = await resultsRegion(page).boundingBox();
          expect(results!.x + results!.width).toBeLessThanOrEqual(viewport.width);
        }
      });
    });
  }

  test.describe('Accessibility', () => {
    test('the voting view with a Reveal button and the revealed view have no violations', async ({
      browser,
    }) => {
      const table = await newTable(browser, ['Anna', 'Bob', 'Cy']);
      await vote(table, 'Anna', '3');
      await vote(table, 'Bob', '8');
      const before = await new AxeBuilder({ page: table.facilitator.page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(before.violations).toEqual([]);

      await reveal(table);

      for (const { page } of [table.facilitator, table.voters['Anna']!]) {
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations).toEqual([]);
      }
    });
  });

  test('the reveal flow produces no console errors', async ({ browser }) => {
    const table = await newTable(browser, ['Anna', 'Bob']);
    await vote(table, 'Anna', '3');
    await vote(table, 'Bob', '5');

    await reveal(table);

    for (const { errors } of [table.facilitator, ...Object.values(table.voters)]) {
      expect(errors).toEqual([]);
    }
  });
});
