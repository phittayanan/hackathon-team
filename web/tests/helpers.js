import { expect } from '@playwright/test';

// presenter: true turns on the team's hotkeys and clock panel (?presenter=1); judges never see them.
export async function home(page, { presenter = false } = {}) {
  await page.goto(presenter ? '/?test=1&presenter=1' : '/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await revealHome(page);
}

export async function revealHome(page) {
  // Most tests start from the post-greeting screen without triggering an agent turn.
  await page.evaluate(() => document.body.classList.add('started'));
}

// Type into the text input next to the mic, as a judge would.
export async function say(page, text) {
  await revealHome(page);
  await expect(page.locator('#fallbackInput')).toBeVisible();
  await page.fill('#fallbackInput', text);
  await page.keyboard.press('Enter');
}

export async function expectHome(page) {
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'home', { timeout: 10_000 });
  await expect(page.locator('#stage')).not.toHaveClass(/open/);
  await expect(page.locator('#stage .scene')).toHaveCount(0);
}

// The home screen has no buttons: the agent opens the secretary views (secretary_action), and the
// team opens the notification test with the presenter hotkey n. Same calls as those paths.
export const openSecretary = (page, view) => page.evaluate((v) => window.agentOS.openScene('secretary', { view: v }), view);
export const openNoticeTest = (page) => page.evaluate(() => window.agentOS.noticeTest());
