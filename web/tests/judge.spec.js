import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';

// A judge alone: no presenter, no keys. What this is, sentences to tap, a text input, a way home.

test('after greeting: Q-Bot, three suggestions, the input next to the mic, no buttons or presenter controls', async ({ page }) => {
  await home(page);
  await expect(page.locator('[data-testid=intro]')).toContainText('Q-Bot');
  await expect(page.locator('[data-testid=suggest] button')).toHaveCount(3);
  await expect(page.locator('.secretary-shortcuts, [data-testid=shopify-catalog], [data-testid=memory-entry]')).toHaveCount(0);
  await expect(page.locator('[data-testid=composer] #mic')).toBeVisible();
  await expect(page.locator('#fallbackInput')).toBeVisible();
  await expect(page.locator('[data-testid=presenter]')).toHaveCount(0);
  await expect(page.locator('[data-testid=home-btn]')).toBeHidden();
  // Presenter hotkeys do nothing for a judge.
  await page.locator('[data-testid=intro]').click();
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'home');
});

for (const [kind, scene, check] of [
  ['สัปดาห์นี้ยุ่งมาก', 'shopping', '.scene-shopping'],
  ['ช่วยทำ to-do list ให้หน่อย', 'generated', '[data-testid=g-checklist], .g-checklist'],
  ['นิ้วโดนมีดบาด เลือดไหลไม่หยุด', 'generated', 'a[href="tel:1669"], .g-steps'],
  ['how is my training', 'training', '.scene-training'],
]) {
  test(`typed request "${kind}" routes to ${scene} and the home button folds back`, async ({ page }) => {
    await home(page);
    await say(page, kind);
    await expect(page.locator('body')).toHaveAttribute('data-scene', scene, { timeout: 10_000 });
    await expect(page.locator(check).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid=home-btn]')).toBeVisible();
    await page.click('[data-testid=home-btn]');
    await expectHome(page);
  });
}

test('typed text works like speech, and the input stays visible inside a scene', async ({ page }) => {
  await home(page);
  await say(page, 'flight');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight', { timeout: 10_000 });
  await expect(page.locator('#fallbackInput')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expectHome(page);
});

test('a generated page from a web search shows its sources as safe links', async ({ page }) => {
  await home(page);
  await page.evaluate(async () => {
    const { validateSpec } = await import('/js/genui.js');
    const spec = validateSpec({
      title: '10K runs in Bangkok',
      blocks: [
        { type: 'card', title: 'Bangkok 10K', text: '9 Nov' },
        { type: 'sources', items: [{ title: 'Bangkok 10K', url: 'https://run.example/bkk' }, { title: 'bad', url: 'javascript:alert(1)' }] },
      ],
    });
    window.agentOS.openScene('generated', { spec });
  });
  const links = page.locator('[data-testid=g-sources] a');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute('href', 'https://run.example/bkk');
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
});
