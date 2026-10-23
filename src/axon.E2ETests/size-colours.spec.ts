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
const LINK = 'https://example.com/story';
const HINT = 'Too large: consider splitting this story.';
const LABELS: Record<Scale, string> = {
  fibonacci: 'Fibonacci',
  incremental: 'Incremental',
  tshirt: 'T-shirt sizes',
};
const TOO_LARGE: Record<Scale, string[]> = {
  fibonacci: ['13', '21'],
  incremental: ['8', '9', '10'],
  tshirt: ['L', 'XL'],
};
const SIZED: Record<Scale, string[]> = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21'],
  incremental: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL'],
};
// Cards of the same level share a colour: [level, cards].
const LEVELS: Record<Scale, string[][]> = {
  fibonacci: [['1', '2'], ['3'], ['5'], ['8'], ['13', '21']],
  incremental: [
    ['1', '2'],
    ['3', '4'],
    ['5', '6'],
    ['7', '8'],
    ['9', '10'],
  ],
  tshirt: [['XS'], ['S'], ['M'], ['L'], ['XL']],
};

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const radio = (page: Page, value: string): Locator =>
  page.locator(`input[type=radio][value="${value}"]`);
const face = (page: Page, value: string): Locator =>
  radio(page, value).locator('xpath=following-sibling::span');
const label = (page: Page, value: string): Locator =>
  radio(page, value).locator('xpath=ancestor::label');

// Chrome reports Tailwind colours as oklch(); a canvas pixel always comes back as plain RGB.
async function colourOf(
  locator: Locator,
  property: 'backgroundColor' | 'color' | 'borderTopColor',
) {
  return locator.evaluate((el, prop) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(el)[prop];
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `${r},${g},${b}`;
  }, property);
}

test.describe('Colour-coded cards by size @TEST', () => {
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

  async function aSession(
    browser: Browser,
    scale: Scale,
    theme: Theme = 'light',
    viewport = { width: 1280, height: 800 },
  ) {
    const fac = await newPage(browser, theme, viewport);
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Sven');
    await fac.getByRole('radio', { name: new RegExp(LABELS[scale]) }).check();
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
    const form = fac.getByRole('form', { name: 'Story' });
    await form.getByLabel('Title').fill('Login page');
    await form.getByLabel('Link').fill(LINK);
    await form.getByRole('button', { name: 'Start voting' }).click();
    await expect(radio(anna, SIZED[scale][0]!)).toBeEnabled();
    return { fac, anna, bob, all: [fac, anna, bob] };
  }

  async function vote(page: Page, value: string) {
    await label(page, value).click();
    await expect(radio(page, value)).toBeChecked();
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const scale of ['fibonacci', 'incremental', 'tshirt'] as const) {
      test.describe(`${scale} in the ${theme} theme`, () => {
        test('the deck has five size colours, cards of one level share theirs, and ? and coffee stay neutral', async ({
          browser,
        }) => {
          const { anna } = await aSession(browser, scale, theme);

          const byLevel: string[] = [];
          for (const cards of LEVELS[scale]) {
            const colours = await Promise.all(
              cards.map((c) => colourOf(face(anna, c), 'backgroundColor')),
            );
            expect(new Set(colours).size, `${scale} level of ${cards.join(',')}`).toBe(1);
            byLevel.push(colours[0]!);
          }
          expect(new Set(byLevel).size).toBe(5);
          const neutral = await colourOf(face(anna, '?'), 'backgroundColor');
          expect(neutral).toBe(await colourOf(face(anna, 'coffee'), 'backgroundColor'));
          expect(byLevel).not.toContain(neutral);
        });

        test('the size bar fills one more segment for each level', async ({ browser }) => {
          const { anna } = await aSession(browser, scale, theme);

          for (const [level, cards] of LEVELS[scale].entries()) {
            for (const card of cards) {
              await expect(face(anna, card).locator('[data-filled="true"]'), `${card}`).toHaveCount(
                level + 1,
              );
              await expect(face(anna, card).locator('[data-filled]')).toHaveCount(5);
            }
          }
          await expect(face(anna, '?').locator('[data-filled]')).toHaveCount(0);
        });

        test('only the too-large cards carry the flag, the legend and the description', async ({
          browser,
        }) => {
          const { anna } = await aSession(browser, scale, theme);

          for (const card of SIZED[scale]) {
            const flagged = TOO_LARGE[scale].includes(card);
            await expect(face(anna, card).getByText('⚠')).toHaveCount(flagged ? 1 : 0);
            if (flagged) {
              await expect(radio(anna, card)).toHaveAccessibleDescription(
                'Too large: consider splitting this story',
              );
            } else {
              await expect(radio(anna, card)).not.toHaveAccessibleDescription(
                'Too large: consider splitting this story',
              );
            }
          }
          await expect(face(anna, '?').getByText('⚠')).toHaveCount(0);
          await expect(anna.getByText('Too large to take as one story')).toBeVisible();
        });

        test('a selected card becomes solid in its level colour and keeps its text', async ({
          browser,
        }) => {
          const { anna } = await aSession(browser, scale, theme);
          const card = SIZED[scale][2]!;
          const before = await colourOf(face(anna, card), 'backgroundColor');

          await vote(anna, card);

          const after = await colourOf(face(anna, card), 'backgroundColor');
          expect(after).not.toBe(before);
          expect(await colourOf(face(anna, card), 'color')).not.toBe(after);
          await expect(face(anna, card)).toContainText(card);
        });
      });
    }
  }

  test.describe('A revealed round', () => {
    test('chips, bars and the results mark a too-large estimate, and the hint follows the select', async ({
      browser,
    }) => {
      const { fac, anna, bob, all } = await aSession(browser, 'fibonacci');
      await vote(anna, '13');
      await vote(bob, '21');
      await button(fac, 'Reveal votes').click();
      for (const page of all) await expect(region(page, 'Results')).toBeVisible();

      // The voters' cards and the results are coloured and flagged for everyone.
      for (const page of all) {
        const row = region(page, 'Voters').getByRole('listitem').filter({ hasText: 'Anna' });
        await expect(row).toContainText('⚠');
        await expect(row).toContainText('(too large)');
        const results = region(page, 'Results');
        await expect(results.getByText('Too large')).toHaveCount(2);
      }
      await expect(anna.locator('.sr-only[aria-live="polite"]')).toHaveText(
        'Votes revealed. No consensus, average 17, too large to take as one story',
      );
      // The two bars have the same colour (same level).
      const bars = region(anna, 'Results').locator('li [aria-hidden="true"] > span');
      expect(await colourOf(bars.nth(0), 'backgroundColor')).toBe(
        await colourOf(bars.nth(1), 'backgroundColor'),
      );

      // The facilitator hint follows the select.
      await expect(fac.getByText(HINT)).toBeVisible();
      await fac.getByLabel('Final estimate').selectOption('8');
      await expect(fac.getByText(HINT)).toHaveCount(0);
      await fac.getByLabel('Final estimate').selectOption('13');
      await expect(fac.getByText(HINT)).toBeVisible();
      await button(fac, 'Record estimate').click();

      // The summary marks the story.
      for (const page of all) {
        const summary = region(page, 'Summary');
        await expect(summary).toContainText('Too large');
        await expect(summary).toContainText('13');
      }
    });

    test('a small proposal shows no hint, no flag and no suffix in the announcement', async ({
      browser,
    }) => {
      const { fac, anna, bob, all } = await aSession(browser, 'fibonacci');
      await vote(anna, '3');
      await vote(bob, '5');
      await button(fac, 'Reveal votes').click();
      for (const page of all) await expect(region(page, 'Results')).toBeVisible();

      await expect(fac.getByText(HINT)).toHaveCount(0);
      await expect(region(anna, 'Results')).not.toContainText('Too large');
      await expect(region(anna, 'Voters')).not.toContainText('⚠');
      await expect(anna.locator('.sr-only[aria-live="polite"]')).toHaveText(
        'Votes revealed. No consensus, average 4',
      );
      await button(fac, 'Record estimate').click();
      await expect(region(anna, 'Summary')).not.toContainText('Too large');
    });

    test('a t-shirt round flags a large size and shows the median', async ({ browser }) => {
      const { fac, anna, bob, all } = await aSession(browser, 'tshirt');
      await vote(anna, 'L');
      await vote(bob, 'XL');
      await button(fac, 'Reveal votes').click();
      for (const page of all) await expect(region(page, 'Results')).toContainText('Median: XL');

      await expect(fac.getByText(HINT)).toBeVisible();
      await expect(anna.locator('.sr-only[aria-live="polite"]')).toHaveText(
        'Votes revealed. No consensus, median XL, too large to take as one story',
      );
      await fac.getByLabel('Final estimate').selectOption('M');
      await expect(fac.getByText(HINT)).toHaveCount(0);
    });
  });

  test.describe('Layout and accessibility', () => {
    for (const [name, viewport] of [
      ['360x740', { width: 360, height: 740 }],
      ['768x1024', { width: 768, height: 1024 }],
      ['1280x800', { width: 1280, height: 800 }],
    ] as const) {
      for (const scale of ['fibonacci', 'incremental', 'tshirt'] as const) {
        test(`the ${scale} deck with bars, flags and legend fits at ${name}`, async ({
          browser,
        }) => {
          const { anna } = await aSession(browser, scale, 'light', viewport);

          const overflow = await anna.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow).toBeLessThanOrEqual(0);
          for (const card of SIZED[scale]) {
            const box = (await label(anna, card).boundingBox())!;
            expect(box.width, `${card} width`).toBeGreaterThanOrEqual(44);
            expect(box.height, `${card} height`).toBeGreaterThanOrEqual(44);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          }
          await expect(anna.getByText('Too large to take as one story')).toBeInViewport({
            ratio: 0,
          });
        });
      }
    }

    for (const theme of ['light', 'dark'] as const) {
      test(`axe finds no violations on the coloured deck, the revealed round and the summary (${theme})`, async ({
        browser,
      }) => {
        test.setTimeout(120_000);
        const { fac, anna, bob, all } = await aSession(browser, 'fibonacci', theme);
        for (const page of [anna, fac]) {
          const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          expect(results.violations).toEqual([]);
        }
        await vote(anna, '13');
        await vote(bob, '3');
        const selected = await new AxeBuilder({ page: anna }).withTags(AXE_TAGS).analyze();
        expect(selected.violations).toEqual([]);
        await button(fac, 'Reveal votes').click();
        for (const page of all) await expect(region(page, 'Results')).toBeVisible();
        await anna.waitForTimeout(900); // the flip is partly transparent while it runs
        for (const page of [fac, anna]) {
          const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          expect(results.violations).toEqual([]);
        }
        await fac.getByLabel('Final estimate').selectOption('21');
        await button(fac, 'Record estimate').click();
        await expect(region(anna, 'Summary')).toContainText('Too large');
        const summary = await new AxeBuilder({ page: anna }).withTags(AXE_TAGS).analyze();
        expect(summary.violations).toEqual([]);
      });
    }
  });
});
