import { test, expect } from '@playwright/test';
import { expectHome } from './helpers.js';

// A judge opens the link and has not tapped anything yet: the way to type must already be there,
// inside the window, on a laptop and on a phone. Everything goes through the agent: no shop button.
// 1280x680 and 1440x760: a laptop screen minus the browser's own bars.
for (const [width, height] of [[1440, 900], [1280, 800], [1920, 1080], [1280, 680], [1440, 760], [390, 844], [320, 568]]) {
  test(`before any tap at ${width}x${height}: the input, send and mic are shown inside the window, no shop button`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?test=1');
    await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
    await expect(page.locator('#fallbackInput')).toBeVisible();
    await expect(page.locator('[data-testid=composer] .send')).toBeVisible();
    await expect(page.locator('#mic')).toBeVisible();
    await expect(page.getByTestId('shopify-catalog')).toHaveCount(0);
    await expect(page.getByText('เลือกสินค้า')).toHaveCount(0);
    const fit = async () => page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const home = document.querySelector('#home');
      return {
        composer: box('.composer').bottom <= innerHeight,
        phone: box('.phone').bottom <= innerHeight && box('.phone').top >= 0,
        noPageScroll: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        // Every home button is in view, none hidden under the voice line and the input.
        homeFits: home.scrollHeight <= home.clientHeight + 1,
      };
    });
    expect(await fit()).toEqual({ composer: true, phone: true, noPageScroll: true, homeFits: true });
    // After the first tap (greeting, secretary shortcuts shown) it still all fits.
    await page.locator('[data-testid=intro]').click();
    await expect(page.locator('body')).toHaveClass(/started/);
    await page.waitForTimeout(300);
    expect(await fit()).toEqual({ composer: true, phone: true, noPageScroll: true, homeFits: true });
  });
}

// Suggestions are picked at random from a pool: the three widest lines must still fit, in both languages.
for (const [width, height] of [[1280, 680], [390, 844], [320, 568]]) {
  test(`the widest three suggestions fit at ${width}x${height} in Thai and English`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?test=1');
    await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
    await page.locator('[data-testid=intro]').click();
    for (const lang of ['th', 'en']) {
      await page.locator(`[data-language=${lang}]`).click();
      const fits = await page.evaluate(async () => {
        const { SUGGESTION_POOL } = await import('/js/suggest.js');
        window.agentOS.showSuggestions(SUGGESTION_POOL);
        await new Promise((r) => setTimeout(r, 100));
        const widths = [...document.querySelectorAll('#suggest button')].map((b, i) => [b.getBoundingClientRect().width, SUGGESTION_POOL[i]]);
        window.agentOS.showSuggestions(widths.sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, s]) => s));
        await new Promise((r) => setTimeout(r, 700));
        const home = document.querySelector('#home');
        return home.scrollHeight <= home.clientHeight + 1 && document.documentElement.scrollHeight <= innerHeight;
      });
      expect(fits, lang).toBe(true);
    }
  });
}

test('typing first, before any tap, gets an answer and no late greeting', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await page.locator('#fallbackInput').fill('ช่วยทำ to-do list ให้หน่อย');
  await page.locator('#fallbackInput').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated', { timeout: 10_000 });
  await page.getByTestId('home-btn').click();
  await expectHome(page);
  // A later tap elsewhere does not greet in the middle of the conversation.
  await page.mouse.click(200, 120);
  await page.waitForTimeout(400);
  const greets = await page.evaluate(() => window.__runlog.filter((e) => e.type === 'greet').length);
  expect(greets).toBe(0);
});

test('an old app.js kept by the browser heals itself: files fetched again, one reload, the input shows', async ({ page }) => {
  // 2026-10-16: Safari ran the app.js of an earlier deploy against the new page and boot failed.
  let appRequests = 0;
  await page.route('**/js/app.js', (route) => (++appRequests === 1
    ? route.fulfill({ contentType: 'text/javascript', body: "(async () => { document.getElementById('suggest-old').append('x'); })();" })
    : route.continue()));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await expect(page.locator('#fallbackInput')).toBeVisible();
  expect(appRequests).toBeGreaterThanOrEqual(3); // the old file, the fetch past the cache, the reload
  // Once per tab: a second failure does not reload again.
  expect(await page.evaluate(() => sessionStorage.getItem('qbot.healed'))).toBe('1');
});

test('the shopping catalog still opens through the agent', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await page.evaluate(() => window.agentOS.openScene('shopping', { catalog: true }));
  await expect(page.locator('.scene-shopping')).toBeVisible();
  await expect(page.getByLabel('อยากได้สินค้าแบบไหน')).toBeVisible();
});
