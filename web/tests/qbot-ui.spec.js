import { test, expect } from '@playwright/test';
import { home, openSecretary, openNoticeTest } from './helpers.js';

test('Q-Bot home: only the agent and the composer from the start, suggestions after the greeting', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await expect(page).toHaveTitle('Q-Bot');
  await expect(page.locator('.intro')).toHaveText('Q-Bot');
  // No button cluster on the home screen: everything goes through the agent.
  await expect(page.locator('.secretary-shortcuts, #catalogBtn, #memoryEntry')).toHaveCount(0);
  await expect(page.locator('#fallbackInput')).toBeVisible();
  await expect(page.locator('.send')).toBeVisible();
  await expect(page.locator('#mic')).toBeVisible();
  await expect(page.locator('#suggest button').first()).toBeHidden();
  await page.locator('.intro h1').click();
  await expect(page.locator('body')).toHaveClass(/started/);
  await expect(page.locator('#suggest button')).toHaveCount(3);
  await expect(page.locator('#suggest button').first()).toBeVisible();
  await expect(page.locator('.interaction-panel')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.interaction-panel')).toHaveCSS('border-top-width', '0px');
});

test('a suggestion tap is sent as the user and opens its task', async ({ page }) => {
  await home(page);
  await page.locator('#suggest button', { hasText: 'to-do' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated', { timeout: 10_000 });
  const typed = await page.evaluate(() => window.__runlog.find((e) => e.type === 'user_text'));
  expect(typed).toMatchObject({ text: 'ทำ to-do list ให้หน่อย', via: 'suggestion' });
});

test('language switches live, preserves user data and open task state, and survives reload', async ({ page }) => {
  await home(page);
  await page.locator('#fallbackInput').fill('ข้อความของฉัน');
  await openSecretary(page, 'email');
  await page.getByTestId('import-email').click();
  await page.locator('.secretary-task input').first().check();
  await page.locator('[data-language=en]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#suggest button').first()).toHaveText('This week is hectic');
  await expect(page.locator('.secretary-title')).toHaveText('Email to tasks');
  await expect(page.locator('.secretary-task input').first()).toBeChecked();
  await expect(page.locator('#fallbackInput')).toHaveValue('ข้อความของฉัน');
  await expect(page.locator('#fallbackInput')).toHaveAttribute('placeholder', 'Type here');
  await page.getByTestId('home-btn').click();
  await openNoticeTest(page);
  await expect(page.getByRole('combobox', { name: 'Event' })).toBeVisible();
  await page.getByTestId('close-demo').click();
  await page.locator('[data-language=th]').click();
  await openNoticeTest(page);
  await expect(page.getByRole('combobox', { name: 'เหตุการณ์' })).toBeVisible();
  await page.getByTestId('close-demo').click();
  await page.locator('[data-language=en]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#suggest button').first()).toHaveText('This week is hectic');
});

for (const width of [320, 390]) {
  test(`suggestions fit at ${width}px in Thai and English`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    await home(page);
    await expect(page.locator('#mascot')).toHaveAttribute('data-ready', '1');
    for (const lang of ['th', 'en']) {
      await page.locator(`[data-language=${lang}]`).click();
      const chips = await page.locator('#suggest button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      const subtitle = await page.locator('.interaction-panel').boundingBox();
      for (const chip of chips) {
        expect(chip.left).toBeGreaterThanOrEqual(0);
        expect(chip.right).toBeLessThanOrEqual(width);
        expect(chip.bottom).toBeLessThanOrEqual(subtitle.y);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`qbot-${lang}.png`) });
    }
  });
}
