import { test, expect } from '@playwright/test';
import { home, expectHome } from './helpers.js';

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
  test(`long voice text stays separate from content and controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await home(page);
    await page.locator('#fallbackInput').click();
    await page.evaluate(async () => {
      const { showSubtitle } = await import('/js/voice.js');
      const { LINES } = await import('/js/lines.js');
      showSubtitle(LINES.train_intro.repeat(8), 0);
    });
    await expect(page.locator('#subtitle')).toBeVisible();
    const checkRegions = async () => {
      const boxes = await page.evaluate(() => {
        const rect = (selector) => {
          const { top, bottom, left, right } = document.querySelector(selector).getBoundingClientRect();
          return { top, bottom, left, right };
        };
        return {
          workspace: rect('.workspace'), subtitle: rect('#subtitle'), composer: rect('.composer'), phone: rect('.phone'), homeButton: rect('.home-btn'),
          overflow: document.documentElement.scrollWidth > innerWidth,
          transcriptScrollable: document.querySelector('#subtitle').scrollHeight > document.querySelector('#subtitle').clientHeight,
        };
      });
      expect(boxes.workspace.bottom).toBeLessThanOrEqual(boxes.subtitle.top);
      expect(boxes.homeButton.bottom).toBeLessThanOrEqual(boxes.workspace.top);
      expect(boxes.subtitle.bottom).toBeLessThanOrEqual(boxes.composer.top);
      expect(boxes.composer.bottom).toBeLessThanOrEqual(boxes.phone.bottom);
      expect(boxes.subtitle.left).toBeGreaterThanOrEqual(boxes.phone.left);
      expect(boxes.subtitle.right).toBeLessThanOrEqual(boxes.phone.right);
      expect(boxes.overflow).toBe(false);
      expect(boxes.transcriptScrollable).toBe(true);
    };
    await checkRegions();
    await page.locator('#suggest button').last().scrollIntoViewIfNeeded();
    const suggestion = await page.locator('#suggest button').last().boundingBox();
    const subtitle = await page.locator('#subtitle').boundingBox();
    expect(suggestion.y + suggestion.height).toBeLessThanOrEqual(subtitle.y);

    await page.evaluate(() => window.agentOS.openScene('payment'));
    await checkRegions();
    await page.getByTestId('allow').click();
    await expect(page.getByTestId('pay-success')).toBeVisible();
    await expectHome(page);
  });
}

test('large subtitles, offline notice and reduced motion do not cover task buttons', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await home(page);
  await page.locator('#fallbackInput').click();
  await page.addStyleTag({ content: '#subtitle { font-size: 24px; }' });
  await page.evaluate(async () => {
    const { goOffline } = await import('/js/api.js');
    const { showSubtitle } = await import('/js/voice.js');
    const { LINES } = await import('/js/lines.js');
    goOffline('limit');
    window.agentOS.openScene('generated', { spec: {
      kind: 'test', title: 'Task', accent: 'orange', blocks: [{ type: 'call', label: 'Call', number: '1669' }], urgency: 'urgent', proposals: [],
    } });
    showSubtitle(LINES.train_intro.repeat(8), 0);
  });
  await page.getByTestId('g-call').scrollIntoViewIfNeeded();
  const call = await page.getByTestId('g-call').boundingBox();
  const subtitle = await page.locator('#subtitle').boundingBox();
  expect(call.y + call.height).toBeLessThanOrEqual(subtitle.y);
  await page.getByTestId('home-btn').click();
  await expectHome(page);
});
