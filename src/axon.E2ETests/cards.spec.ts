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

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const radio = (page: Page, value: string): Locator =>
  page.locator(`input[type=radio][value="${value}"]`);
const face = (page: Page, value: string): Locator =>
  radio(page, value).locator('xpath=following-sibling::span');
const label = (page: Page, value: string): Locator =>
  radio(page, value).locator('xpath=ancestor::label');

test.describe('Playing cards @TEST', () => {
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
    reducedMotion: 'reduce' | 'no-preference' = 'no-preference',
  ) {
    const context = await browser.newContext({
      baseURL,
      colorScheme: theme,
      viewport,
      reducedMotion,
    });
    contexts.push(context);
    return context.newPage();
  }

  async function aSession(
    browser: Browser,
    scale: Scale,
    options: {
      theme?: Theme;
      viewport?: { width: number; height: number };
      reducedMotion?: 'reduce' | 'no-preference';
    } = {},
  ) {
    const {
      theme = 'light',
      viewport = { width: 1280, height: 800 },
      reducedMotion = 'no-preference',
    } = options;
    const fac = await newPage(browser, theme, viewport, reducedMotion);
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Sven');
    await fac.getByRole('radio', { name: new RegExp(LABELS[scale]) }).check();
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    const join = async (name: string) => {
      const page = await newPage(browser, theme, viewport, reducedMotion);
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
    await expect(radio(anna, DECKS[scale][0]!)).toBeEnabled();
    return { fac, anna, bob, all: [fac, anna, bob] };
  }

  async function vote(page: Page, value: string) {
    await label(page, value).click();
    await expect(radio(page, value)).toBeChecked();
  }

  const miniCards = (page: Page, name: string): Locator =>
    region(page, 'Voters')
      .getByRole('listitem')
      .filter({ hasText: name })
      .locator('span[class*="h-[45px]"]');

  test.describe('The cards look like playing cards', () => {
    for (const scale of ['fibonacci', 'incremental', 'tshirt'] as const) {
      test(`every ${scale} card is portrait with two corner values and an illustration`, async ({
        browser,
      }) => {
        const { anna } = await aSession(browser, scale);

        for (const value of DECKS[scale]) {
          const box = (await face(anna, value).boundingBox())!;
          expect(box.height / box.width, `${value} is portrait (5:7)`).toBeGreaterThan(1.3);
          expect(box.height / box.width).toBeLessThan(1.5);
          expect(box.width, `${value} width`).toBeGreaterThanOrEqual(44);
          expect(box.height, `${value} height`).toBeGreaterThanOrEqual(44);
          // two corners: the value (or the mug) twice, and at least one drawing
          const parts = await face(anna, value).evaluate((el) => ({
            corners: Array.from(el.children).filter(
              (c) =>
                c.className.toString().includes('absolute') &&
                c.className.toString().includes('font-semibold'),
            ).length,
            drawings: el.querySelectorAll('svg[aria-hidden="true"]').length,
          }));
          expect(parts.corners, `${value} corners`).toBe(2);
          expect(parts.drawings, `${value} drawings`).toBeGreaterThanOrEqual(1);
          await expect(radio(anna, value)).toHaveAccessibleName(
            value === 'coffee' ? 'Coffee break' : value,
          );
        }
      });
    }

    test('five different pictures serve five size levels, and ? and coffee have their own', async ({
      browser,
    }) => {
      const { anna } = await aSession(browser, 'fibonacci');
      const picture = (value: string) =>
        face(anna, value).evaluate((el) =>
          Array.from(el.querySelectorAll('svg'))
            .map((s) => s.innerHTML)
            .join('|'),
        );

      const bySize = await Promise.all(['1', '3', '5', '8', '13'].map(picture));
      expect(new Set(bySize).size).toBe(5);
      expect(await picture('2')).toBe(await picture('1'));
      expect(await picture('21')).toBe(await picture('13'));
      expect(bySize).not.toContain(await picture('?'));
      expect(bySize).not.toContain(await picture('coffee'));
    });

    test('there is no emoji and nothing is loaded from outside: inline drawings only', async ({
      browser,
    }) => {
      const { anna } = await aSession(browser, 'fibonacci');
      const external: string[] = [];
      const violations: string[] = [];
      anna.on('request', (r) => {
        if (['image', 'font', 'media'].includes(r.resourceType()))
          external.push(`${r.resourceType()} ${r.url()}`);
      });
      anna.on('console', (m) => m.type() === 'error' && violations.push(m.text()));

      await anna.reload();
      await expect(radio(anna, '5')).toBeEnabled();

      expect(external).toEqual([]);
      expect(violations).toEqual([]);
      expect(await anna.locator('body').innerText()).not.toContain('☕');
    });
  });

  test.describe('Pushing the card forward', () => {
    test('selecting raises the card, changing the vote moves the raise and withdrawing lowers it', async ({
      browser,
    }) => {
      const { anna } = await aSession(browser, 'fibonacci');
      const top = async (value: string) => (await face(anna, value).boundingBox())!.y;
      const rest = await top('5');

      await vote(anna, '5');
      await expect.poll(async () => rest - (await top('5'))).toBeGreaterThan(6);
      await vote(anna, '8');
      await expect.poll(async () => rest - (await top('8'))).toBeGreaterThan(6);
      await expect.poll(async () => Math.abs((await top('5')) - rest)).toBeLessThan(1);
      await button(anna, 'Withdraw vote').click();
      await expect.poll(async () => Math.abs((await top('8')) - rest)).toBeLessThan(1);
    });

    test('raising a card does not move anything else on the page', async ({ browser }) => {
      const { anna } = await aSession(browser, 'fibonacci');
      const legend = anna.getByText('Too large to take as one story');
      const before = (await legend.boundingBox())!.y;
      const deck = (await label(anna, '1').boundingBox())!.y;

      await vote(anna, '3');
      await anna.waitForTimeout(400);

      expect((await legend.boundingBox())!.y).toBe(before);
      expect((await label(anna, '1').boundingBox())!.y).toBe(deck);
    });

    test('the raised card is shown without movement when motion is reduced', async ({
      browser,
    }) => {
      const { anna } = await aSession(browser, 'fibonacci', { reducedMotion: 'reduce' });
      const rest = (await face(anna, '5').boundingBox())!.y;

      await vote(anna, '5');

      expect(await face(anna, '5').evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
        'none',
      );
      expect(rest - (await face(anna, '5').boundingBox())!.y).toBeGreaterThan(6);
    });
  });

  test.describe("Other players' cards", () => {
    test('a voter who has voted shows a card back, others an empty slot, then the face flips in', async ({
      browser,
    }) => {
      const { fac, anna, bob } = await aSession(browser, 'fibonacci');
      await expect(miniCards(anna, 'Bob')).toHaveCount(1);
      await expect(miniCards(anna, 'Bob').locator('svg')).toHaveCount(0);

      await vote(bob, '8');
      await expect(miniCards(anna, 'Bob').locator('svg')).toHaveCount(1);
      await expect(miniCards(anna, 'Bob')).toHaveText('');
      expect(
        await miniCards(anna, 'Bob').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('deal-in');
      await expect(miniCards(anna, 'Anna').locator('svg')).toHaveCount(0);

      await vote(anna, '13');
      await button(fac, 'Reveal votes').click();
      await expect(region(anna, 'Results')).toBeVisible();
      const flipping = await miniCards(anna, 'Bob').evaluate(
        (el) => getComputedStyle(el).animationName,
      );
      expect(flipping).toBe('flip-in');
      await expect(miniCards(anna, 'Bob')).toContainText('Vote: 8');
      await expect(miniCards(anna, 'Anna')).toContainText('Vote: 13');
    });

    test('the flip is staggered: the second voter starts later than the first', async ({
      browser,
    }) => {
      const { fac, anna, bob } = await aSession(browser, 'fibonacci');
      await vote(anna, '3');
      await vote(bob, '5');
      await button(fac, 'Reveal votes').click();
      await expect(region(fac, 'Results')).toBeVisible();

      const delays = await Promise.all(
        ['Anna', 'Bob'].map((name) =>
          miniCards(fac, name).evaluate((el) => getComputedStyle(el).animationDelay),
        ),
      );

      expect(delays).toEqual(['0s', '0.08s']);
    });

    test('a reload shows the end state at once: no deal-in and no flip', async ({ browser }) => {
      const { fac, anna, bob } = await aSession(browser, 'fibonacci');
      await vote(bob, '5');
      await anna.reload();
      await expect(miniCards(anna, 'Bob').locator('svg')).toHaveCount(1);
      expect(
        await miniCards(anna, 'Bob').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');

      await vote(anna, '8');
      await button(fac, 'Reveal votes').click();
      await expect(region(bob, 'Results')).toBeVisible();
      await bob.reload();
      await expect(miniCards(bob, 'Anna')).toContainText('Vote: 8');
      expect(
        await miniCards(bob, 'Anna').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');
    });

    test('the text badges stay exactly as before', async ({ browser }) => {
      const { fac, anna, bob } = await aSession(browser, 'fibonacci');
      await vote(bob, '5');

      await expect(
        region(anna, 'Voters').getByRole('listitem').filter({ hasText: 'Bob' }),
      ).toContainText('Voted');
      await expect(
        region(anna, 'Voters').getByRole('listitem').filter({ hasText: 'Anna' }),
      ).toContainText('Not voted');
      await expect(region(anna, 'Voters')).not.toContainText(/\d/);
      await vote(anna, '13');
      await button(fac, 'Reveal votes').click();
      await expect(region(anna, 'Results')).toBeVisible();
      await expect(
        region(anna, 'Voters').getByRole('listitem').filter({ hasText: 'Bob' }),
      ).toContainText('Vote: 5');
    });
  });

  test.describe('Reduced motion', () => {
    test('there is no transition and no animation anywhere when motion is reduced', async ({
      browser,
    }) => {
      const { fac, anna, bob } = await aSession(browser, 'fibonacci', { reducedMotion: 'reduce' });
      await vote(bob, '5');
      await expect(miniCards(anna, 'Bob').locator('svg')).toHaveCount(1);
      expect(
        await miniCards(anna, 'Bob').evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');

      await vote(anna, '8');
      await button(fac, 'Reveal votes').click();
      await expect(region(anna, 'Results')).toBeVisible();
      await expect(miniCards(anna, 'Bob')).toContainText('Vote: 5');

      const running = await anna.evaluate(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>('*'))
            .map((el) => getComputedStyle(el))
            .filter(
              (s) =>
                s.animationName !== 'none' ||
                (s.transitionProperty !== 'none' &&
                  parseFloat(s.transitionDuration) > 0 &&
                  /transform|translate|scale|all/.test(s.transitionProperty)),
            ).length,
      );
      expect(running).toBe(0);
    });
  });

  test.describe('Layout and accessibility', () => {
    for (const [name, viewport] of [
      ['360x740', { width: 360, height: 740 }],
      ['768x1024', { width: 768, height: 1024 }],
      ['1280x800', { width: 1280, height: 800 }],
    ] as const) {
      for (const scale of ['fibonacci', 'incremental', 'tshirt'] as const) {
        test(`the ${scale} deck fits at ${name}, with a selected card raised inside the panel`, async ({
          browser,
        }) => {
          const { anna } = await aSession(browser, scale, { viewport });
          await vote(anna, DECKS[scale][2]!);

          const overflow = await anna.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow).toBeLessThanOrEqual(0);
          const panel = (await radio(anna, DECKS[scale][0]!)
            .locator('xpath=ancestor::*[@data-panel][1]')
            .boundingBox())!;
          for (const value of DECKS[scale]) {
            const box = (await face(anna, value).boundingBox())!;
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.x).toBeGreaterThanOrEqual(panel.x);
            expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
            expect(box.y).toBeGreaterThanOrEqual(panel.y);
          }
        });
      }
    }

    for (const theme of ['light', 'dark'] as const) {
      test(`axe finds no violations on the deck of every scale, selected and not, and on the voters list (${theme})`, async ({
        browser,
      }) => {
        test.setTimeout(150_000);
        for (const scale of ['fibonacci', 'incremental', 'tshirt'] as const) {
          const { fac, anna, bob } = await aSession(browser, scale, { theme });
          const before = await new AxeBuilder({ page: anna }).withTags(AXE_TAGS).analyze();
          expect(before.violations, `${scale} deck`).toEqual([]);
          await vote(anna, DECKS[scale][2]!);
          await vote(bob, DECKS[scale][4]!);
          for (const page of [anna, fac]) {
            const voting = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
            expect(voting.violations, `${scale} voting`).toEqual([]);
          }
          await button(fac, 'Reveal votes').click();
          await expect(region(anna, 'Results')).toBeVisible();
          await anna.waitForTimeout(900);
          for (const page of [anna, fac]) {
            const revealed = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
            expect(revealed.violations, `${scale} revealed`).toEqual([]);
          }
        }
      });
    }
  });
});
