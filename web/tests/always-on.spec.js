import { test, expect } from '@playwright/test';
import { home, expectHome } from './helpers.js';

const fire = (page, event) => page.evaluate((e) => window.agentOS.fireFeed(e), event);

test('a flight feed event makes the agent speak first and open the flight card, no hotkey', async ({ page }) => {
  await home(page, { presenter: true });
  await expect(page.locator('body')).toHaveAttribute('data-agent', 'on');
  await fire(page, 'flight-delayed');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight', { timeout: 5000 });
  await expect(page.locator('#subtitle')).toContainText('ดีเลย์');
  await page.click('[data-testid=yes]');
  await expectHome(page);
  // Handled once: the same delay does not open it again.
  await page.waitForTimeout(1200);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'home');
});

test('sleep data opens training by itself', async ({ page }) => {
  await home(page, { presenter: true });
  await fire(page, 'sleep-synced');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'training', { timeout: 5000 });
  // The race sign-up waits for the user's tap before it sends and folds home.
  await page.click('[data-testid=race-submit]');
  await expectHome(page);
});

test('the agent waits while a scene is open, then speaks when home', async ({ page }) => {
  await home(page, { presenter: true });
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment');
  await fire(page, 'flight-delayed');
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment');
  await page.click('[data-testid=deny]');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight', { timeout: 8000 });
});

test('a new shopping email alone does not interrupt', async ({ page }) => {
  await home(page, { presenter: true });
  await fire(page, 'email-shopping');
  await page.waitForTimeout(1200);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'home');
});

test('hidden presenter control: tap the clock 3 times, fire flight delayed', async ({ page }) => {
  await home(page, { presenter: true });
  await expect(page.locator('[data-testid=presenter]')).toBeHidden();
  await page.click('#clock', { clickCount: 3 });
  await expect(page.locator('[data-testid=presenter]')).toBeVisible();
  await page.click('[data-testid=presenter] [data-event=flight-delayed]');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight', { timeout: 5000 });
});
