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

const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const THEMES: Theme[] = ['light', 'dark'];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const MIN_TARGET = 44;
const MIN_GAP = 8;
const MIN_TEXT = 14;
const WIDE_FROM = 1024;

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const card = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });

// What the page looks like right now, measured in the browser.
async function measure(page: Page) {
  return page.evaluate((minGap) => {
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        !el.closest('.sr-only')
      );
    };
    const size = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
    const weight = (el: Element | null) => (el ? parseInt(getComputedStyle(el).fontWeight, 10) : 0);

    const smallText: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent?.trim(),
      );
      if (hasText && visible(el) && size(el) < 14)
        smallText.push(`${el.tagName} "${el.textContent?.trim().slice(0, 30)}" ${size(el)}px`);
    }

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, select, input:not([type=radio]), label:has(input[type=radio])',
      ),
    ).filter(visible);
    const rects = targets.map((el) => ({
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}"`,
      ...el.getBoundingClientRect().toJSON(),
    }));
    const small = rects
      .filter((r) => r.width < 44 || r.height < 44)
      .map((r) => `${r.label} ${Math.round(r.width)}x${Math.round(r.height)}`);
    const tight: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
        const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
        if (Math.max(dx, dy) < minGap - 0.5)
          tight.push(`${a.label} / ${b.label} gap ${Math.round(Math.max(dx, dy))}px`);
      }
    }

    const h1 = document.querySelector('h1');
    const h2 = document.querySelector('h2');
    const name = document.querySelector('[aria-labelledby="voters-heading"] .type-name');
    const meta = document.querySelector('footer p');
    const body = document.querySelector('main p, main label, main button');
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h1Count: document.querySelectorAll('h1').length,
      h1: size(h1),
      h2: size(h2),
      name: size(name),
      nameWeight: weight(name),
      meta: size(meta),
      bodyWeight: weight(body),
      smallText,
      small,
      tight,
    };
  }, MIN_GAP);
}

test.describe('Look and layout @TEST', () => {
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
    const context = await browser.newContext({ baseURL, colorScheme: theme, viewport });
    contexts.push(context);
    return context.newPage();
  }

  async function expectPageIsSound(page: Page, label: string, wide: boolean, theme: Theme) {
    const m = await measure(page);
    expect(m.overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
    expect(m.h1Count, `${label}: number of h1`).toBe(1);
    expect(m.smallText, `${label}: text under ${MIN_TEXT}px`).toEqual([]);
    expect(m.small, `${label}: targets under ${MIN_TARGET}px`).toEqual([]);
    expect(m.tight, `${label}: targets closer than ${MIN_GAP}px`).toEqual([]);
    expect(await page.title()).toBe('Planning Poker');
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      theme === 'dark',
    );
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      `${label}: axe`,
    ).toEqual([]);
    return { m, wide };
  }

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.name} ${theme}: create page, join prompt and the estimation page lay out well`, async ({
        browser,
      }) => {
        test.setTimeout(120_000);
        const tag = `${viewport.name} ${theme}`;
        const wide = viewport.width >= WIDE_FROM;
        const fac = await newPage(browser, theme, viewport);

        // Create page: the name is the heading, and the primary action is on screen.
        await fac.goto('/');
        const create = await expectPageIsSound(fac, `${tag} create page`, false, theme);
        expect(create.m.h1, 'create heading is display size').toBeGreaterThanOrEqual(36);
        expect(create.m.h1).toBeGreaterThanOrEqual(24);
        await expect(
          fac.getByRole('heading', { level: 1, name: 'Planning Poker' }),
        ).toBeInViewport();
        await expect(button(fac, 'Create session')).toBeInViewport();
        await expect(fac.getByText('Story refinement')).toBeVisible();
        await fac.getByLabel('Your name').fill('Sven');
        await button(fac, 'Create session').click();
        await expect(
          fac.getByRole('heading', { level: 1, name: 'Story Estimation' }),
        ).toBeVisible();
        const url = fac.url();

        // Join prompt.
        const anna = await newPage(browser, theme, viewport);
        await anna.goto(url);
        await expect(anna.getByRole('heading', { level: 1, name: 'Join session' })).toBeVisible();
        await expectPageIsSound(anna, `${tag} join prompt`, false, theme);
        await expect(button(anna, 'Join')).toBeInViewport();
        await anna.getByLabel('Your name').fill('Anna');
        await button(anna, 'Join').click();
        const bob = await newPage(browser, theme, viewport);
        await bob.goto(url);
        await bob.getByLabel('Your name').fill('B'.repeat(30));
        await button(bob, 'Join').click();
        await expect(region(fac, 'Voters').getByRole('listitem')).toHaveCount(2);

        // Estimation page, waiting then voting.
        const form = fac.getByRole('form', { name: 'Story' });
        await form.getByLabel('Title').fill('T'.repeat(200));
        await form.getByLabel('Link').fill(`https://example.com/${'a'.repeat(300)}`);
        await expect(button(fac, 'Start voting')).toBeInViewport();
        await form.getByRole('button', { name: 'Start voting' }).click();
        await expect(region(anna, 'Story')).toContainText('TTTT');

        // Columns: one below the breakpoint, two from it, in reading order with no overlap.
        for (const page of [fac, anna]) {
          const story = (await region(page, 'Story').boundingBox())!;
          const voters = (await region(page, 'Voters').boundingBox())!;
          if (wide) {
            expect(voters.x, `${tag} voters sit right of the story`).toBeGreaterThanOrEqual(
              story.x + story.width,
            );
            expect(Math.abs(voters.y - story.y), `${tag} columns start together`).toBeLessThan(120);
            expect(story.width + voters.width, `${tag} columns use the width`).toBeGreaterThan(
              Math.min(viewport.width, 1152) * 0.8,
            );
          } else {
            expect(Math.abs(voters.x - story.x), `${tag} single column`).toBeLessThan(2);
            expect(voters.y, `${tag} people below the work area`).toBeGreaterThanOrEqual(
              story.y + story.height,
            );
          }
        }

        await card(anna, '5').click();
        await expect(card(anna, '5')).toBeChecked();
        await card(bob, '8').click();
        await expect(card(bob, '8')).toBeChecked();
        await expect(region(fac, 'Voters')).toContainText('Voted');

        const facVoting = await expectPageIsSound(fac, `${tag} facilitator voting`, wide, theme);
        const annaVoting = await expectPageIsSound(anna, `${tag} voter voting`, wide, theme);
        await expect(button(fac, 'Reveal votes')).toBeInViewport();
        await expect(card(anna, '5')).toBeInViewport();

        // The type scale: headings clearly above names, names heavier than body, meta smaller.
        for (const { m } of [facVoting, annaVoting]) {
          expect(m.h1, `${tag} title vs section`).toBeGreaterThanOrEqual(m.h2 * 1.25 - 0.5);
          expect(m.h2, `${tag} section vs body`).toBeGreaterThanOrEqual(16 * 1.25 - 0.5);
          expect(m.h2, `${tag} section vs name`).toBeGreaterThan(m.name);
          expect(m.nameWeight, `${tag} names heavier than body`).toBeGreaterThan(m.bodyWeight);
          expect(m.meta, `${tag} meta smaller than body`).toBeLessThanOrEqual(16 * 0.9);
        }

        await button(fac, 'Reveal votes').click();
        await expect(region(anna, 'Results')).toBeVisible();
        await expectPageIsSound(fac, `${tag} facilitator revealed`, wide, theme);
        await expectPageIsSound(anna, `${tag} voter revealed`, wide, theme);
        await expect(button(fac, 'Record estimate')).toBeInViewport();
        if (wide) {
          const results = (await region(anna, 'Results').boundingBox())!;
          const voters = (await region(anna, 'Voters').boundingBox())!;
          expect(voters.x, `${tag} results sit next to the people list`).toBeGreaterThanOrEqual(
            results.x + results.width,
          );
        }
      });
    }
  }

  test('the document title and the logo link are the same on every page type', async ({
    browser,
  }) => {
    const page = await newPage(browser, 'light', { width: 1280, height: 800 });
    for (const path of ['/', '/g/AAAAAAAAAAAAAAAAAAAAAA', '/nowhere']) {
      await page.goto(path);
      expect(await page.title(), path).toBe('Planning Poker');
      const logo = page.getByRole('link', { name: 'Planning Poker home' });
      await expect(logo, path).toHaveAttribute('href', '/');
      const box = (await logo.boundingBox())!;
      expect(box.x + box.width, `${path}: logo is at the right edge of the header`).toBeGreaterThan(
        1280 * 0.55,
      );
      const toggle = (await page.getByRole('button', { name: 'Dark mode' }).boundingBox())!;
      expect(toggle.x + toggle.width, `${path}: toggle left of the logo`).toBeLessThanOrEqual(
        box.x + 1,
      );
      expect(box.y, `${path}: logo at the top`).toBeLessThan(120);
    }
  });

  test('the logo link leaves the session page and goes home', async ({ browser }) => {
    const page = await newPage(browser, 'light', { width: 1280, height: 800 });
    await page.goto('/');
    await page.getByLabel('Your name').fill('Sven');
    await button(page, 'Create session').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();

    await page.getByRole('link', { name: 'Planning Poker home' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Planning Poker' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the favicon is the logo and loads under the CSP', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => m.type() === 'error' && violations.push(m.text()));
    await page.goto('/');

    const href = await page.evaluate(() =>
      document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    );
    const response = await page.request.get(href ?? '/favicon.svg');

    expect(href).toBe('/favicon.svg');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/svg/);
    expect(await response.text()).toContain('<svg');
    expect(violations).toEqual([]);
  });

  test('no visible text, label or title says "game" on any page', async ({ browser }) => {
    const fac = await newPage(browser, 'light', { width: 1280, height: 800 });
    const found: string[] = [];
    const scan = async (page: Page, label: string) => {
      const text = await page.evaluate(() => {
        const labels = Array.from(
          document.querySelectorAll('[aria-label],[title],[placeholder],[alt]'),
        ).flatMap((el) =>
          ['aria-label', 'title', 'placeholder', 'alt'].map((a) => el.getAttribute(a) ?? ''),
        );
        return [document.title, document.body.innerText, ...labels].join('\n');
      });
      const hit = text.match(/\bgames?\b/i);
      if (hit)
        found.push(
          `${label}: "${hit[0]}" in ${JSON.stringify(text.split('\n').find((l) => /\bgames?\b/i.test(l)))}`,
        );
    };
    await fac.goto('/');
    await scan(fac, 'create page');
    await fac.getByLabel('Your name').fill('Sven');
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();
    await scan(fac, 'estimation page');
    const guest = await newPage(browser, 'light', { width: 1280, height: 800 });
    await guest.goto(fac.url());
    await scan(guest, 'join prompt');
    await button(guest, 'Join').click();
    await scan(guest, 'join prompt with an error');
    await guest.getByLabel('Your name').fill('Anna');
    await button(guest, 'Join').click();
    await expect(region(fac, 'Voters').getByRole('listitem')).toHaveCount(1);
    await button(fac, 'Remove Anna').click();
    await scan(fac, 'remove confirmation');
    await button(fac, 'Confirm remove').click();
    await expect(guest.getByText('You were removed from this session.')).toBeVisible();
    await scan(guest, 'removed page');
    await guest.goto('/g/AAAAAAAAAAAAAAAAAAAAAA');
    await scan(guest, 'session not found');
    await guest.goto('/nowhere');
    await scan(guest, 'page not found');

    expect(found).toEqual([]);
  });
});
