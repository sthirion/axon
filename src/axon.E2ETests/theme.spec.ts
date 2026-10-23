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

const THEMES: Theme[] = ['light', 'dark'];
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const DARK_BODY = [15, 23, 42];
const LIGHT_BODY = [255, 255, 255];
const MIN_TARGET = 44;

const toggle = (page: Page): Locator => page.getByRole('button', { name: 'Dark mode' });
const isDark = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));
// Chrome reports Tailwind's colours as oklch(); a canvas pixel always comes back as plain RGB.
const bodyColour = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  });
// oklch() round-trips through RGB with an error of one step, so compare with a tolerance.
function expectColour(actual: number[], expected: number[]): void {
  actual.forEach((channel, i) =>
    expect(Math.abs(channel - (expected[i] as number))).toBeLessThanOrEqual(2),
  );
}
const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name });
const card = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const resultsRegion = (page: Page): Locator => page.getByRole('region', { name: 'Results' });
const votersRegion = (page: Page): Locator => page.getByRole('region', { name: 'Voters' });
const liveRegion = (page: Page): Locator => page.locator('.sr-only[aria-live="polite"]');

test.describe('Light/dark theme and accessibility pass @TEST', () => {
  let baseURL: string;
  let contexts: BrowserContext[];

  test.beforeEach(({ baseURL: configuredBaseURL }) => {
    baseURL = configuredBaseURL ?? 'http://127.0.0.1:3100';
    contexts = [];
  });

  test.afterEach(async () => {
    await Promise.all(contexts.map((context) => context.close()));
  });

  async function newContext(browser: Browser, colorScheme: Theme, viewport = DESKTOP) {
    const context = await browser.newContext({ baseURL, colorScheme, viewport });
    contexts.push(context);
    return context;
  }

  async function newPage(browser: Browser, colorScheme: Theme = 'light', viewport = DESKTOP) {
    const context = await newContext(browser, colorScheme, viewport);
    const errors: string[] = [];
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    return { context, page, errors };
  }

  test.describe('Following the operating system', () => {
    for (const scheme of THEMES) {
      test(`a first visit with an OS in ${scheme} mode shows the ${scheme} theme on every page`, async ({
        browser,
      }) => {
        const { page } = await newPage(browser, scheme);

        await page.goto('/');
        expect(await isDark(page)).toBe(scheme === 'dark');
        expectColour(await bodyColour(page), scheme === 'dark' ? DARK_BODY : LIGHT_BODY);
        await expect(toggle(page)).toHaveAttribute('aria-pressed', String(scheme === 'dark'));
        await page.goto('/g/AAAAAAAAAAAAAAAAAAAAAA');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Session not found' }),
        ).toBeVisible();
        expect(await isDark(page)).toBe(scheme === 'dark');
        await page.goto('/nowhere');
        expect(await isDark(page)).toBe(scheme === 'dark');
      });
    }

    test('follows an OS change live until the player has chosen', async ({ browser }) => {
      const { page } = await newPage(browser, 'light');
      await page.goto('/');
      expect(await isDark(page)).toBe(false);

      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => isDark(page)).toBe(true);
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => isDark(page)).toBe(false);

      await toggle(page).click();
      expect(await isDark(page)).toBe(true);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForTimeout(200);
      expect(await isDark(page)).toBe(true);
    });

    test('ignores a stored value that is not light or dark', async ({ browser }) => {
      for (const value of ['blue', '', 'DARK']) {
        const { context, page } = await newPage(browser, 'dark');
        await context.addInitScript((v) => window.localStorage.setItem('axon.theme', v), value);

        await page.goto('/');

        expect(await isDark(page), `stored "${value}"`).toBe(true);
      }
    });
  });

  test.describe('Switching and remembering', () => {
    test('the choice applies at once, is stored, and survives a reload and a new tab', async ({
      browser,
    }) => {
      const { context, page, errors } = await newPage(browser, 'light');
      await page.goto('/');

      await toggle(page).click();

      expect(await isDark(page)).toBe(true);
      expectColour(await bodyColour(page), DARK_BODY);
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => localStorage.getItem('axon.theme'))).toBe('dark');
      await page.reload();
      expect(await isDark(page)).toBe(true);
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      const other = await context.newPage();
      await other.goto('/g/AAAAAAAAAAAAAAAAAAAAAA');
      expect(await isDark(other)).toBe(true);
      await toggle(other).click();
      expect(await isDark(other)).toBe(false);
      expect(await other.evaluate(() => localStorage.getItem('axon.theme'))).toBe('light');
      expect(errors).toEqual([]);
    });

    test('a stored choice beats the OS setting in both directions', async ({ browser }) => {
      for (const [stored, scheme] of [
        ['dark', 'light'],
        ['light', 'dark'],
      ] as const) {
        const { context, page } = await newPage(browser, scheme);
        await context.addInitScript((v) => window.localStorage.setItem('axon.theme', v), stored);

        await page.goto('/');

        expect(await isDark(page)).toBe(stored === 'dark');
      }
    });

    test('works with blocked storage: the switch still happens and nothing errors', async ({
      browser,
    }) => {
      const { context, page, errors } = await newPage(browser, 'light');
      await context.addInitScript(() => {
        const fail = () => {
          throw new DOMException('blocked', 'SecurityError');
        };
        Storage.prototype.getItem = fail;
        Storage.prototype.setItem = fail;
      });
      await page.goto('/');

      await toggle(page).click();

      expect(await isDark(page)).toBe(true);
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
      expect(errors).toEqual([]);
    });

    test('keeps the choice while moving through the game pages', async ({ browser }) => {
      const { page } = await newPage(browser, 'light');
      await page.goto('/');
      await toggle(page).click();
      await page.getByLabel('Your name').fill('Sven');
      await button(page, 'Create session').click();
      await expect(page.getByRole('heading', { level: 1, name: 'Story Estimation' })).toBeVisible();

      expect(await isDark(page)).toBe(true);
      expectColour(await bodyColour(page), DARK_BODY);
      await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('No flash of the wrong theme', () => {
    test('a stored dark choice is applied before any app script runs', async ({ browser }) => {
      const { context, page } = await newPage(browser, 'light');
      await context.addInitScript(() => window.localStorage.setItem('axon.theme', 'dark'));
      const violations: string[] = [];
      await page.exposeFunction('reportCsp', (text: string) => violations.push(text));
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) =>
          (window as unknown as { reportCsp: (t: string) => void }).reportCsp(
            `${event.violatedDirective}: ${event.blockedURI}`,
          ),
        );
      });
      await page.route('**/assets/**/*.js', (route) => route.abort());

      await page.goto('/');

      expect(await isDark(page)).toBe(true);
      expectColour(await bodyColour(page), DARK_BODY);
      expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
      expect(violations).toEqual([]);
    });

    test('the init script is served from the same origin as a classic script in the head', async ({
      page,
    }) => {
      const response = await page.request.get('/theme-init.js');
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/javascript/);

      await page.goto('/');
      const tag = await page.evaluate(() => {
        const script = document.head.querySelector('script[src="/theme-init.js"]');
        return (
          script && {
            type: script.getAttribute('type'),
            async: script.hasAttribute('async'),
            defer: script.hasAttribute('defer'),
          }
        );
      });
      expect(tag).toEqual({ type: null, async: false, defer: false });
    });
  });

  test.describe('The toggle', () => {
    for (const [label, viewport] of [
      ['1280x800', DESKTOP],
      ['390x844', MOBILE],
    ] as const) {
      test(`is at least 44x44, one of the first tab stops, and does not move the layout at ${label}`, async ({
        browser,
      }) => {
        const { page } = await newPage(browser, 'light', viewport);
        await page.goto('/');
        const heading = page.getByRole('heading', { level: 1 });
        const before = await heading.boundingBox();

        const box = await toggle(page).boundingBox();
        await page.keyboard.press('Tab');
        await expect(toggle(page)).toBeFocused();
        await page.keyboard.press('Space');

        expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(await isDark(page)).toBe(true);
        const after = await heading.boundingBox();
        expect(after).toEqual(before);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await page.keyboard.press('Enter');
        expect(await isDark(page)).toBe(false);
      });
    }

    test('announces nothing when it switches', async ({ browser }) => {
      const { page } = await newPage(browser, 'light');
      await page.goto('/');

      await toggle(page).click();

      await expect(
        page.locator('[role="status"], [role="alert"], [aria-live]').filter({ hasText: /\S/ }),
      ).toHaveCount(0);
    });
  });

  // One table walked through every state, in one theme, so each state is checked for axe and keyboard.
  interface Views {
    readonly fac: Page;
    readonly anna: Page;
    readonly bob: Page;
  }

  async function allViews(
    browser: Browser,
    theme: Theme,
    check: (label: string, pages: Page[]) => Promise<void>,
  ): Promise<void> {
    const fac = await newPage(browser, theme);
    await fac.page.goto('/');
    await check('create page', [fac.page]);
    await fac.page.getByLabel('Your name').fill('Sven');
    await button(fac.page, 'Create session').click();
    await expect(
      fac.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
    ).toBeVisible();
    const gameUrl = fac.page.url();

    const joinPage = async () => {
      const p = await newPage(browser, theme);
      await p.page.goto(gameUrl);
      return p;
    };
    const guest = await joinPage();
    await expect(guest.page.getByRole('heading', { level: 1, name: 'Join session' })).toBeVisible();
    await check('join prompt', [guest.page]);
    await button(guest.page, 'Join').click();
    await expect(guest.page.getByText('Enter a name of 1 to 30 characters.')).toBeVisible();
    await check('join prompt with an error', [guest.page]);
    const names: Record<string, Page> = { Anna: guest.page };
    await guest.page.getByLabel('Your name').fill('Anna');
    await button(guest.page, 'Join').click();
    const bob = await joinPage();
    await bob.page.getByLabel('Your name').fill('Bob');
    await button(bob.page, 'Join').click();
    names.Bob = bob.page;
    const anna = names.Anna!;
    await expect(votersRegion(fac.page).getByRole('listitem')).toHaveCount(2);
    const views: Views = { fac: fac.page, anna, bob: bob.page };
    const everyone = [views.fac, views.anna, views.bob];

    await check('waiting', everyone);
    const form = views.fac.getByRole('form', { name: 'Story' });
    await form.getByLabel('Title').fill('Login page');
    await form.getByLabel('Link').fill(`${baseURL}/story-link-fixture`);
    await form.getByRole('button', { name: 'Start voting' }).click();
    for (const page of everyone)
      await expect(page.getByRole('region', { name: 'Story' })).toContainText('Login page');
    await check('voting', everyone);
    await card(views.anna, '3').click();
    await expect(card(views.anna, '3')).toBeChecked();
    await card(views.bob, '8').click();
    await expect(card(views.bob, '8')).toBeChecked();
    await expect(votersRegion(views.fac)).toContainText('Voted');
    await check('voting with selections', everyone);
    await button(views.fac, 'Reveal votes').click();
    for (const page of everyone) await expect(resultsRegion(page)).toBeVisible();
    await check('revealed', everyone);
    await button(views.fac, 'Record estimate').click();
    await expect(views.fac.getByRole('form', { name: 'Story' })).toBeVisible();
    await check('waiting with a summary', everyone);

    await views.fac.close();
    await expect(views.anna.getByText(/The facilitator is offline\./)).toBeVisible();
    await check('facilitator offline banner', [views.anna]);

    const facAgain = await fac.context.newPage();
    await facAgain.goto(gameUrl);
    await expect(
      facAgain.getByRole('heading', { level: 1, name: 'Story Estimation' }),
    ).toBeVisible();
    await button(facAgain, 'Remove Anna').click();
    await check('remove confirmation', [facAgain]);
    await button(facAgain, 'Confirm remove').click();
    await expect(views.anna.getByText('You were removed from this session.')).toBeVisible();
    await check('removed page', [views.anna]);

    const gone = await newPage(browser, theme);
    await gone.page.goto('/g/AAAAAAAAAAAAAAAAAAAAAA');
    await expect(
      gone.page.getByRole('heading', { level: 1, name: 'Session not found' }),
    ).toBeVisible();
    await check('game not found', [gone.page]);
  }

  test.describe('Accessibility in both themes', () => {
    for (const theme of THEMES) {
      test(`axe finds no violations on any view in the ${theme} theme`, async ({ browser }) => {
        test.setTimeout(120_000);
        const failures: string[] = [];

        await allViews(browser, theme, async (label, pages) => {
          for (const page of pages) {
            expect(await isDark(page), `${label} theme`).toBe(theme === 'dark');
            const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
            for (const violation of results.violations) {
              failures.push(
                `${theme} / ${label}: ${violation.id} (${violation.impact}) ${violation.nodes.map((n) => n.target.join(' ')).join(', ')}`,
              );
            }
          }
        });

        expect(failures).toEqual([]);
      });
    }
  });

  test.describe('Keyboard and visible focus', () => {
    // Marks every element that should be a tab stop, walks Tab, and checks what was reached.
    async function walk(page: Page, label: string, failures: string[]): Promise<void> {
      // Chrome keeps the keyboard starting point after a blur; a click on the page corner resets it.
      await page.mouse.click(1, 1);
      const expected = await page.evaluate(() => {
        const visible = (el: Element) =>
          el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const stops = [
          ...Array.from(
            document.querySelectorAll<HTMLElement>(
              'a[href], button, input, select, textarea, [tabindex]',
            ),
          ),
        ].filter(
          (el) =>
            !(el as HTMLButtonElement).disabled &&
            el.getAttribute('tabindex') !== '-1' &&
            // In a native radio group only the selected radio is a tab stop; arrows reach the rest.
            !(
              el instanceof HTMLInputElement &&
              el.type === 'radio' &&
              !el.checked &&
              el.name !== '' &&
              document.querySelector(`input[type=radio][name="${el.name}"]:checked`) !== null
            ) &&
            (visible(el) || (el instanceof HTMLInputElement && el.type === 'radio')),
        );
        stops.forEach((el, i) => el.setAttribute('data-stop', String(i)));
        return stops.map((el) => ({
          index: Number(el.getAttribute('data-stop')),
          description: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? (el as HTMLInputElement).value ?? '').trim().slice(0, 30)}"`,
        }));
      });

      const visited: Array<{ index: number; top: number; left: number; visibleFocus: boolean }> =
        [];
      for (let i = 0; i < expected.length + 4; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body || !el.hasAttribute('data-stop')) return null;
          // A radio is visually hidden inside its label; its card is the sibling that draws the ring.
          const target =
            el instanceof HTMLInputElement &&
            el.type === 'radio' &&
            getComputedStyle(el).opacity === '0'
              ? (el.nextElementSibling as HTMLElement)
              : el;
          const style = getComputedStyle(target);
          const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
          const box = target.getBoundingClientRect();
          return {
            index: Number(el.getAttribute('data-stop')),
            top: box.top + window.scrollY,
            left: box.left + window.scrollX,
            visibleFocus: outline || style.boxShadow !== 'none',
          };
        });
        if (info === null) break;
        visited.push(info);
      }

      const reached = new Set(visited.map((v) => v.index));
      for (const stop of expected) {
        if (!reached.has(stop.index)) failures.push(`${label}: never reached ${stop.description}`);
      }
      if (reached.size !== visited.length)
        failures.push(`${label}: the same element was focused twice (trap or loop)`);
      visited.forEach((v) => {
        if (!v.visibleFocus)
          failures.push(
            `${label}: stop ${expected[v.index]?.description} shows no focus indicator`,
          );
      });
      for (let i = 1; i < visited.length; i++) {
        const prev = visited[i - 1]!;
        const current = visited[i]!;
        const sameRow = Math.abs(current.top - prev.top) < 4;
        const lower = current.top >= prev.top - 4;
        // Reading order of columns: after the last stop of one column, the next column starts at its top.
        const nextColumn = current.left - prev.left > 200;
        if (!(sameRow ? current.left >= prev.left - 2 : lower || nextColumn))
          failures.push(
            `${label}: tab order jumps back at ${expected[current.index]?.description}`,
          );
      }
    }

    for (const theme of THEMES) {
      test(`every interactive element is reachable in order with a visible focus ring (${theme})`, async ({
        browser,
      }) => {
        test.setTimeout(120_000);
        const failures: string[] = [];

        await allViews(browser, theme, async (label, pages) => {
          for (const page of pages) await walk(page, `${theme} / ${label}`, failures);
        });

        expect(failures).toEqual([]);
      });
    }

    test('the card deck is one tab stop, arrows move and select, and Tab leaves it', async ({
      browser,
    }) => {
      const fac = await newPage(browser, 'dark');
      await fac.page.goto('/');
      await fac.page.getByLabel('Your name').fill('Sven');
      await button(fac.page, 'Create session').click();
      await expect(
        fac.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      const voter = await newPage(browser, 'dark');
      await voter.page.goto(fac.page.url());
      await voter.page.getByLabel('Your name').fill('Anna');
      await button(voter.page, 'Join').click();
      const form = fac.page.getByRole('form', { name: 'Story' });
      await form.getByLabel('Title').fill('T');
      await form.getByLabel('Link').fill('https://example.com/story');
      await form.getByRole('button', { name: 'Start voting' }).click();
      await expect(card(voter.page, '1')).toBeEnabled();

      await card(voter.page, '1').focus();
      await voter.page.keyboard.press('ArrowRight');
      await expect(card(voter.page, '2')).toBeChecked();
      await voter.page.keyboard.press('ArrowRight');
      await expect(card(voter.page, '3')).toBeChecked();
      await voter.page.keyboard.press('Tab');
      await expect(button(voter.page, 'Withdraw vote')).toBeFocused();
      await voter.page.keyboard.press('Shift+Tab');
      await expect(card(voter.page, '3')).toBeFocused();
      await voter.page.keyboard.press('Enter');
      await expect(card(voter.page, '3')).toBeChecked();
    });
  });

  test.describe('Visuals in dark mode', () => {
    test('a selected card is a clearly different light box with dark text', async ({ browser }) => {
      const fac = await newPage(browser, 'dark');
      await fac.page.goto('/');
      await fac.page.getByLabel('Your name').fill('Sven');
      await button(fac.page, 'Create session').click();
      await expect(
        fac.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
      ).toBeVisible();
      const voter = await newPage(browser, 'dark');
      await voter.page.goto(fac.page.url());
      await voter.page.getByLabel('Your name').fill('Anna');
      await button(voter.page, 'Join').click();
      const form = fac.page.getByRole('form', { name: 'Story' });
      await form.getByLabel('Title').fill('T');
      await form.getByLabel('Link').fill('https://example.com/story');
      await form.getByRole('button', { name: 'Start voting' }).click();
      await card(voter.page, '3').click();
      await expect(card(voter.page, '3')).toBeChecked();

      const styles = await voter.page.evaluate(() => {
        const face = (label: string) => {
          const input = Array.from(
            document.querySelectorAll<HTMLInputElement>('input[type=radio]'),
          ).find((i) => i.value === label)!;
          const style = getComputedStyle(input.nextElementSibling as HTMLElement);
          return { background: style.backgroundColor, colour: style.color };
        };
        return { selected: face('3'), other: face('5') };
      });

      expect(styles.selected.background).not.toBe(styles.other.background);
      expect(styles.selected.background).not.toBe('rgb(15, 23, 42)');
      expect(styles.selected.colour).not.toBe(styles.selected.background);
    });
  });

  test.describe('Announcements in both themes', () => {
    for (const theme of THEMES) {
      test(`the live regions still announce a vote, the reveal, a re-vote and a skip (${theme})`, async ({
        browser,
      }) => {
        const fac = await newPage(browser, theme);
        await fac.page.goto('/');
        await fac.page.getByLabel('Your name').fill('Sven');
        await button(fac.page, 'Create session').click();
        await expect(
          fac.page.getByRole('heading', { level: 1, name: 'Story Estimation' }),
        ).toBeVisible();
        const anna = await newPage(browser, theme);
        await anna.page.goto(fac.page.url());
        await anna.page.getByLabel('Your name').fill('Anna');
        await button(anna.page, 'Join').click();
        const bob = await newPage(browser, theme);
        await bob.page.goto(fac.page.url());
        await bob.page.getByLabel('Your name').fill('Bob');
        await button(bob.page, 'Join').click();
        await expect(votersRegion(fac.page).getByRole('listitem')).toHaveCount(2);
        const form = fac.page.getByRole('form', { name: 'Story' });
        await form.getByLabel('Title').fill('Login page');
        await form.getByLabel('Link').fill('https://example.com/story');
        await form.getByRole('button', { name: 'Start voting' }).click();
        await expect(liveRegion(bob.page)).toHaveText('Voting is open: Login page');

        await card(anna.page, '5').click();
        await expect(liveRegion(bob.page)).toHaveText('Anna has voted');
        await card(bob.page, '5').click();
        await expect(liveRegion(anna.page)).toHaveText('Bob has voted');
        await button(fac.page, 'Reveal votes').click();
        await expect(liveRegion(anna.page)).toHaveText('Votes revealed. Consensus: 5');
        await button(fac.page, 'Re-vote').click();
        await expect(liveRegion(anna.page)).toHaveText('Re-vote started');
        await button(fac.page, 'Skip story').click();
        await expect(liveRegion(anna.page)).toHaveText('Story skipped');
      });
    }
  });
});
