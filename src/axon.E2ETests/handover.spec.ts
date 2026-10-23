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

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const radio = (page: Page, value: string): Locator =>
  page.locator(`input[type=radio][value="${value}"]`);
const liveRegion = (page: Page): Locator => page.locator('.sr-only[aria-live="polite"]');
const voterRow = (page: Page, name: string): Locator =>
  region(page, 'Voters').getByRole('listitem').filter({ hasText: name });

test.describe('Facilitator handover @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3100';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  async function newPage(browser: Browser, theme: Theme = 'light') {
    const context = await browser.newContext({ baseURL, colorScheme: theme });
    contexts.push(context);
    return context.newPage();
  }

  async function aSession(browser: Browser, theme: Theme = 'light') {
    const fac = await newPage(browser, theme);
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Fran');
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    const join = async (name: string) => {
      const page = await newPage(browser, theme);
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
    return { fac, anna, bob, all: [fac, anna, bob] };
  }

  async function handOver(from: Page, name: string) {
    await button(from, new RegExp(`^Make facilitator ${name}$`)).click();
    await button(from, 'Confirm handover').click();
  }

  async function vote(page: Page, value: string) {
    await radio(page, value).locator('xpath=ancestor::label').click();
    await expect(radio(page, value)).toBeChecked();
  }

  test('the chosen voter becomes the facilitator and the old one a voter, for everyone', async ({
    browser,
  }) => {
    const { fac, anna, bob, all } = await aSession(browser);

    await handOver(fac, 'Anna');

    for (const page of all) {
      await expect(region(page, 'Facilitator')).toContainText('Anna');
      await expect(region(page, 'Voters')).toContainText('Fran');
      await expect(region(page, 'Voters')).not.toContainText('Anna');
    }
    // new facilitator: controls, no deck. Old facilitator: deck, no controls.
    await expect(button(anna, 'Reveal votes')).toBeVisible();
    await expect(radio(anna, '5')).toHaveCount(0);
    await expect(radio(fac, '5')).toBeEnabled();
    await expect(button(fac, 'Reveal votes')).toHaveCount(0);
    await expect(button(fac, /^Make facilitator/)).toHaveCount(0);
    await expect(button(anna, /^Make facilitator/)).toHaveCount(2);
    await expect(button(fac, 'Edit story')).toHaveCount(0);
    await expect(button(anna, 'Edit story')).toBeVisible();
    await expect(bob.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('cancel keeps everything as it was and returns focus to the button', async ({ browser }) => {
    const { fac } = await aSession(browser);

    await button(fac, /^Make facilitator Anna$/).click();
    await expect(fac.getByText('Make Anna the facilitator?')).toBeVisible();
    await button(fac, 'Cancel').click();

    await expect(button(fac, /^Make facilitator Anna$/)).toBeFocused();
    await expect(region(fac, 'Facilitator')).toContainText('Fran');
  });

  test('a voter has no control, and an offline voter cannot be chosen', async ({ browser }) => {
    const { fac, anna, bob } = await aSession(browser);
    await expect(button(anna, /Make facilitator/)).toHaveCount(0);

    await bob.close();

    await expect(voterRow(fac, 'Bob')).toContainText(/offline/i);
    await expect(button(fac, /^Make facilitator Bob$/)).toHaveCount(0);
    await expect(button(fac, /^Make facilitator Anna$/)).toBeVisible();
  });

  test('keeps the story and other votes, drops the new facilitator vote, results follow', async ({
    browser,
  }) => {
    const { fac, anna, bob } = await aSession(browser);
    await vote(anna, '3');
    await vote(bob, '8');
    await expect(voterRow(fac, 'Anna')).toContainText('Voted');

    await handOver(fac, 'Anna');

    await expect(region(bob, 'Voters')).not.toContainText('Anna');
    await expect(voterRow(bob, 'Bob')).toContainText('Voted');
    await expect(voterRow(bob, 'Fran')).toContainText('Not voted');
    await expect(bob.getByText('Login page')).toBeVisible();
    await expect(radio(fac, '5')).not.toBeChecked();
    await button(anna, 'Reveal votes').click();
    await expect(region(bob, 'Results')).toBeVisible();
    await expect(region(bob, 'Results')).not.toContainText('3');
  });

  test('the new facilitator can run the round to the end and the old one can vote', async ({
    browser,
  }) => {
    const { fac, anna, bob } = await aSession(browser);
    await handOver(fac, 'Anna');
    await vote(fac, '5');
    await vote(bob, '5');

    await button(anna, 'Reveal votes').click();
    await expect(region(fac, 'Results')).toBeVisible();
    await anna.getByLabel('Final estimate').selectOption('5');
    await button(anna, 'Record estimate').click();

    await expect(region(bob, 'Summary')).toContainText('Login page');
  });

  test('roles survive a reload: each browser gets the role it has now', async ({ browser }) => {
    const { fac, anna } = await aSession(browser);
    await handOver(fac, 'Anna');
    await expect(button(anna, 'Reveal votes')).toBeVisible();

    await fac.reload();
    await anna.reload();

    await expect(region(fac, 'Facilitator')).toContainText('Anna');
    await expect(radio(fac, '5')).toBeEnabled();
    await expect(button(fac, 'Reveal votes')).toHaveCount(0);
    await expect(button(anna, 'Reveal votes')).toBeVisible();
    await expect(radio(anna, '5')).toHaveCount(0);
  });

  test('the role can be handed back', async ({ browser }) => {
    const { fac, anna } = await aSession(browser);
    await handOver(fac, 'Anna');
    await expect(button(anna, /^Make facilitator Fran$/)).toBeVisible();

    await handOver(anna, 'Fran');

    await expect(region(anna, 'Facilitator')).toContainText('Fran');
    await expect(button(fac, 'Reveal votes')).toBeVisible();
    await expect(radio(anna, '5')).toBeEnabled();
  });

  test('everyone hears who is the facilitator now, once', async ({ browser }) => {
    const { fac, anna, bob } = await aSession(browser);

    await handOver(fac, 'Anna');

    for (const page of [fac, anna, bob]) {
      await expect(liveRegion(page)).toHaveText('Anna is now the facilitator');
    }
  });

  test('the offline banner and the summary use the new facilitator name', async ({ browser }) => {
    const { fac, anna, bob } = await aSession(browser);
    await handOver(fac, 'Anna');
    await expect(region(bob, 'Facilitator')).toContainText('Anna');

    await anna.close();

    await expect(bob.getByText(/The facilitator is offline\. /)).toBeVisible();
    await expect(region(bob, 'Facilitator')).toContainText('Anna');
  });

  test('is keyboard operable with 44 px targets', async ({ browser }) => {
    const { fac, anna } = await aSession(browser);
    const open = button(fac, /^Make facilitator Anna$/);

    await open.focus();
    await fac.keyboard.press('Enter');
    for (const name of ['Confirm handover', 'Cancel']) {
      const box = (await button(fac, name).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await fac.keyboard.press('Tab');
    await expect(button(fac, 'Confirm handover')).toBeFocused();
    await fac.keyboard.press('Enter');

    await expect(button(anna, 'Reveal votes')).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations before, during and after a handover (${theme})`, async ({
      browser,
    }) => {
      const { fac, anna } = await aSession(browser, theme);
      const scan = async (page: Page) => {
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
      };

      await scan(fac);
      await button(fac, /^Make facilitator Anna$/).click();
      await scan(fac);
      await button(fac, 'Confirm handover').click();
      await expect(button(anna, 'Reveal votes')).toBeVisible();
      await scan(fac);
      await scan(anna);
    });
  }
});
