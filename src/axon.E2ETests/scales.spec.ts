import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

type Scale = 'fibonacci' | 'incremental' | 'tshirt';
type Theme = 'light' | 'dark';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const LABELS: Record<Scale, string> = {
  fibonacci: 'Fibonacci',
  incremental: 'Incremental',
  tshirt: 'T-shirt sizes',
};
const DECKS: Record<Scale, string[]> = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21', '?', 'coffee'],
  incremental: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '?', 'coffee'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', '?', 'coffee'],
};
const ESTIMATES: Record<Scale, string[]> = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21'],
  incremental: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL'],
};

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const card = (page: Page, value: string): Locator =>
  page.locator(`input[type=radio][value="${value}"]`);
const label = (page: Page, value: string): Locator =>
  card(page, value).locator('xpath=ancestor::label');
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const scaleRadio = (page: Page, scale: Scale): Locator =>
  page.getByRole('radio', { name: new RegExp(LABELS[scale]) });
const deckValues = (page: Page): Promise<string[]> =>
  page
    .getByRole('radiogroup', { name: 'Your vote' })
    .locator('input')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test.describe('Voting scales @TEST', () => {
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
    theme: Theme = 'light',
    viewport = { width: 1280, height: 800 },
  ) {
    const context = await browser.newContext({ baseURL, colorScheme: theme, viewport });
    contexts.push(context);
    return context.newPage();
  }

  interface Session {
    readonly fac: Page;
    readonly anna: Page;
    readonly bob: Page;
    readonly all: Page[];
  }

  // Creates a session with the chosen scale (undefined leaves the default) and two voters.
  async function aSession(
    browser: Browser,
    scale?: Scale,
    theme: Theme = 'light',
    viewport = { width: 1280, height: 800 },
  ): Promise<Session> {
    const fac = await newPage(browser, theme, viewport);
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Sven');
    if (scale) await scaleRadio(fac, scale).check();
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
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
    return { fac, anna, bob, all: [fac, anna, bob] };
  }

  async function startStory(s: Session, title = 'Login page'): Promise<void> {
    const form = s.fac.getByRole('form', { name: 'Story' });
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Link').fill('https://example.com/story');
    await form.getByRole('button', { name: 'Start voting' }).click();
    for (const page of s.all) await expect(region(page, 'Story')).toContainText(title);
  }

  async function vote(page: Page, value: string): Promise<void> {
    await label(page, value).click();
    await expect(card(page, value)).toBeChecked();
  }

  test.describe('Choosing the scale', () => {
    test('the create page offers three scales with Fibonacci selected and the deck described', async ({
      browser,
    }) => {
      const page = await newPage(browser);
      await page.goto('/');

      await expect(page.getByRole('group', { name: 'Voting scale' })).toBeVisible();
      await expect(scaleRadio(page, 'fibonacci')).toBeChecked();
      await expect(page.getByRole('radio')).toHaveCount(3);
      await expect(page.getByText('1, 2, 3, 5, 8, 13, 21')).toBeVisible();
      await expect(page.getByText('1 to 10')).toBeVisible();
      await expect(page.getByText('XS, S, M, L, XL')).toBeVisible();
    });

    test('the scales can be chosen with the keyboard', async ({ browser }) => {
      const page = await newPage(browser);
      await page.goto('/');
      await scaleRadio(page, 'fibonacci').focus();

      await page.keyboard.press('ArrowDown');
      await expect(scaleRadio(page, 'incremental')).toBeChecked();
      await page.keyboard.press('ArrowDown');
      await expect(scaleRadio(page, 'tshirt')).toBeChecked();
      await page.keyboard.press('ArrowUp');
      await expect(scaleRadio(page, 'incremental')).toBeChecked();
    });

    for (const scale of ['fibonacci', 'incremental', 'tshirt'] as const) {
      test(`everyone sees the ${scale} scale and its deck, also after a reload and for a late joiner`, async ({
        browser,
      }) => {
        const s = await aSession(browser, scale);
        await startStory(s);

        for (const page of s.all)
          await expect(page.getByText(`Voting scale: ${LABELS[scale]}`)).toBeVisible();
        for (const page of [s.anna, s.bob]) expect(await deckValues(page)).toEqual(DECKS[scale]);
        await expect(s.fac.getByRole('radiogroup')).toHaveCount(0);
        await s.anna.reload();
        await expect(s.anna.getByText(`Voting scale: ${LABELS[scale]}`)).toBeVisible();
        expect(await deckValues(s.anna)).toEqual(DECKS[scale]);
        const late = await newPage(browser);
        await late.goto(s.fac.url());
        await late.getByLabel('Your name').fill('Cy');
        await button(late, 'Join').click();
        await expect(late.getByText(`Voting scale: ${LABELS[scale]}`)).toBeVisible();
        expect(await deckValues(late)).toEqual(DECKS[scale]);
      });
    }

    test('a session created without choosing is a Fibonacci session', async ({ browser }) => {
      const s = await aSession(browser);
      await startStory(s);

      for (const page of s.all)
        await expect(page.getByText('Voting scale: Fibonacci')).toBeVisible();
      expect(await deckValues(s.anna)).toEqual(DECKS.fibonacci);
    });
  });

  test.describe('Playing a round in each scale', () => {
    test('Fibonacci keeps working: results, proposal and total', async ({ browser }) => {
      const s = await aSession(browser, 'fibonacci');
      await startStory(s);
      await vote(s.anna, '3');
      await vote(s.bob, '8');
      await button(s.fac, 'Reveal votes').click();

      for (const page of s.all) {
        await expect(region(page, 'Results')).toContainText('Average: 5.5');
        await expect(region(page, 'Results')).toContainText('No consensus');
      }
      await expect(s.fac.getByLabel('Final estimate')).toHaveValue('5');
      await button(s.fac, 'Record estimate').click();
      for (const page of s.all) {
        await expect(region(page, 'Summary')).toContainText('Total: 5');
      }
    });

    test('Incremental offers 1 to 10, proposes the closest number and adds up', async ({
      browser,
    }) => {
      const s = await aSession(browser, 'incremental');
      await startStory(s);
      await vote(s.anna, '4');
      await vote(s.bob, '10');
      await button(s.fac, 'Reveal votes').click();

      await expect(region(s.anna, 'Results')).toContainText('Average: 7');
      await expect(region(s.anna, 'Results')).toContainText('Outliers: Anna, Bob');
      await expect(s.fac.getByLabel('Final estimate')).toHaveValue('7');
      const options = await s.fac.getByLabel('Final estimate').locator('option').allTextContents();
      expect(options).toEqual(['Choose an estimate', ...ESTIMATES.incremental]);
      await s.fac.getByLabel('Final estimate').selectOption('9');
      await button(s.fac, 'Record estimate').click();
      for (const page of s.all) await expect(region(page, 'Summary')).toContainText('Total: 9');
    });

    test('T-shirt shows sizes, the median and no average, proposes the median, and has no total', async ({
      browser,
    }) => {
      const s = await aSession(browser, 'tshirt');
      await startStory(s);
      await vote(s.anna, 'S');
      await vote(s.bob, 'XL');
      await button(s.fac, 'Reveal votes').click();

      for (const page of s.all) {
        const results = region(page, 'Results');
        await expect(results).toContainText('Median: XL');
        await expect(results).not.toContainText('Average');
        await expect(results).toContainText('Outliers: Anna, Bob');
      }
      await expect(region(s.anna, 'Voters')).toContainText('S');
      await expect(s.fac.getByLabel('Final estimate')).toHaveValue('XL');
      const options = await s.fac.getByLabel('Final estimate').locator('option').allTextContents();
      expect(options).toEqual(['Choose an estimate', ...ESTIMATES.tshirt]);
      await s.fac.getByLabel('Final estimate').selectOption('L');
      await button(s.fac, 'Record estimate').click();
      for (const page of s.all) {
        const summary = region(page, 'Summary');
        await expect(summary).toContainText('Login page');
        await expect(summary.getByRole('listitem').first()).toContainText('L');
        await expect(summary).not.toContainText('Total');
      }
    });

    test('T-shirt consensus names the size, and ? and coffee leave results without a median', async ({
      browser,
    }) => {
      const s = await aSession(browser, 'tshirt');
      await startStory(s);
      await vote(s.anna, 'M');
      await vote(s.bob, 'M');
      await button(s.fac, 'Reveal votes').click();
      await expect(region(s.bob, 'Results')).toContainText('Consensus: M');
      await expect(s.anna.locator('.sr-only[aria-live="polite"]')).toHaveText(
        'Votes revealed. Consensus: M',
      );
      await button(s.fac, 'Re-vote').click();

      await vote(s.anna, '?');
      await vote(s.bob, 'coffee');
      await button(s.fac, 'Reveal votes').click();

      await expect(region(s.anna, 'Results')).toContainText('No median');
      await expect(region(s.anna, 'Results')).not.toContainText(/consensus/i);
      await expect(s.fac.getByLabel('Final estimate')).toHaveValue('');
      await expect(button(s.fac, 'Record estimate')).toBeDisabled();
    });

    test('the t-shirt summary is copied as plain text without a total', async ({ browser }) => {
      const context = await browser.newContext({
        baseURL,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      contexts.push(context);
      const fac = await context.newPage();
      await fac.goto('/');
      await fac.getByLabel('Your name').fill('Sven');
      await scaleRadio(fac, 'tshirt').check();
      await button(fac, 'Create session').click();
      await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
      const form = fac.getByRole('form', { name: 'Story' });
      await form.getByLabel('Title').fill('Login page');
      await form.getByLabel('Link').fill('https://example.com/story');
      await form.getByRole('button', { name: 'Start voting' }).click();
      await button(fac, 'Skip story').click();
      await expect(region(fac, 'Summary')).toContainText('skipped');

      await button(fac, 'Copy summary').click();

      await expect(region(fac, 'Summary').getByRole('status')).toHaveText('Summary copied');
      expect(await fac.evaluate(() => navigator.clipboard.readText())).toBe(
        '1. Login page (https://example.com/story) - skipped',
      );
    });
  });

  test.describe('Layout and accessibility', () => {
    for (const [name, viewport] of [
      ['360x740', { width: 360, height: 740 }],
      ['768x1024', { width: 768, height: 1024 }],
      ['1280x800', { width: 1280, height: 800 }],
    ] as const) {
      for (const scale of ['incremental', 'tshirt'] as const) {
        test(`the ${scale} deck fits at ${name}: no horizontal scroll, every card at least 44 px`, async ({
          browser,
        }) => {
          const s = await aSession(browser, scale, 'light', viewport);
          await startStory(s);

          const overflow = await s.anna.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow).toBeLessThanOrEqual(0);
          for (const value of DECKS[scale]) {
            const box = (await label(s.anna, value).boundingBox())!;
            expect(box.width, `${value} width`).toBeGreaterThanOrEqual(44);
            expect(box.height, `${value} height`).toBeGreaterThanOrEqual(44);
            expect(box.x + box.width, `${value} inside the viewport`).toBeLessThanOrEqual(
              viewport.width,
            );
          }
        });
      }
    }

    for (const theme of ['light', 'dark'] as const) {
      test(`axe finds no violations for the create page and a revealed t-shirt session (${theme})`, async ({
        browser,
      }) => {
        test.setTimeout(90_000);
        const create = await newPage(browser, theme);
        await create.goto('/');
        const createResults = await new AxeBuilder({ page: create }).withTags(AXE_TAGS).analyze();
        expect(createResults.violations).toEqual([]);

        const s = await aSession(browser, 'tshirt', theme);
        await startStory(s);
        await vote(s.anna, 'S');
        await vote(s.bob, 'XL');
        const voting = await new AxeBuilder({ page: s.anna }).withTags(AXE_TAGS).analyze();
        expect(voting.violations).toEqual([]);
        await button(s.fac, 'Reveal votes').click();
        await expect(region(s.anna, 'Results')).toBeVisible();
        for (const page of [s.fac, s.anna]) {
          const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          expect(results.violations).toEqual([]);
        }
      });
    }
  });
});
