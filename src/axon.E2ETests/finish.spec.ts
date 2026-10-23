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
const WAITING_MESSAGE = 'Waiting for the facilitator to set the story.';

interface Player {
  readonly page: Page;
  readonly errors: string[];
}

interface Table {
  readonly facilitator: Player;
  readonly voters: Record<string, Player>;
  readonly all: Player[];
}

const votersRegion = (page: Page): Locator => page.getByRole('region', { name: 'Voters' });
const row = (page: Page, name: string): Locator =>
  votersRegion(page).getByRole('listitem').filter({ hasText: name });
const summary = (page: Page): Locator => page.getByRole('region', { name: 'Summary' });
const storyRegion = (page: Page): Locator => page.getByRole('region', { name: 'Story' });
const storyForm = (page: Page): Locator => page.getByRole('form', { name: 'Story' });
const resultsRegion = (page: Page): Locator => page.getByRole('region', { name: 'Results' });
const card = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const button = (page: Page, name: string): Locator => page.getByRole('button', { name });
const liveRegion = (page: Page): Locator => page.locator('.sr-only[aria-live="polite"]');
const estimateSelect = (page: Page): Locator => page.getByLabel('Final estimate');

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Re-vote, record the final estimate and keep a session summary @TEST', () => {
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
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    return { page, errors };
  }

  async function newTable(browser: Browser, names: string[], viewport = DESKTOP): Promise<Table> {
    const facilitator = await newPlayer(browser, viewport);
    await facilitator.page.goto('/');
    await facilitator.page.getByLabel('Your name').fill('Sven');
    await button(facilitator.page, 'Create session').click();
    await expect(
      facilitator.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
    ).toBeVisible();
    const gameId = /\/g\/([A-Za-z0-9_-]{22})$/.exec(new URL(facilitator.page.url()).pathname)![1];
    const voters: Record<string, Player> = {};
    for (const name of names) {
      const player = await newPlayer(browser, viewport);
      await player.page.goto(`/g/${gameId}`);
      await player.page.getByLabel('Your name').fill(name);
      await button(player.page, 'Join').click();
      await expect(
        player.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      voters[name] = player;
    }
    await expect(votersRegion(facilitator.page).getByRole('listitem')).toHaveCount(names.length);
    return { facilitator, voters, all: [facilitator, ...Object.values(voters)] };
  }

  async function startStory(table: Table, title: string, link?: string): Promise<void> {
    const form = storyForm(table.facilitator.page);
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Link').fill(link ?? 'https://example.com/story');
    await form.getByRole('button', { name: 'Start voting' }).click();
    for (const { page } of table.all) {
      await expect(storyRegion(page)).toContainText(title.slice(0, 40));
    }
  }

  async function vote(table: Table, name: string, label: string): Promise<void> {
    const page = table.voters[name]!.page;
    await card(page, label).click();
    await expect(card(page, label)).toBeChecked();
    await expect(row(table.facilitator.page, name)).toContainText('Voted');
  }

  async function reveal(table: Table): Promise<void> {
    await button(table.facilitator.page, 'Reveal votes').click();
    for (const { page } of table.all) await expect(resultsRegion(page)).toBeVisible();
  }

  async function expectSummary(
    table: Table,
    entries: Array<string | RegExp>,
    total: number,
  ): Promise<void> {
    for (const { page } of table.all) {
      const items = summary(page).getByRole('listitem');
      await expect(items).toHaveCount(entries.length);
      for (const [i, text] of entries.entries()) await expect(items.nth(i)).toContainText(text);
      await expect(summary(page)).toContainText(`Total: ${total}`);
    }
  }

  test('a facilitator and three voters play two rounds (re-vote, then skip) and everyone sees both', async ({
    browser,
  }) => {
    // Given
    const table = await newTable(browser, ['Anna', 'Bob', 'Cy']);
    await startStory(table, 'Login page', `${baseURL}/story-link-fixture`);
    await vote(table, 'Anna', '3');
    await vote(table, 'Bob', '8');
    await vote(table, 'Cy', '5');
    await reveal(table);

    // When the facilitator re-votes
    await button(table.facilitator.page, 'Re-vote').click();

    // Then the decks are empty, the story stays and the results are gone
    for (const name of ['Anna', 'Bob', 'Cy']) {
      const page = table.voters[name]!.page;
      await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
      await expect(card(page, '5')).toBeEnabled();
      await expect(resultsRegion(page)).toHaveCount(0);
      await expect(row(table.facilitator.page, name)).toContainText('Not voted');
    }
    for (const { page } of table.all) {
      await expect(storyRegion(page)).toContainText('Login page');
    }

    // When everyone agrees and the facilitator records the suggested estimate
    await vote(table, 'Anna', '5');
    await vote(table, 'Bob', '5');
    await vote(table, 'Cy', '5');
    await reveal(table);
    await expect(estimateSelect(table.facilitator.page)).toHaveValue('5');
    await button(table.facilitator.page, 'Record estimate').click();

    // Then the game waits for the next story with an empty round
    await expect(storyForm(table.facilitator.page)).toBeVisible();
    for (const name of ['Anna', 'Bob', 'Cy']) {
      const page = table.voters[name]!.page;
      await expect(page.getByText(WAITING_MESSAGE)).toBeVisible();
      await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
      for (const radio of await page.getByRole('radio').all()) await expect(radio).toBeDisabled();
    }
    await expectSummary(table, ['Login page'], 5);
    await expect(summary(table.facilitator.page).getByRole('listitem').first()).toContainText('5');

    // When the second story is skipped
    await startStory(table, 'Checkout');
    for (const name of ['Anna', 'Bob', 'Cy']) {
      await expect(row(table.facilitator.page, name)).toContainText('Not voted');
      await expect(table.voters[name]!.page.getByRole('radio', { checked: true })).toHaveCount(0);
    }
    await button(table.facilitator.page, 'Skip story').click();

    // Then both stories are in the summary for every player
    await expectSummary(table, ['Login page', /Checkout.*skipped/], 5);
    const link = summary(table.voters['Anna']!.page).getByRole('link').first();
    await expect(link).toHaveAttribute('href', `${baseURL}/story-link-fixture`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    for (const { errors } of table.all) expect(errors).toEqual([]);
  });

  test('pre-fills the closest deck value, and nothing when there is no average', async ({
    browser,
  }) => {
    const table = await newTable(browser, ['Anna', 'Bob']);
    await startStory(table, 'Login page');
    await vote(table, 'Anna', '3');
    await vote(table, 'Bob', '8');
    await reveal(table);
    await expect(estimateSelect(table.facilitator.page)).toHaveValue('5');
    await button(table.facilitator.page, 'Re-vote').click();

    await vote(table, 'Anna', '?');
    await vote(table, 'Bob', 'Coffee break');
    await reveal(table);

    await expect(estimateSelect(table.facilitator.page)).toHaveValue('');
    await expect(button(table.facilitator.page, 'Record estimate')).toBeDisabled();
    await estimateSelect(table.facilitator.page).selectOption('13');
    await button(table.facilitator.page, 'Record estimate').click();
    await expectSummary(table, [/Login page.*13/], 13);
  });

  test('offers only the numeric deck values as final estimate', async ({ browser }) => {
    const table = await newTable(browser, ['Anna']);
    await startStory(table, 'Login page');
    await vote(table, 'Anna', '8');
    await reveal(table);

    const options = await estimateSelect(table.facilitator.page)
      .locator('option')
      .allTextContents();

    expect(options).toEqual(['Choose an estimate', '0', '1', '2', '3', '5', '8', '13', '21']);
  });

  test('shows only the right controls to the right people', async ({ browser }) => {
    const table = await newTable(browser, ['Anna']);
    const fac = table.facilitator.page;
    const anna = table.voters['Anna']!.page;

    await expect(button(fac, 'Skip story')).toHaveCount(0);
    await expect(summary(anna)).toContainText('No stories estimated yet.');
    await expect(summary(anna)).toContainText('Total: 0');
    await expect(button(anna, 'Copy summary')).toBeDisabled();
    await startStory(table, 'Login page');
    await expect(button(fac, 'Skip story')).toBeEnabled();
    await expect(button(fac, 'Record estimate')).toHaveCount(0);
    await expect(button(fac, 'Re-vote')).toHaveCount(0);
    await vote(table, 'Anna', '8');
    await reveal(table);
    await expect(button(fac, 'Re-vote')).toBeEnabled();
    await expect(button(fac, 'Record estimate')).toBeEnabled();
    for (const name of ['Skip story', 'Re-vote', 'Record estimate']) {
      await expect(button(anna, name)).toHaveCount(0);
    }
    await expect(anna.getByLabel('Final estimate')).toHaveCount(0);
  });

  test('copies the summary as plain text for any player', async ({ browser }) => {
    const table = await newTable(browser, ['Anna']);
    await startStory(table, 'Login page', `${baseURL}/story-link-fixture`);
    await vote(table, 'Anna', '8');
    await reveal(table);
    await button(table.facilitator.page, 'Record estimate').click();
    await startStory(table, 'Checkout');
    await button(table.facilitator.page, 'Skip story').click();
    await expectSummary(table, ['Login page', /Checkout.*skipped/], 8);

    for (const { page } of table.all) {
      await button(page, 'Copy summary').click();
      await expect(summary(page).getByRole('status')).toHaveText('Summary copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `1. Login page (${baseURL}/story-link-fixture) - 8\n2. Checkout (https://example.com/story) - skipped\nTotal: 8`,
      );
    }
  });

  test('the live region announces a re-vote, a recorded estimate and a skip', async ({
    browser,
  }) => {
    const table = await newTable(browser, ['Anna']);
    const anna = table.voters['Anna']!.page;
    await startStory(table, 'Login page');
    await vote(table, 'Anna', '5');
    await reveal(table);

    await button(table.facilitator.page, 'Re-vote').click();
    await expect(liveRegion(anna)).toHaveText('Re-vote started');
    await vote(table, 'Anna', '5');
    await reveal(table);
    await button(table.facilitator.page, 'Record estimate').click();
    await expect(liveRegion(anna)).toHaveText('Estimate recorded: 5');
    await startStory(table, 'Checkout');
    await button(table.facilitator.page, 'Skip story').click();
    await expect(liveRegion(anna)).toHaveText('Story skipped');
    await anna.reload();
    await expect(summary(anna)).toContainText('Checkout');
    await expect(liveRegion(anna)).toHaveText('');
  });

  test('a reload and a late joiner see the summary', async ({ browser }) => {
    const table = await newTable(browser, ['Anna']);
    await startStory(table, 'Login page');
    await vote(table, 'Anna', '13');
    await reveal(table);
    await button(table.facilitator.page, 'Record estimate').click();
    const anna = table.voters['Anna']!.page;

    await anna.reload();
    const late = await newPlayer(browser);
    await late.page.goto(anna.url());
    await late.page.getByLabel('Your name').fill('Cy');
    await button(late.page, 'Join').click();

    for (const page of [anna, late.page]) {
      await expect(summary(page)).toContainText('Login page');
      await expect(summary(page)).toContainText('Total: 13');
    }
    await expect(anna.getByRole('radio', { checked: true })).toHaveCount(0);
  });

  for (const [label, viewport] of [
    ['1280x800', DESKTOP],
    ['390x844', MOBILE],
  ] as const) {
    test(`a ten-story summary with long titles and links fits at ${label}`, async ({ browser }) => {
      const table = await newTable(browser, ['Anna'], viewport);
      const longLink = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`;
      for (let i = 0; i < 10; i++) {
        await startStory(table, `${i}${'T'.repeat(199)}`, longLink);
        await button(table.facilitator.page, 'Skip story').click();
        await expect(storyForm(table.facilitator.page)).toBeVisible();
      }

      await startStory(table, `Last${'T'.repeat(196)}`, longLink);
      await vote(table, 'Anna', '8');
      await reveal(table);

      for (const { page } of table.all) {
        await expect(summary(page).getByRole('listitem')).toHaveCount(10);
        await expectNoHorizontalScroll(page);
        const box = await summary(page).boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      for (const name of ['Record estimate', 'Re-vote', 'Skip story']) {
        const target = await button(table.facilitator.page, name).boundingBox();
        expect(target!.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(target!.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TARGET);
      }
      const select = await estimateSelect(table.facilitator.page).boundingBox();
      expect(select!.height).toBeGreaterThanOrEqual(MIN_TARGET);
    });
  }

  test('voting, revealed and waiting views with a summary have no accessibility violations', async ({
    browser,
  }) => {
    const table = await newTable(browser, ['Anna', 'Bob']);
    await startStory(table, 'Login page', `${baseURL}/story-link-fixture`);
    await vote(table, 'Anna', '3');
    await button(table.facilitator.page, 'Skip story').click();
    await startStory(table, 'Checkout');
    await vote(table, 'Anna', '5');
    const voting = await new AxeBuilder({ page: table.facilitator.page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(voting.violations).toEqual([]);

    await reveal(table);
    const revealed = await new AxeBuilder({ page: table.facilitator.page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(revealed.violations).toEqual([]);
    await button(table.facilitator.page, 'Record estimate').click();

    for (const { page } of [table.facilitator, table.voters['Anna']!]) {
      await expect(summary(page)).toContainText('Checkout');
      const waiting = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(waiting.violations).toEqual([]);
    }
  });
});
