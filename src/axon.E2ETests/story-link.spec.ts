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

const BAD_LINK = 'Enter a full link starting with http:// or https://.';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const storyForm = (page: Page): Locator => page.getByRole('form', { name: 'Story' });

test.describe('A story with a link and no title @TEST', () => {
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
    const context = await browser.newContext({
      baseURL,
      colorScheme: theme,
      viewport,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    contexts.push(context);
    return context.newPage();
  }

  async function aTable(
    browser: Browser,
    theme: Theme = 'light',
    viewport = { width: 1280, height: 800 },
  ) {
    const fac = await newPage(browser, theme, viewport);
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Sven');
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    const anna = await newPage(browser, theme, viewport);
    await anna.goto(fac.url());
    await anna.getByLabel('Your name').fill('Anna');
    await button(anna, 'Join').click();
    await expect(anna.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    return { fac, anna };
  }

  async function setStory(page: Page, title: string, link: string) {
    const form = storyForm(page);
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Link').fill(link);
    await form.getByRole('button', { name: 'Start voting' }).click();
  }

  test('with only a link, everyone sees the link itself as the clickable text', async ({
    browser,
  }) => {
    const { fac, anna } = await aTable(browser);
    const url = `${baseURL}/story-link-fixture`;

    await setStory(fac, '', url);

    for (const page of [fac, anna]) {
      const link = region(page, 'Story').getByRole('link');
      await expect(link).toHaveCount(1);
      await expect(link).toContainText(url);
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link).toHaveAccessibleName(`${url} (opens in a new tab)`);
    }
    const popup = anna.context().waitForEvent('page');
    await region(anna, 'Story').getByRole('link').click();
    await expect(await popup).toHaveURL(url);
    await expect(anna.locator('.sr-only[aria-live="polite"]')).toHaveText('Voting is open');
  });

  test('the link is required: a title alone or an empty form is refused and nothing is sent', async ({
    browser,
  }) => {
    const { fac } = await aTable(browser);
    const form = storyForm(fac);

    await button(fac, 'Start voting').click();

    await expect(form.getByText(BAD_LINK)).toBeVisible();
    await expect(form.getByLabel('Link')).toBeFocused();
    await expect(form.getByLabel('Link')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Title')).not.toHaveAttribute('aria-invalid', 'true');
    await form.getByLabel('Title').fill('Login page');
    await button(fac, 'Start voting').click();
    await expect(form.getByText(BAD_LINK)).toBeVisible();
    await form.getByLabel('Link').fill('not a url');
    await button(fac, 'Start voting').click();
    await expect(form.getByText(BAD_LINK)).toBeVisible();
    await expect(region(fac, 'Story')).not.toContainText('Login');
  });

  test('the facilitator can add a title later, and the summary shows the link of a link-only story', async ({
    browser,
  }) => {
    const { fac, anna } = await aTable(browser);
    const url = `${baseURL}/story-link-fixture`;
    await setStory(fac, '', url);
    await expect(region(anna, 'Story').getByRole('link')).toContainText(url);

    await button(fac, 'Edit story').click();
    await expect(storyForm(fac).getByLabel('Title')).toHaveValue('');
    await expect(storyForm(fac).getByLabel('Link')).toHaveValue(url);
    await storyForm(fac).getByLabel('Title').fill('Login page');
    await button(fac, 'Save').click();

    await expect(region(anna, 'Story').getByRole('link')).toContainText('Login page');
    await expect(region(anna, 'Story').getByRole('link')).not.toContainText(url);
    await button(fac, 'Edit story').click();
    await storyForm(fac).getByLabel('Title').fill('');
    await button(fac, 'Save').click();
    await expect(region(anna, 'Story').getByRole('link')).toContainText(url);

    await anna.locator('input[type=radio][value="5"]').locator('xpath=ancestor::label').click();
    await button(fac, 'Reveal votes').click();
    await expect(region(anna, 'Results')).toBeVisible();
    await button(fac, 'Record estimate').click();
    for (const page of [fac, anna]) {
      const summary = region(page, 'Summary');
      await expect(summary.getByRole('link')).toContainText(url);
      await expect(summary.getByRole('link')).toHaveAttribute('href', url);
    }
    await button(anna, 'Copy summary').click();
    expect(await anna.evaluate(() => navigator.clipboard.readText())).toBe(
      `1. ${url} - 5\nTotal: 5`,
    );
  });

  for (const [name, viewport] of [
    ['360x740', { width: 360, height: 740 }],
    ['1280x800', { width: 1280, height: 800 }],
  ] as const) {
    test(`a 2048-character link-only story does not overflow at ${name}`, async ({ browser }) => {
      const { fac, anna } = await aTable(browser, 'light', viewport);
      const prefix = `${baseURL}/story-link-fixture?q=`;
      const url = prefix + 'a'.repeat(2048 - prefix.length);

      await setStory(fac, '', url);
      await expect(region(anna, 'Story').getByRole('link')).toHaveAttribute('href', url);

      for (const page of [fac, anna]) {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        const box = (await region(page, 'Story').getByRole('link').boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations on a link-only story (${theme})`, async ({ browser }) => {
      const { fac, anna } = await aTable(browser, theme);
      await setStory(fac, '', `${baseURL}/story-link-fixture`);
      await expect(region(anna, 'Story').getByRole('link')).toBeVisible();

      for (const page of [fac, anna]) {
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
      }
    });
  }
});
