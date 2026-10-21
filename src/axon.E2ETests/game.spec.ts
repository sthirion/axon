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

const NAME_TAKEN_MESSAGE = 'That name is already taken in this game. Choose another.';
const XSS_NAME = '<img src=x onerror=alert(1)>';
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface Player {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly errors: string[];
}

test.describe('Create and join a game @TEST', () => {
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
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, errors };
  }

  async function createGame(page: Page, name: string): Promise<string> {
    await page.goto('/');
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Create game' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
    const match = /\/g\/([A-Za-z0-9_-]{22})$/.exec(new URL(page.url()).pathname);
    expect(match).not.toBeNull();
    return match![1];
  }

  async function openJoinPrompt(page: Page, gameId: string): Promise<void> {
    await page.goto(`/g/${gameId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Join game' })).toBeVisible();
  }

  async function submitName(page: Page, name: string): Promise<void> {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
  }

  async function joinGame(page: Page, gameId: string, name: string): Promise<void> {
    await openJoinPrompt(page, gameId);
    await submitName(page, name);
    await expect(page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
  }

  const voterRows = (page: Page): Locator =>
    page.getByRole('region', { name: 'Voters' }).getByRole('listitem');
  const facilitatorRegion = (page: Page): Locator =>
    page.getByRole('region', { name: 'Facilitator' });

  async function readToken(page: Page, gameId: string): Promise<string | null> {
    return page.evaluate((id) => localStorage.getItem(`axon.playerToken.${id}`), gameId);
  }

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

  async function tabTo(page: Page, target: Locator, maxTabs = 10): Promise<void> {
    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((element) => element === document.activeElement)) return;
    }
    await expect(target).toBeFocused();
  }

  const copiedStatus = (page: Page): Locator =>
    page.getByRole('status').filter({ hasText: 'Link copied' });

  test('facilitator creates a game and sees the table with the join link', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);

    // When
    const gameId = await createGame(facilitator.page, 'Sven');

    // Then
    const joinLinkRegion = facilitator.page.getByRole('region', { name: 'Join link' });
    await expect(facilitatorRegion(facilitator.page)).toContainText('Sven');
    await expect(facilitatorRegion(facilitator.page)).toContainText('online');
    await expect(joinLinkRegion.getByText(`${baseURL}/g/${gameId}`)).toBeVisible();
    await expect(
      facilitator.page.getByText('No voters yet. Share the link to invite your team.'),
    ).toBeVisible();
  });

  test('two voters join in separate browsers and all three see each other', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const anna = await newPlayer(browser);
    const ben = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');

    // When
    await joinGame(anna.page, gameId, 'Anna');
    await joinGame(ben.page, gameId, 'Ben');

    // Then
    for (const { page } of [facilitator, anna, ben]) {
      await expect(voterRows(page)).toHaveCount(2);
      await expect(voterRows(page).nth(0)).toContainText('Anna');
      await expect(voterRows(page).nth(0)).toContainText('online');
      await expect(voterRows(page).nth(1)).toContainText('Ben');
      await expect(voterRows(page).nth(1)).toContainText('online');
      await expect(facilitatorRegion(page)).toContainText('Sven');
      await expect(facilitatorRegion(page)).toContainText('online');
    }
  });

  test('visitor opening a game link is asked for a name and sees no account fields', async ({
    browser,
  }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const visitor = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');

    // When
    await openJoinPrompt(visitor.page, gameId);

    // Then
    await expect(visitor.page.getByLabel('Your name')).toBeVisible();
    await expect(visitor.page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(visitor.page.locator('input[type=email], input[type=password]')).toHaveCount(0);
    await expect(voterRows(facilitator.page)).toHaveCount(0);
  });

  test('a name already taken is rejected case-insensitively and a retry succeeds', async ({
    browser,
  }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const anna = await newPlayer(browser);
    const second = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');
    await joinGame(anna.page, gameId, 'Anna');
    await openJoinPrompt(second.page, gameId);

    // When
    await submitName(second.page, 'anna');

    // Then
    await expect(second.page.getByText(NAME_TAKEN_MESSAGE)).toBeVisible();
    await expect(second.page.getByLabel('Your name')).toHaveValue('anna');
    await expect(voterRows(facilitator.page)).toHaveCount(1);

    // When
    await submitName(second.page, 'Anna B');

    // Then
    await expect(second.page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
    await expect(voterRows(facilitator.page)).toHaveCount(2);
    await expect(voterRows(facilitator.page).nth(1)).toContainText('Anna B');
  });

  test('the facilitator name is also taken for voters', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const visitor = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');
    await openJoinPrompt(visitor.page, gameId);

    // When
    await submitName(visitor.page, 'sven');

    // Then
    await expect(visitor.page.getByText(NAME_TAKEN_MESSAGE)).toBeVisible();
    await expect(visitor.page.getByRole('heading', { level: 1, name: 'Join game' })).toBeVisible();
  });

  test('an empty name on the create page shows a validation message and creates nothing', async ({
    browser,
  }) => {
    // Given
    const facilitator = await newPlayer(browser);
    let createRequests = 0;
    facilitator.page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/games')) createRequests++;
    });
    await facilitator.page.goto('/');

    // When
    await facilitator.page.getByLabel('Your name').fill('   ');
    await facilitator.page.getByRole('button', { name: 'Create game' }).click();

    // Then
    await expect(facilitator.page.getByText('Enter a name of 1 to 30 characters.')).toBeVisible();
    await expect(facilitator.page.getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true');
    await expect(facilitator.page.getByLabel('Your name')).toBeFocused();
    expect(createRequests).toBe(0);
  });

  test('a voter reloading the page keeps the seat', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const anna = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');
    await joinGame(anna.page, gameId, 'Anna');
    await expect(voterRows(facilitator.page)).toHaveCount(1);

    // When
    await anna.page.reload();

    // Then
    await expect(anna.page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
    await expect(anna.page.getByRole('heading', { name: 'Join game' })).toHaveCount(0);
    await expect(voterRows(anna.page)).toHaveCount(1);
    await expect(voterRows(anna.page).first()).toContainText('Anna');
    await expect(voterRows(anna.page).first()).toContainText('online');
    await expect(voterRows(facilitator.page)).toHaveCount(1);
    await expect(voterRows(facilitator.page).first()).toContainText('online');
  });

  test('the facilitator reloading the page keeps the facilitator role', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');

    // When
    await facilitator.page.reload();

    // Then
    await expect(
      facilitator.page.getByRole('heading', { level: 1, name: 'Game table' }),
    ).toBeVisible();
    await expect(facilitatorRegion(facilitator.page)).toContainText('Sven');
    await expect(facilitatorRegion(facilitator.page)).toContainText('online');
    await expect(voterRows(facilitator.page)).toHaveCount(0);
    expect(new URL(facilitator.page.url()).pathname).toBe(`/g/${gameId}`);
  });

  test('closing a voter browser shows the voter offline to the others', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const anna = await newPlayer(browser);
    const ben = await newPlayer(browser);
    const gameId = await createGame(facilitator.page, 'Sven');
    await joinGame(anna.page, gameId, 'Anna');
    await joinGame(ben.page, gameId, 'Ben');
    await expect(voterRows(facilitator.page).nth(0)).toContainText('online');

    // When
    await anna.context.close();

    // Then
    for (const { page } of [facilitator, ben]) {
      await expect(voterRows(page)).toHaveCount(2);
      await expect(voterRows(page).nth(0)).toContainText('Anna');
      await expect(voterRows(page).nth(0)).toContainText('offline');
      await expect(voterRows(page).nth(1)).toContainText('online');
    }
  });

  test('copy link confirms with a status message and puts the link on the clipboard', async ({
    browser,
  }) => {
    // Given
    const facilitator = await newPlayer(browser, {
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const gameId = await createGame(facilitator.page, 'Sven');

    // When
    await facilitator.page.getByRole('button', { name: 'Copy link' }).click();

    // Then
    await expect(
      facilitator.page.getByRole('status').filter({ hasText: 'Link copied' }),
    ).toBeVisible();
    const clipboard = await facilitator.page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(`${baseURL}/g/${gameId}`);
  });

  test('a player name with HTML is shown as literal text for everyone', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const visitor = await newPlayer(browser);
    const dialogs: string[] = [];
    for (const { page } of [facilitator, visitor]) {
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
    }
    const gameId = await createGame(facilitator.page, 'Sven');

    // When
    await joinGame(visitor.page, gameId, XSS_NAME);

    // Then
    for (const { page } of [facilitator, visitor]) {
      await expect(voterRows(page)).toHaveCount(1);
      await expect(voterRows(page).first()).toContainText(XSS_NAME);
      await expect(page.locator('img')).toHaveCount(0);
    }
    expect(dialogs).toEqual([]);
  });

  test('the player token is stored locally and never appears in a URL', async ({ browser }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const anna = await newPlayer(browser);

    // When
    const gameId = await createGame(facilitator.page, 'Sven');
    await joinGame(anna.page, gameId, 'Anna');

    // Then
    for (const { page } of [facilitator, anna]) {
      const token = await readToken(page, gameId);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(page.url()).not.toContain(token!);
      await expect(page.getByRole('region', { name: 'Join link' })).not.toContainText(token!);
    }
    const [facilitatorToken, annaToken] = await Promise.all([
      readToken(facilitator.page, gameId),
      readToken(anna.page, gameId),
    ]);
    expect(facilitatorToken).not.toBe(annaToken);
  });

  test('create, join and table pages load without console errors or CSP violations', async ({
    browser,
  }) => {
    // Given
    const facilitator = await newPlayer(browser);
    const anna = await newPlayer(browser);

    // When
    await facilitator.page.goto('/');
    await expect(facilitator.page.getByRole('heading', { level: 1, name: 'Axon' })).toBeVisible();
    const gameId = await createGame(facilitator.page, 'Sven');
    await openJoinPrompt(anna.page, gameId);
    await submitName(anna.page, 'sven');
    await expect(anna.page.getByText(NAME_TAKEN_MESSAGE)).toBeVisible();
    await submitName(anna.page, 'Anna');
    await expect(anna.page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
    await expect(voterRows(facilitator.page)).toHaveCount(1);

    // Then
    for (const { page, errors } of [facilitator, anna]) {
      expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
      expect(errors).toEqual([]);
    }
  });

  test('a game link that does not resolve shows the game-not-found view', async ({ browser }) => {
    // Given
    const visitor = await newPlayer(browser);

    // When
    await visitor.page.goto('/g/AAAAAAAAAAAAAAAAAAAAAA');

    // Then
    await expect(
      visitor.page.getByRole('heading', { level: 1, name: 'Game not found' }),
    ).toBeVisible();
    await expect(visitor.page.getByText('This game does not exist or has ended.')).toBeVisible();
    await expect(visitor.page.getByRole('link', { name: 'Create a new game' })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(visitor.page.getByLabel('Your name')).toHaveCount(0);
  });

  test.describe('Keyboard only', () => {
    test('facilitator creates a game and copies the link with Enter and Space', async ({
      browser,
    }) => {
      // Given
      const facilitator = await newPlayer(browser, {
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const { page } = facilitator;
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Axon' })).toBeVisible();

      // When
      await tabTo(page, page.getByLabel('Your name'));
      await expect(page.getByLabel('Your name')).toBeFocused();
      await page.keyboard.type('Sven');
      await page.keyboard.press('Enter');

      // Then
      await expect(page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
      await expect(facilitatorRegion(page)).toContainText('Sven');
      const gameId = /\/g\/([A-Za-z0-9_-]{22})$/.exec(new URL(page.url()).pathname)?.[1];
      expect(gameId).toBeDefined();
      const link = `${baseURL}/g/${gameId}`;

      // When
      const copyButton = page.getByRole('button', { name: 'Copy link' });
      await tabTo(page, copyButton);
      await expect(copyButton).toBeFocused();
      await page.keyboard.press('Enter');

      // Then
      await expect(copiedStatus(page)).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

      // When
      await page.evaluate(() => navigator.clipboard.writeText('placeholder'));
      await expect(copyButton).toBeFocused();
      await page.keyboard.press('Space');

      // Then
      await expect(copyButton).toBeFocused();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await expect(copiedStatus(page)).toBeVisible();
    });

    test('voter joins from the link with the keyboard only', async ({ browser }) => {
      // Given
      const facilitator = await newPlayer(browser);
      const voter = await newPlayer(browser);
      const gameId = await createGame(facilitator.page, 'Sven');
      await openJoinPrompt(voter.page, gameId);

      // When
      await tabTo(voter.page, voter.page.getByLabel('Your name'));
      await expect(voter.page.getByLabel('Your name')).toBeFocused();
      await voter.page.keyboard.type('Anna');
      await voter.page.keyboard.press('Enter');

      // Then
      await expect(voter.page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
      await expect(voterRows(voter.page)).toHaveCount(1);
      await expect(voterRows(voter.page).first()).toContainText('Anna');
      await expect(voterRows(facilitator.page)).toHaveCount(1);
      await expect(voterRows(facilitator.page).first()).toContainText('Anna');
    });

    test('submitting an empty name with Enter returns focus to the name field', async ({
      browser,
    }) => {
      // Given
      const facilitator = await newPlayer(browser);
      const host = await newPlayer(browser);
      const visitor = await newPlayer(browser);
      const { page } = facilitator;
      await page.goto('/');
      await tabTo(page, page.getByLabel('Your name'));

      // When
      await page.keyboard.press('Enter');

      // Then
      await expect(page.getByText('Enter a name of 1 to 30 characters.')).toBeVisible();
      await expect(page.getByLabel('Your name')).toBeFocused();

      // Given
      const gameId = await createGame(host.page, 'Sven');
      await openJoinPrompt(visitor.page, gameId);
      await tabTo(visitor.page, visitor.page.getByLabel('Your name'));

      // When
      await visitor.page.keyboard.press('Enter');

      // Then
      await expect(visitor.page.getByText('Enter a name of 1 to 30 characters.')).toBeVisible();
      await expect(visitor.page.getByLabel('Your name')).toBeFocused();
    });
  });

  test.describe('Responsive', () => {
    test('mobile user creates a game, copies the link and a voter joins at 390x844', async ({
      browser,
    }) => {
      // Given
      const facilitator = await newPlayer(browser, {
        viewport: MOBILE,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const voter = await newPlayer(browser, { viewport: MOBILE });
      const { page } = facilitator;

      // When
      const gameId = await createGame(page, 'Sven');
      await page.getByRole('button', { name: 'Copy link' }).click();

      // Then
      await expect(copiedStatus(page)).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `${baseURL}/g/${gameId}`,
      );
      await expectNoHorizontalScroll(page);

      // When
      await openJoinPrompt(voter.page, gameId);
      await submitName(voter.page, 'Anna');

      // Then
      await expect(voter.page.getByRole('heading', { level: 1, name: 'Game table' })).toBeVisible();
      await expect(voterRows(voter.page).first()).toContainText('Anna');
      await expect(voterRows(page)).toHaveCount(1);
      await expect(voterRows(page).first()).toContainText('Anna');
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScroll(voter.page);
    });

    for (const viewport of [DESKTOP, MOBILE]) {
      const label = `${viewport.width}x${viewport.height}`;

      test(`create page fits the ${label} viewport`, async ({ browser }) => {
        // Given
        const { page } = await newPlayer(browser, { viewport });

        // When
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: 'Axon' })).toBeVisible();

        // Then
        await expectNoHorizontalScroll(page);
        await expectWithinWidth(page.getByLabel('Your name'), viewport.width);
        await expectWithinWidth(page.getByRole('button', { name: 'Create game' }), viewport.width);
      });

      test(`join prompt fits the ${label} viewport`, async ({ browser }) => {
        // Given
        const facilitator = await newPlayer(browser);
        const visitor = await newPlayer(browser, { viewport });
        const gameId = await createGame(facilitator.page, 'Sven');

        // When
        await openJoinPrompt(visitor.page, gameId);

        // Then
        await expectNoHorizontalScroll(visitor.page);
        await expectWithinWidth(visitor.page.getByLabel('Your name'), viewport.width);
        await expectWithinWidth(visitor.page.getByRole('button', { name: 'Join' }), viewport.width);
      });

      test(`game table with long names fits the ${label} viewport`, async ({ browser }) => {
        // Given
        const longName = 'W'.repeat(30);
        const facilitator = await newPlayer(browser, { viewport });
        const anna = await newPlayer(browser);
        const ben = await newPlayer(browser);
        const gameId = await createGame(facilitator.page, longName);

        // When
        await joinGame(anna.page, gameId, 'M'.repeat(30));
        await joinGame(ben.page, gameId, 'Ben');
        await expect(voterRows(facilitator.page)).toHaveCount(2);

        // Then
        const page = facilitator.page;
        await expectNoHorizontalScroll(page);
        await expectWithinWidth(page.getByRole('button', { name: 'Copy link' }), viewport.width);
        await expectWithinWidth(
          page.getByRole('region', { name: 'Join link' }).getByText(`${baseURL}/g/${gameId}`),
          viewport.width,
        );
        await expectWithinWidth(facilitatorRegion(page), viewport.width);
        await expectWithinWidth(voterRows(page).nth(0), viewport.width);
        await expectWithinWidth(voterRows(page).nth(1), viewport.width);
      });
    }
  });

  test.describe('Accessibility', () => {
    test('create page has no accessibility violations', async ({ browser }) => {
      // Given
      const { page } = await newPlayer(browser);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Axon' })).toBeVisible();

      // When
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      // Then
      expect(results.violations).toEqual([]);
    });

    test('join prompt with an error has no accessibility violations', async ({ browser }) => {
      // Given
      const facilitator = await newPlayer(browser);
      const visitor = await newPlayer(browser);
      const gameId = await createGame(facilitator.page, 'Sven');
      await openJoinPrompt(visitor.page, gameId);
      await submitName(visitor.page, 'SVEN');
      await expect(visitor.page.getByText(NAME_TAKEN_MESSAGE)).toBeVisible();

      // When
      const results = await new AxeBuilder({ page: visitor.page }).withTags(WCAG_TAGS).analyze();

      // Then
      expect(results.violations).toEqual([]);
    });

    test('game table with voters has no accessibility violations', async ({ browser }) => {
      // Given
      const facilitator = await newPlayer(browser);
      const anna = await newPlayer(browser);
      const ben = await newPlayer(browser);
      const gameId = await createGame(facilitator.page, 'Sven');
      await joinGame(anna.page, gameId, 'Anna');
      await joinGame(ben.page, gameId, 'Ben');
      await expect(voterRows(facilitator.page)).toHaveCount(2);
      await anna.context.close();
      await expect(voterRows(facilitator.page).nth(0)).toContainText('offline');

      // When
      const results = await new AxeBuilder({ page: facilitator.page })
        .withTags(WCAG_TAGS)
        .analyze();

      // Then
      expect(results.violations).toEqual([]);
    });

    test('game-not-found view has no accessibility violations', async ({ browser }) => {
      // Given
      const { page } = await newPlayer(browser);
      await page.goto('/g/abc123');
      await expect(page.getByRole('heading', { level: 1, name: 'Game not found' })).toBeVisible();

      // When
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      // Then
      expect(results.violations).toEqual([]);
    });
  });
});
