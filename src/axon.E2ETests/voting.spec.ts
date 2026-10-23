import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from '@playwright/test';

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

const WAITING_MESSAGE = 'Waiting for the facilitator to set the story.';
const TITLE_ERROR = 'Enter a title of 1 to 200 characters.';
const LINK_ERROR = 'Enter a full link starting with http:// or https://.';
const XSS_TITLE = '<img src=x onerror=alert(1)>';
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const NEW_TAB_NAME = /\(opens in a new tab\)$/;
const CARD_LABELS = ['0', '1', '2', '3', '5', '8', '13', '21', '?', 'Coffee break'];

interface Player {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly errors: string[];
  readonly sent: string[];
}

interface Table {
  readonly facilitator: Player;
  readonly anna: Player;
  readonly bob: Player;
  readonly gameId: string;
}

const voterRows = (page: Page): Locator =>
  page.getByRole('region', { name: 'Voters' }).getByRole('listitem');
const votersRegion = (page: Page): Locator => page.getByRole('region', { name: 'Voters' });
const storyRegion = (page: Page): Locator => page.getByRole('region', { name: 'Story' });
const storyForm = (page: Page): Locator => page.getByRole('form', { name: 'Story' });
const allCards = (page: Page): Locator => page.getByRole('radio');
const checkedCards = (page: Page): Locator => page.getByRole('radio', { checked: true });
const card = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const withdrawButton = (page: Page): Locator => page.getByRole('button', { name: 'Withdraw vote' });
const sentCount = (player: Player, event: string): number =>
  player.sent.filter((frame) => frame.includes(`"${event}"`)).length;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectWithinWidth(locator: Locator, viewportWidth: number): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
}

async function expectAllCardsWithinWidth(page: Page, viewportWidth: number): Promise<void> {
  await expect(allCards(page)).toHaveCount(CARD_LABELS.length);
  for (const radio of await allCards(page).all()) {
    await expectWithinWidth(radio, viewportWidth);
  }
}

const MIN_TARGET = 44;

// The label is what the user taps; the input is visually hidden inside it.
const cardTarget = (page: Page, name: string): Locator =>
  card(page, name).locator('xpath=ancestor::label');
const cardFace = (page: Page, name: string): Locator =>
  card(page, name).locator('xpath=following-sibling::span');

async function expectMinTarget(locator: Locator, description: string): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, description).not.toBeNull();
  expect(box!.width, `${description} width`).toBeGreaterThanOrEqual(MIN_TARGET);
  expect(box!.height, `${description} height`).toBeGreaterThanOrEqual(MIN_TARGET);
}

interface FocusStyle {
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
}

async function focusStyle(locator: Locator): Promise<FocusStyle> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
}

function expectFocusIndicator(before: FocusStyle, after: FocusStyle, description: string): void {
  const outlineVisible = after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) > 0;
  const shadowVisible = after.boxShadow !== 'none';
  expect(outlineVisible || shadowVisible, `${description} shows an outline or box-shadow`).toBe(
    true,
  );
  expect(after, `${description} differs from the unfocused style`).not.toEqual(before);
}

async function expectAllCardsDisabled(page: Page): Promise<void> {
  await expect(allCards(page)).toHaveCount(CARD_LABELS.length);
  for (const radio of await allCards(page).all()) {
    await expect(radio).toBeDisabled();
  }
}

async function expectAllCardsEnabled(page: Page): Promise<void> {
  await expect(allCards(page)).toHaveCount(CARD_LABELS.length);
  for (const radio of await allCards(page).all()) {
    await expect(radio).toBeEnabled();
  }
}

async function expectVoteStatus(page: Page, name: string, voted: boolean): Promise<void> {
  const row = voterRows(page).filter({ hasText: name });
  if (voted) {
    await expect(row).toContainText(/Voted/);
    await expect(row).not.toContainText('Not voted');
  } else {
    await expect(row).toContainText('Not voted');
  }
}

async function expectNoVoteValueShown(page: Page): Promise<void> {
  await expect(checkedCards(page)).toHaveCount(0);
  await expect(votersRegion(page)).not.toContainText(/\d|\?|Coffee|☕/);
}

async function tabTo(page: Page, target: Locator, maxTabs = 10): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

async function setStory(page: Page, title: string, link?: string): Promise<void> {
  const form = storyForm(page);
  await form.getByLabel('Title').fill(title);
  if (link !== undefined) await form.getByLabel('Link').fill(link);
  await form.getByRole('button', { name: 'Start voting' }).click();
}

async function editStory(page: Page, title: string, link?: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit story' }).click();
  const form = storyForm(page);
  await form.getByLabel('Title').fill(title);
  if (link !== undefined) await form.getByLabel('Link').fill(link);
  await form.getByRole('button', { name: 'Save' }).click();
}

test.describe('Set the story and vote with hidden cards @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3100';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  async function newPlayer(browser: Browser, options: BrowserContextOptions = {}): Promise<Player> {
    const context = await browser.newContext({ baseURL, ...options });
    contexts.push(context);
    await context.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
      });
    });
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
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/socket.io/')) {
        sent.push(request.postData() ?? '');
      }
    });
    return { context, page, errors, sent };
  }

  async function createGame(page: Page, name: string): Promise<string> {
    await page.goto('/');
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Create session' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    const match = /\/g\/([A-Za-z0-9_-]{22})$/.exec(new URL(page.url()).pathname);
    expect(match).not.toBeNull();
    return match![1];
  }

  async function joinGame(page: Page, gameId: string, name: string): Promise<void> {
    await page.goto(`/g/${gameId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Join session' })).toBeVisible();
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
  }

  async function newTable(browser: Browser, options: BrowserContextOptions = {}): Promise<Table> {
    const facilitator = await newPlayer(browser, options);
    const anna = await newPlayer(browser, options);
    const bob = await newPlayer(browser, options);
    const gameId = await createGame(facilitator.page, 'Sven');
    await joinGame(anna.page, gameId, 'Anna');
    await joinGame(bob.page, gameId, 'Bob');
    await expect(voterRows(facilitator.page)).toHaveCount(2);
    return { facilitator, anna, bob, gameId };
  }

  async function startVoting(table: Table, title = 'Login page', link?: string): Promise<void> {
    await setStory(table.facilitator.page, title, link);
    for (const { page } of [table.facilitator, table.anna, table.bob]) {
      await expect(storyRegion(page)).toContainText(title);
    }
  }

  async function vote(player: Player, label: string): Promise<void> {
    await card(player.page, label).click();
    await expect(card(player.page, label)).toBeChecked();
  }

  test.describe('Story', () => {
    test('facilitator sets a story and every player sees the title', async ({ browser }) => {
      // Given
      const { facilitator, anna, bob } = await newTable(browser);

      // Then
      await expect(storyForm(facilitator.page)).toBeVisible();
      await expect(storyForm(facilitator.page).getByLabel('Title')).toBeVisible();
      await expect(storyForm(facilitator.page).getByLabel('Link')).toBeVisible();
      await expect(
        storyForm(facilitator.page).getByRole('button', { name: 'Start voting' }),
      ).toBeEnabled();
      await expect(allCards(facilitator.page)).toHaveCount(0);
      for (const { page } of [anna, bob]) {
        await expect(page.getByText(WAITING_MESSAGE)).toBeVisible();
        await expect(storyForm(page)).toHaveCount(0);
        await expectAllCardsDisabled(page);
        await expect(withdrawButton(page)).toBeDisabled();
        await expect(voterRows(page).filter({ hasText: 'Anna' })).not.toContainText(
          /Voted|Not voted/,
        );
      }

      // When
      await setStory(facilitator.page, 'Login page');

      // Then
      for (const { page } of [facilitator, anna, bob]) {
        await expect(storyRegion(page)).toContainText('Login page');
        await expect(storyRegion(page).getByRole('link')).toHaveCount(0);
      }
      await expect(facilitator.page.getByRole('button', { name: 'Edit story' })).toBeEnabled();
      await expect(storyForm(facilitator.page)).toHaveCount(0);
      for (const { page } of [anna, bob]) {
        await expect(page.getByText(WAITING_MESSAGE)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Edit story' })).toHaveCount(0);
        await expect(storyForm(page)).toHaveCount(0);
        await expectAllCardsEnabled(page);
        await expectVoteStatus(page, 'Anna', false);
        await expectVoteStatus(page, 'Bob', false);
      }
    });

    test('an empty title shows an inline error, focuses the field and sends nothing', async ({
      browser,
    }) => {
      // Given
      const { facilitator, anna } = await newTable(browser);
      const form = storyForm(facilitator.page);
      const title = form.getByLabel('Title');

      // When
      await form.getByRole('button', { name: 'Start voting' }).click();

      // Then
      await expect(form.getByText(TITLE_ERROR)).toBeVisible();
      await expect(title).toHaveAttribute('aria-invalid', 'true');
      await expect(title).toBeFocused();
      const errorId = await title.getAttribute('aria-describedby');
      expect(errorId).not.toBeNull();
      await expect(facilitator.page.locator(`[id="${errorId}"]`)).toHaveText(TITLE_ERROR);
      await expect(anna.page.getByText(WAITING_MESSAGE)).toBeVisible();
      expect(sentCount(facilitator, 'story:set')).toBe(0);
    });

    test('a javascript: link shows an inline error and sends nothing', async ({ browser }) => {
      // Given
      const { facilitator, anna } = await newTable(browser);
      const form = storyForm(facilitator.page);

      // When
      await setStory(facilitator.page, 'Login page', 'javascript:alert(1)');

      // Then
      await expect(form.getByText(LINK_ERROR)).toBeVisible();
      await expect(form.getByLabel('Link')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.getByLabel('Link')).toBeFocused();
      await expect(form.getByText(TITLE_ERROR)).toHaveCount(0);
      await expect(anna.page.getByText(WAITING_MESSAGE)).toBeVisible();
      expect(sentCount(facilitator, 'story:set')).toBe(0);
    });

    test('a story link opens safely in a new tab for every player', async ({ browser }) => {
      // Given
      const table = await newTable(browser);
      const { facilitator, anna, bob } = table;
      const url = `${baseURL}/story-link-fixture`;

      // When
      await startVoting(table, 'Login page', url);

      // Then
      for (const { page } of [facilitator, anna, bob]) {
        const link = storyRegion(page).getByRole('link');
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute('href', url);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(link).toContainText('Login page');
        await expect(link).not.toContainText(url);
        await expect(link).toHaveAccessibleName(NEW_TAB_NAME);
      }

      // When
      const popupPromise = anna.context.waitForEvent('page');
      await storyRegion(anna.page).getByRole('link').click();

      // Then
      const popup = await popupPromise;
      await expect(popup).toHaveURL(url);
    });

    test('a story title with HTML is shown as literal text for everyone', async ({ browser }) => {
      // Given
      const table = await newTable(browser);
      const { facilitator, anna, bob } = table;
      const dialogs: string[] = [];
      for (const { page } of [facilitator, anna, bob]) {
        page.on('dialog', (dialog) => {
          dialogs.push(dialog.message());
          void dialog.dismiss();
        });
      }

      // When
      await startVoting(table, XSS_TITLE);

      // Then
      for (const { page } of [facilitator, anna, bob]) {
        await expect(storyRegion(page)).toContainText(XSS_TITLE);
        await expect(page.locator('img')).toHaveCount(0);
      }
      expect(dialogs).toEqual([]);
    });

    test('editing the story while voting updates everyone and keeps the votes', async ({
      browser,
    }) => {
      // Given
      const table = await newTable(browser);
      const { facilitator, anna, bob } = table;
      await startVoting(table, 'Login page');
      await vote(anna, '5');
      await expectVoteStatus(bob.page, 'Anna', true);

      // When
      await facilitator.page.getByRole('button', { name: 'Edit story' }).click();

      // Then
      const form = storyForm(facilitator.page);
      await expect(form.getByLabel('Title')).toHaveValue('Login page');
      await expect(form.getByLabel('Title')).toBeFocused();
      await expect(form.getByRole('button', { name: 'Save' })).toBeEnabled();
      await expect(form.getByRole('button', { name: 'Cancel' })).toBeEnabled();

      // When
      await form.getByLabel('Title').fill('Checkout page');
      await form.getByRole('button', { name: 'Save' }).click();

      // Then
      for (const { page } of [facilitator, anna, bob]) {
        await expect(storyRegion(page)).toContainText('Checkout page');
        await expect(storyRegion(page)).not.toContainText('Login page');
        await expectVoteStatus(page, 'Anna', true);
        await expectVoteStatus(page, 'Bob', false);
      }
      await expect(card(anna.page, '5')).toBeChecked();
      await expect(facilitator.page.getByRole('button', { name: 'Edit story' })).toBeFocused();
    });

    test('cancelling an edit restores the story and sends nothing', async ({ browser }) => {
      // Given
      const table = await newTable(browser);
      const { facilitator, anna } = table;
      await startVoting(table, 'Login page');
      const sentBefore = sentCount(facilitator, 'story:set');

      // When
      await facilitator.page.getByRole('button', { name: 'Edit story' }).click();
      await storyForm(facilitator.page).getByLabel('Title').fill('Something else');
      await storyForm(facilitator.page).getByRole('button', { name: 'Cancel' }).click();

      // Then
      await expect(storyForm(facilitator.page)).toHaveCount(0);
      await expect(storyRegion(facilitator.page)).toContainText('Login page');
      await expect(facilitator.page.getByRole('button', { name: 'Edit story' })).toBeFocused();
      await expect(storyRegion(anna.page)).toContainText('Login page');
      expect(sentCount(facilitator, 'story:set')).toBe(sentBefore);
    });

    test('editing the story can add and remove the link', async ({ browser }) => {
      // Given
      const table = await newTable(browser);
      const url = `${baseURL}/story-link-fixture`;
      await startVoting(table, 'Login page');

      // When
      await editStory(table.facilitator.page, 'Login page', url);

      // Then
      await expect(storyRegion(table.anna.page).getByRole('link')).toHaveAttribute('href', url);

      // When
      await editStory(table.facilitator.page, 'Login page', '');

      // Then
      await expect(storyRegion(table.anna.page).getByRole('link')).toHaveCount(0);
      await expect(storyRegion(table.facilitator.page).getByRole('link')).toHaveCount(0);
    });
  });

  test.describe('Voting', () => {
    test('a voter picks, changes and withdraws a card while others only see the status', async ({
      browser,
    }) => {
      // Given
      const table = await newTable(browser);
      const { facilitator, anna, bob } = table;
      await startVoting(table);

      // When
      await vote(anna, '5');

      // Then
      await expect(anna.page.getByRole('radiogroup', { name: 'Your vote' })).toBeVisible();
      await expect(allCards(anna.page)).toHaveCount(CARD_LABELS.length);
      await expect(checkedCards(anna.page)).toHaveCount(1);
      await expect(withdrawButton(anna.page)).toBeEnabled();
      for (const { page } of [facilitator, anna, bob]) {
        await expectVoteStatus(page, 'Anna', true);
        await expectVoteStatus(page, 'Bob', false);
      }
      for (const { page } of [facilitator, bob]) await expectNoVoteValueShown(page);

      // When
      await card(anna.page, '5').click();

      // Then
      await expect(card(anna.page, '5')).toBeChecked();
      await expect(withdrawButton(anna.page)).toBeEnabled();

      // When
      await vote(anna, 'Coffee break');

      // Then
      await expect(card(anna.page, '5')).not.toBeChecked();
      await expect(checkedCards(anna.page)).toHaveCount(1);
      await expectVoteStatus(facilitator.page, 'Anna', true);
      for (const { page } of [facilitator, bob]) await expectNoVoteValueShown(page);

      // When
      await vote(bob, '13');
      await withdrawButton(anna.page).click();

      // Then
      await expect(checkedCards(anna.page)).toHaveCount(0);
      await expect(withdrawButton(anna.page)).toBeDisabled();
      await expect(card(bob.page, '13')).toBeChecked();
      for (const { page } of [facilitator, anna, bob]) {
        await expectVoteStatus(page, 'Anna', false);
        await expectVoteStatus(page, 'Bob', true);
      }
      await expectNoVoteValueShown(facilitator.page);
      await expect(allCards(facilitator.page)).toHaveCount(0);
      await expect(withdrawButton(facilitator.page)).toHaveCount(0);
      await expect(facilitator.page.getByRole('radiogroup')).toHaveCount(0);
    });

    test('a voter reloading gets the own card back and a second tab stays in sync', async ({
      browser,
    }) => {
      // Given
      const table = await newTable(browser);
      const { facilitator, anna, bob, gameId } = table;
      await startVoting(table);
      await vote(anna, '8');

      // When
      await anna.page.reload();

      // Then
      await expect(
        anna.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      await expect(card(anna.page, '8')).toBeChecked();
      await expect(checkedCards(anna.page)).toHaveCount(1);
      await expect(withdrawButton(anna.page)).toBeEnabled();
      await expectVoteStatus(facilitator.page, 'Anna', true);
      await expectNoVoteValueShown(bob.page);

      // When
      const secondTab = await anna.context.newPage();
      await secondTab.goto(`/g/${gameId}`);

      // Then
      await expect(
        secondTab.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      await expect(card(secondTab, '8')).toBeChecked();

      // When
      await card(secondTab, '3').click();

      // Then
      await expect(card(secondTab, '3')).toBeChecked();
      await expect(card(anna.page, '3')).toBeChecked();
      await expect(card(anna.page, '8')).not.toBeChecked();

      // When
      await withdrawButton(anna.page).click();

      // Then
      await expect(checkedCards(secondTab)).toHaveCount(0);
      await expect(checkedCards(anna.page)).toHaveCount(0);
      await expectVoteStatus(facilitator.page, 'Anna', false);
    });
  });

  test.describe('Keyboard only', () => {
    test('a voter selects, wraps and withdraws with the keyboard only', async ({ browser }) => {
      // Given
      const table = await newTable(browser);
      const { anna } = table;
      const { page } = anna;
      await startVoting(table);

      // When
      await tabTo(page, card(page, '0'));

      // Then
      await expect(card(page, '0')).toBeFocused();
      await expect(checkedCards(page)).toHaveCount(0);

      // When
      await page.keyboard.press('Space');

      // Then
      await expect(card(page, '0')).toBeChecked();
      await expect(card(page, '0')).toBeFocused();

      // When / Then: backwards through the wrap, 0 -> Coffee break -> ? -> 21
      for (const label of ['Coffee break', '?', '21']) {
        await page.keyboard.press('ArrowLeft');
        await expect(card(page, label)).toBeChecked();
        await expect(card(page, label)).toBeFocused();
      }

      // When / Then: forwards through the wrap, 21 -> ? -> Coffee break -> 0
      for (const label of ['?', 'Coffee break', '0']) {
        await page.keyboard.press('ArrowRight');
        await expect(card(page, label)).toBeChecked();
        await expect(card(page, label)).toBeFocused();
      }

      // When
      await page.keyboard.press('ArrowRight');

      // Then
      await expect(card(page, '1')).toBeChecked();
      await expect(checkedCards(page)).toHaveCount(1);

      // When
      await page.keyboard.press('Tab');

      // Then
      await expect(withdrawButton(page)).toBeFocused();

      // When
      await page.keyboard.press('Enter');

      // Then
      await expect(checkedCards(page)).toHaveCount(0);
      await expect(card(page, '0')).toBeFocused();
      await expectVoteStatus(table.facilitator.page, 'Anna', false);

      // When
      await page.keyboard.press('Space');
      await expect(card(page, '0')).toBeChecked();
      await page.keyboard.press('Tab');
      await expect(withdrawButton(page)).toBeFocused();
      await page.keyboard.press('Space');

      // Then
      await expect(checkedCards(page)).toHaveCount(0);
      await expect(card(page, '0')).toBeFocused();
      await expectVoteStatus(table.facilitator.page, 'Anna', false);
    });

    test('the facilitator submits the story form with the keyboard only', async ({ browser }) => {
      // Given
      const { facilitator, anna } = await newTable(browser);
      const { page } = facilitator;
      const url = `${baseURL}/story-link-fixture`;
      const form = storyForm(page);

      // When
      await tabTo(page, form.getByLabel('Title'));
      await page.keyboard.type('Login page');
      await page.keyboard.press('Tab');
      await expect(form.getByLabel('Link')).toBeFocused();
      await page.keyboard.type(url);
      await page.keyboard.press('Tab');
      await expect(form.getByRole('button', { name: 'Start voting' })).toBeFocused();
      await page.keyboard.press('Enter');

      // Then
      await expect(storyRegion(page)).toContainText('Login page');
      await expect(storyRegion(anna.page)).toContainText('Login page');
      await expect(storyRegion(anna.page).getByRole('link')).toHaveAttribute('href', url);
      await expect(page.getByRole('button', { name: 'Edit story' })).toBeVisible();
    });
  });

  test.describe('Responsive', () => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const label = `${viewport.width}x${viewport.height}`;

      test(`story and voting views with a long title and link fit the ${label} viewport`, async ({
        browser,
      }) => {
        // Given
        const longTitle = 'W'.repeat(200);
        const prefix = `${baseURL}/story-link-fixture?q=`;
        const longLink = prefix + 'a'.repeat(2048 - prefix.length);
        expect(longLink).toHaveLength(2048);
        const table = await newTable(browser, { viewport });
        const { facilitator, anna } = table;

        // Then
        await expectNoHorizontalScroll(facilitator.page);
        await expectNoHorizontalScroll(anna.page);
        const form = storyForm(facilitator.page);
        await expectWithinWidth(form.getByLabel('Title'), viewport.width);
        await expectWithinWidth(form.getByLabel('Link'), viewport.width);
        await expectWithinWidth(form.getByRole('button', { name: 'Start voting' }), viewport.width);
        await expectWithinWidth(anna.page.getByText(WAITING_MESSAGE), viewport.width);
        await expectAllCardsWithinWidth(anna.page, viewport.width);

        // When
        await setStory(facilitator.page, longTitle, longLink);
        await expect(storyRegion(anna.page)).toContainText(longTitle);

        // Then
        for (const { page } of [facilitator, anna]) {
          await expectNoHorizontalScroll(page);
          await expectWithinWidth(storyRegion(page), viewport.width);
          await expectWithinWidth(storyRegion(page).getByRole('link'), viewport.width);
        }
        await expectWithinWidth(
          facilitator.page.getByRole('button', { name: 'Edit story' }),
          viewport.width,
        );
        await expectAllCardsWithinWidth(anna.page, viewport.width);
        await expectWithinWidth(withdrawButton(anna.page), viewport.width);

        // When
        await vote(anna, '13');

        // Then
        await expect(withdrawButton(anna.page)).toBeEnabled();
        await expectVoteStatus(facilitator.page, 'Anna', true);
        await expectNoHorizontalScroll(anna.page);
        await expectNoHorizontalScroll(facilitator.page);

        // When
        await withdrawButton(anna.page).click();

        // Then
        await expect(checkedCards(anna.page)).toHaveCount(0);
        await expectVoteStatus(facilitator.page, 'Anna', false);
        await expectWithinWidth(withdrawButton(anna.page), viewport.width);
      });

      test(`every card and Withdraw vote are at least 44x44 at ${label}`, async ({ browser }) => {
        // Given
        const table = await newTable(browser, { viewport });
        const { page } = table.anna;
        await startVoting(table);
        await expect(allCards(page)).toHaveCount(CARD_LABELS.length);

        // Then
        for (const name of CARD_LABELS) {
          await expectMinTarget(cardTarget(page, name), `card "${name}" label`);
          await expectMinTarget(cardFace(page, name), `card "${name}" face`);
        }
        await expectMinTarget(withdrawButton(page), 'Withdraw vote');
      });

      test(`keyboard focus on a card and Withdraw vote is visible at ${label}`, async ({
        browser,
      }) => {
        // Given
        const table = await newTable(browser, { viewport });
        const { page } = table.anna;
        await startVoting(table);
        await expect(allCards(page)).toHaveCount(CARD_LABELS.length);

        // When
        await tabTo(page, card(page, '0'));
        await page.keyboard.press('Space');
        await expect(card(page, '0')).toBeChecked();
        const cardBefore = await focusStyle(cardFace(page, '1'));
        const withdrawBefore = await focusStyle(withdrawButton(page));
        await page.keyboard.press('ArrowRight');

        // Then
        await expect(card(page, '1')).toBeFocused();
        expectFocusIndicator(cardBefore, await focusStyle(cardFace(page, '1')), 'focused card "1"');

        // When
        await page.keyboard.press('Tab');

        // Then
        await expect(withdrawButton(page)).toBeFocused();
        expectFocusIndicator(
          withdrawBefore,
          await focusStyle(withdrawButton(page)),
          'focused Withdraw vote',
        );
      });
    }
  });

  test.describe('Accessibility', () => {
    test('facilitator story form with an error has no accessibility violations', async ({
      browser,
    }) => {
      // Given
      const { facilitator } = await newTable(browser);
      await storyForm(facilitator.page).getByRole('button', { name: 'Start voting' }).click();
      await expect(storyForm(facilitator.page).getByText(TITLE_ERROR)).toBeVisible();

      // When
      const results = await new AxeBuilder({ page: facilitator.page })
        .withTags(WCAG_TAGS)
        .analyze();

      // Then
      expect(results.violations).toEqual([]);
    });

    test('voter waiting view has no accessibility violations', async ({ browser }) => {
      // Given
      const { anna } = await newTable(browser);
      await expect(anna.page.getByText(WAITING_MESSAGE)).toBeVisible();

      // When
      const results = await new AxeBuilder({ page: anna.page }).withTags(WCAG_TAGS).analyze();

      // Then
      expect(results.violations).toEqual([]);
    });

    test('voter deck with a selection has no accessibility violations', async ({ browser }) => {
      // Given
      const table = await newTable(browser);
      await startVoting(table, 'Login page', `${baseURL}/story-link-fixture`);
      await vote(table.anna, '8');

      // When
      const results = await new AxeBuilder({ page: table.anna.page }).withTags(WCAG_TAGS).analyze();

      // Then
      expect(results.violations).toEqual([]);
    });

    test('facilitator voting view with badges has no accessibility violations', async ({
      browser,
    }) => {
      // Given
      const table = await newTable(browser);
      await startVoting(table, 'Login page', `${baseURL}/story-link-fixture`);
      await vote(table.anna, '8');
      await expectVoteStatus(table.facilitator.page, 'Anna', true);
      await expectVoteStatus(table.facilitator.page, 'Bob', false);

      // When
      const results = await new AxeBuilder({ page: table.facilitator.page })
        .withTags(WCAG_TAGS)
        .analyze();

      // Then
      expect(results.violations).toEqual([]);
    });
  });

  test('story and voting pages load without console errors or CSP violations', async ({
    browser,
  }) => {
    // Given
    const table = await newTable(browser);
    const { facilitator, anna, bob } = table;

    // When
    await startVoting(table, 'Login page', `${baseURL}/story-link-fixture`);
    await vote(anna, '8');
    await vote(bob, '?');
    await withdrawButton(anna.page).click();
    await expect(checkedCards(anna.page)).toHaveCount(0);
    await editStory(facilitator.page, 'Checkout page');
    await expect(storyRegion(bob.page)).toContainText('Checkout page');
    await expectVoteStatus(facilitator.page, 'Bob', true);

    // Then
    for (const { page, errors } of [facilitator, anna, bob]) {
      expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
      expect(errors).toEqual([]);
    }
  });
});
