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
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];
const LINK = 'https://example.com/story';

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const region = (page: Page, name: string): Locator => page.getByRole('region', { name });
const card = (page: Page, value: string): Locator =>
  page.locator(`input[type=radio][value="${value}"]`).locator('xpath=ancestor::label');

// Chrome reports Tailwind colours as oklch(); a canvas pixel always comes back as plain RGB.
const background = (locator: Locator): Promise<string> =>
  locator.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(el).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `${r},${g},${b}`;
  });
const pageBackground = (page: Page): Promise<string> => background(page.locator('body'));

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  );
}

test.describe('Section panels @TEST', () => {
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

  // The panel that holds an element: the nearest ancestor box with the panel look.
  const panelOf = (locator: Locator): Locator =>
    locator.locator('xpath=ancestor::*[@data-panel][1]');

  async function expectPanel(
    page: Page,
    panel: Locator,
    label: string,
    viewport: { width: number },
  ) {
    await expect(panel, label).toBeVisible();
    expect(await background(panel), `${label}: background differs from the page`).not.toBe(
      await pageBackground(page),
    );
    const border = await panel.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        width: parseFloat(style.borderTopWidth),
        style: style.borderTopStyle,
        radius: parseFloat(style.borderTopLeftRadius),
      };
    });
    expect(border.width, `${label}: border`).toBeGreaterThanOrEqual(1);
    expect(border.style).toBe('solid');
    expect(border.radius).toBeGreaterThan(0);
    const box = (await panel.boundingBox())!;
    expect(box.x, `${label}: inside the viewport (left)`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${label}: inside the viewport (right)`).toBeLessThanOrEqual(
      viewport.width,
    );
    return box;
  }

  async function expectNoOverflow(page: Page, label: string) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name} ${theme}: the create page, the join prompt and the other pages are panels`, async ({
        browser,
      }) => {
        const tag = `${viewport.name} ${theme}`;
        const fac = await newPage(browser, theme, viewport);
        await fac.goto('/');
        await expectPanel(
          fac,
          panelOf(fac.getByRole('heading', { level: 1 })),
          `${tag} create page`,
          viewport,
        );
        await expectNoOverflow(fac, `${tag} create page`);
        await fac.getByLabel('Your name').fill('Sven');
        await button(fac, 'Create session').click();
        await expect(
          fac.getByRole('heading', { level: 1, name: 'Story Estimation' }),
        ).toBeVisible();

        const guest = await newPage(browser, theme, viewport);
        await guest.goto(fac.url());
        await expect(guest.getByRole('heading', { level: 1, name: 'Join session' })).toBeVisible();
        await expectPanel(
          guest,
          panelOf(guest.getByRole('heading', { level: 1 })),
          `${tag} join prompt`,
          viewport,
        );
        await expectNoOverflow(guest, `${tag} join prompt`);

        for (const path of ['/g/AAAAAAAAAAAAAAAAAAAAAA', '/nowhere']) {
          await guest.goto(path);
          await expectPanel(
            guest,
            panelOf(guest.getByRole('heading', { level: 1 })),
            `${tag} ${path}`,
            viewport,
          );
          await expectNoOverflow(guest, `${tag} ${path}`);
        }
        // The header and the footer are not in panels.
        for (const landmark of ['banner', 'contentinfo'] as const) {
          const box = guest.getByRole(landmark);
          expect(await box.evaluate((el) => el.hasAttribute('data-panel'))).toBe(false);
        }
      });

      test(`${viewport.name} ${theme}: every section of the estimation page is a separate panel`, async ({
        browser,
      }) => {
        test.setTimeout(90_000);
        const tag = `${viewport.name} ${theme}`;
        const fac = await newPage(browser, theme, viewport);
        await fac.goto('/');
        await fac.getByLabel('Your name').fill('Sven');
        await button(fac, 'Create session').click();
        await expect(
          fac.getByRole('heading', { level: 1, name: 'Story Estimation' }),
        ).toBeVisible();
        const anna = await newPage(browser, theme, viewport);
        await anna.goto(fac.url());
        await anna.getByLabel('Your name').fill('Anna');
        await button(anna, 'Join').click();
        await expect(
          anna.getByRole('heading', { level: 1, name: 'Story Estimation' }),
        ).toBeVisible();
        const form = fac.getByRole('form', { name: 'Story' });
        await form.getByLabel('Title').fill('Login page');
        await form.getByLabel('Link').fill(LINK);
        await form.getByRole('button', { name: 'Start voting' }).click();
        await card(anna, '5').click();
        await expect(region(fac, 'Voters')).toContainText('Voted');

        const check = async (page: Page, names: string[], deck: boolean, label: string) => {
          const boxes: Array<[string, Box]> = [];
          for (const name of names) {
            boxes.push([
              name,
              await expectPanel(page, region(page, name), `${label} ${name}`, viewport),
            ]);
            // The heading is the first thing in its panel and the panel has one heading.
            // (Round controls is named by its label and has no heading of its own.)
            await expect(region(page, name).locator('h2')).toHaveCount(
              name === 'Round controls' ? 0 : 1,
            );
          }
          if (deck) {
            boxes.push([
              'Your vote',
              await expectPanel(
                page,
                panelOf(page.getByRole('radiogroup', { name: 'Your vote' })),
                `${label} Your vote`,
                viewport,
              ),
            ]);
          }
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              expect(
                overlap(boxes[i]![1], boxes[j]![1]),
                `${label}: ${boxes[i]![0]} overlaps ${boxes[j]![0]}`,
              ).toBe(false);
            }
          }
          await expectNoOverflow(page, label);
          return boxes;
        };

        const voterNames = ['Story', 'Facilitator', 'Voters', 'Summary'];
        const boxes = await check(anna, voterNames, true, `${tag} voter voting`);
        await check(fac, voterNames, false, `${tag} facilitator voting`);
        // While voting Reveal and Skip live in the Story panel; Round controls come with the reveal.
        await expect(fac.getByRole('region', { name: 'Round controls' })).toHaveCount(0);

        // Two groups on a wide screen, one stack on a narrow one.
        const story = boxes.find(([n]) => n === 'Story')![1];
        const voters = boxes.find(([n]) => n === 'Voters')![1];
        if (viewport.width >= 1024) {
          expect(voters.x, `${tag} people area is right of the work area`).toBeGreaterThanOrEqual(
            story.x + story.width,
          );
        } else {
          expect(Math.abs(voters.x - story.x)).toBeLessThan(2);
          expect(voters.y).toBeGreaterThanOrEqual(story.y + story.height);
        }

        await button(fac, 'Reveal votes').click();
        for (const page of [fac, anna]) await expect(region(page, 'Results')).toBeVisible();
        await check(anna, [...voterNames, 'Results'], true, `${tag} voter revealed`);
        await check(
          fac,
          [...voterNames, 'Round controls', 'Results'],
          false,
          `${tag} facilitator revealed`,
        );
        await expect(fac.getByRole('region', { name: 'Round controls' })).toHaveCount(1);
        await expect(fac.getByRole('button', { name: 'Reveal votes' })).toHaveCount(0);
        await expect(
          region(fac, 'Round controls').getByRole('button', { name: 'Record estimate' }),
        ).toBeVisible();
      });
    }
  }

  test('focus rings are not cut off by a panel', async ({ browser }) => {
    const fac = await newPage(browser, 'light', { width: 1280, height: 800 });
    await fac.goto('/');
    await fac.getByLabel('Your name').fill('Sven');
    await button(fac, 'Create session').click();
    await expect(fac.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();

    const overflow = await fac.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('main [data-panel]')).map(
        (el) => getComputedStyle(el).overflow,
      ),
    );

    expect(overflow.length).toBeGreaterThan(3);
    expect(overflow.every((value) => value === 'visible')).toBe(true);
  });
});
