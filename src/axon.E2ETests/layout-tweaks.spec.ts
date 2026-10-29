import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

type Theme = 'light' | 'dark';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const LINK = 'https://example.com/story';
const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const radio = (page: Page, value: string): Locator =>
  page.locator(`input[type=radio][value="${value}"]`);

test.describe('Header join link, recommended mark, controls beside the estimate @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3100';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  async function newPage(
    browser: Browser,
    theme: Theme,
    viewport: { width: number; height: number },
  ) {
    const context = await browser.newContext({
      baseURL,
      colorScheme: theme,
      viewport,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    contexts.push(context);
    return context.newPage();
  }

  async function aRevealedSession(
    browser: Browser,
    theme: Theme = 'light',
    viewport = VIEWPORTS[2]!,
  ) {
    const fac = await newPage(browser, theme, viewport);
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Fran');
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    const gameId = new URL(fac.url()).pathname.split('/').pop()!;
    const join = async (name: string) => {
      const page = await newPage(browser, theme, viewport);
      await page.goto(fac.url());
      await page.getByLabel('Your name').fill(name);
      await button(page, 'Join').click();
      await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
      return page;
    };
    const anna = await join('Anna');
    const bob = await join('Bob');
    await expect(region(fac, 'Voters').getByRole('listitem')).toHaveCount(2);
    const form = fac.getByRole('form', { name: 'Story' });
    await form.getByLabel('Title').fill('Login page');
    await form.getByLabel('Link').fill(LINK);
    await form.getByRole('button', { name: 'Start voting' }).click();
    await expect(radio(anna, '5')).toBeEnabled();
    return { fac, anna, bob, gameId };
  }

  async function vote(page: Page, value: string) {
    await radio(page, value).locator('xpath=ancestor::label').click();
    await expect(radio(page, value)).toBeChecked();
  }

  async function reveal(s: Awaited<ReturnType<typeof aRevealedSession>>, a: string, b: string) {
    await vote(s.anna, a);
    await vote(s.bob, b);
    await button(s.fac, 'Reveal votes').click();
    await expect(region(s.fac, 'Results')).toBeVisible();
  }

  test('the facilitator header shows only Copy link, which copies the full link', async ({
    browser,
  }) => {
    const { fac, gameId } = await aRevealedSession(browser);

    const header = fac.getByRole('banner');
    await expect(header).not.toContainText(gameId);
    await expect(header).not.toContainText('http');
    await expect(fac.getByRole('region', { name: 'Join link' })).toHaveCount(0);
    await expect(fac.getByRole('heading', { name: 'Join link' })).toHaveCount(0);
    await button(fac, 'Copy link').click();
    await expect(fac.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
    expect(await fac.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/g/${gameId}`);
  });

  test('a voter sees neither the session id nor Copy link, and no join link panel', async ({
    browser,
  }) => {
    const { anna, bob, gameId } = await aRevealedSession(browser);

    for (const page of [anna, bob]) {
      await expect(button(page, 'Copy link')).toHaveCount(0);
      await expect(page.getByRole('banner')).not.toContainText(gameId);
      await expect(page.getByRole('region', { name: 'Join link' })).toHaveCount(0);
    }
  });

  test('the join prompt and the create page have no join link in the header', async ({
    browser,
  }) => {
    const { fac } = await aRevealedSession(browser);
    const stranger = await newPage(browser, 'light', VIEWPORTS[2]!);

    await stranger.goto(fac.url());

    await expect(stranger.getByRole('heading', { name: 'Join session' })).toBeVisible();
    await expect(button(stranger, 'Copy link')).toHaveCount(0);
  });

  test('the recommended vote has a check mark with a text alternative, and only that one', async ({
    browser,
  }) => {
    const s = await aRevealedSession(browser);
    await reveal(s, '5', '5');

    const results = region(s.anna, 'Results');
    const rows = results.getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Recommended');
    await expect(rows.first().locator('[aria-hidden="true"]', { hasText: '✓' })).toHaveCount(1);
  });

  test('with differing votes only the suggested card is marked', async ({ browser }) => {
    const s = await aRevealedSession(browser);
    await reveal(s, '3', '5'); // average 4: the tie goes to the higher card

    const rows = region(s.bob, 'Results').getByRole('listitem');
    await expect(rows).toHaveCount(2);
    const marked = await rows.evaluateAll((items) =>
      items.map((item) => (item.textContent ?? '').includes('Recommended')),
    );
    expect(marked.filter(Boolean)).toHaveLength(1);
    const suggested = await s.fac.getByLabel('Final estimate').inputValue();
    const markedRow = rows.filter({ hasText: 'Recommended' });
    await expect(markedRow).toContainText(suggested);
  });

  test('Record estimate, Re-vote and Skip story sit to the right of the select on a wide screen', async ({
    browser,
  }) => {
    const s = await aRevealedSession(browser);
    await reveal(s, '3', '5');

    const select = (await s.fac.getByLabel('Final estimate').boundingBox())!;
    const boxes = await Promise.all(
      ['Record estimate', 'Re-vote', 'Skip story'].map(
        async (name) => (await button(s.fac, name).boundingBox())!,
      ),
    );

    let right = select.x + select.width;
    for (const box of boxes) {
      expect(box.x, 'to the right of the previous control').toBeGreaterThanOrEqual(right);
      expect(Math.abs(box.y - select.y), 'same top edge as the select').toBeLessThan(2);
      right = box.x + box.width;
    }
    expect(boxes[0]!.x - (select.x + select.width)).toBeGreaterThanOrEqual(8);
  });

  test('the controls wrap below the select on a phone without overflow', async ({ browser }) => {
    const s = await aRevealedSession(browser, 'light', VIEWPORTS[0]!);
    await reveal(s, '3', '5');

    const select = (await s.fac.getByLabel('Final estimate').boundingBox())!;
    const skip = (await button(s.fac, 'Skip story').boundingBox())!;

    expect(skip.y).toBeGreaterThan(select.y);
    expect(
      await s.fac.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });

  test('the controls still work: record an estimate from the new row', async ({ browser }) => {
    const s = await aRevealedSession(browser);
    await reveal(s, '3', '5');

    await s.fac.getByLabel('Final estimate').selectOption('5');
    await button(s.fac, 'Record estimate').click();

    await expect(region(s.bob, 'Summary')).toContainText('Login page');
  });

  for (const viewport of VIEWPORTS) {
    test(`nothing overflows and targets stay 44 px at ${viewport.width}x${viewport.height}`, async ({
      browser,
    }) => {
      const s = await aRevealedSession(browser, 'light', viewport);
      await reveal(s, '3', '13');

      for (const page of [s.fac, s.anna]) {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(0);
      }
      for (const name of ['Copy link', 'Record estimate', 'Re-vote', 'Skip story']) {
        const box = (await button(s.fac, name).boundingBox())!;
        expect(box.height, name).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, name).toBeLessThanOrEqual(viewport.width);
      }
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations with the header link and the check mark (${theme})`, async ({
      browser,
    }) => {
      const s = await aRevealedSession(browser, theme);
      await reveal(s, '3', '13');
      await s.fac.waitForTimeout(900);

      for (const page of [s.fac, s.anna]) {
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
      }
    });
  }

  test('Edit story, Skip story and Reveal votes share one row with the same top edge, Reveal set apart', async ({
    browser,
  }) => {
    const { fac } = await aRevealedSession(browser);

    const [edit, skip, reveal] = await Promise.all(
      ['Edit story', 'Skip story', 'Reveal votes'].map(
        async (name) => (await button(fac, name).boundingBox())!,
      ),
    );

    expect(Math.abs(edit!.y - skip!.y)).toBeLessThan(2);
    expect(Math.abs(skip!.y - reveal!.y)).toBeLessThan(2);
    expect(skip!.x).toBeGreaterThan(edit!.x + edit!.width);
    expect(reveal!.x).toBeGreaterThan(skip!.x + skip!.width);
    // a bit more room before Reveal than between Edit and Skip
    expect(reveal!.x - (skip!.x + skip!.width)).toBeGreaterThan(skip!.x - (edit!.x + edit!.width));
    await expect(region(fac, 'Story').getByRole('button', { name: 'Reveal votes' })).toBeVisible();
    await expect(region(fac, 'Round controls')).toHaveCount(0);
  });

  test('Copy link shows a check mark instead of text, which fades and is gone after 5 seconds', async ({
    browser,
  }) => {
    const { fac } = await aRevealedSession(browser);
    const header = fac.getByRole('banner');
    const check = header.getByText('✓');

    await button(fac, 'Copy link').click();

    await expect(check).toBeVisible();
    await expect(header.getByText('Link copied')).toHaveClass(/sr-only/);
    expect(await check.evaluate((el) => getComputedStyle(el).animationName)).toBe('fade-out');
    await fac.waitForTimeout(3000);
    expect(Number(await check.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
    await fac.waitForTimeout(1500);
    expect(Number(await check.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
    await expect(check).toHaveCount(0, { timeout: 2500 });
    await expect(header.getByRole('status')).toBeEmpty();
  });

  test('with reduced motion the check mark does not fade but still goes away', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL,
      reducedMotion: 'reduce',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto('/');
    await page.getByLabel('Your name').fill('Fran');
    await button(page, 'Create session').click();
    const check = page.getByRole('banner').getByText('✓');

    await button(page, 'Copy link').click();

    await expect(check).toBeVisible();
    expect(await check.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(check).toHaveCount(0, { timeout: 7000 });
  });

  test('everything in a voter row shares one vertical centre: name, card, status and buttons', async ({
    browser,
  }) => {
    const s = await aRevealedSession(browser);
    await vote(s.anna, '3');
    await expect(region(s.fac, 'Voters').getByRole('listitem').first()).toContainText('Voted');
    await s.fac.waitForTimeout(400); // the card back has dealt in

    const centres = async (page: Page, row: Locator) => {
      const parts = [
        row.locator('.type-name'),
        row.locator('span[class*="h-[45px]"]'),
        row.getByText(/Voted|Not voted|Vote: /).first(),
        row.getByText('online'),
        row.getByRole('button', { name: /^Remove/ }),
      ];
      const found: number[] = [];
      for (const part of parts) {
        if ((await part.count()) === 0) continue;
        const box = (await part.first().boundingBox())!;
        found.push(box.y + box.height / 2);
      }
      return found;
    };
    // Fonts differ between machines, so a row may wrap; parts on the same line must agree.
    const expectCentred = (values: number[]) => {
      expect(values.length).toBeGreaterThanOrEqual(4);
      const sorted = [...values].sort((x, y) => x - y);
      const lines: number[][] = [[sorted[0]!]];
      for (const value of sorted.slice(1)) {
        const line = lines[lines.length - 1]!;
        if (value - line[line.length - 1]! > 20) lines.push([value]);
        else line.push(value);
      }
      for (const line of lines) {
        expect(Math.max(...line) - Math.min(...line)).toBeLessThan(1);
      }
    };
    const checkRows = async () => {
      const rows = region(s.fac, 'Voters').getByRole('listitem');
      for (let i = 0; i < (await rows.count()); i++) {
        expectCentred(await centres(s.fac, rows.nth(i)));
      }
    };
    await checkRows();
    await vote(s.bob, '5');
    await button(s.fac, 'Reveal votes').click();
    await expect(region(s.fac, 'Results')).toBeVisible();
    await s.fac.waitForTimeout(900);
    await checkRows();
  });
});
