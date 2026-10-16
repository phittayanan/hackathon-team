import { test, expect } from '@playwright/test';
import { home, expectHome, say, openSecretary, openNoticeTest } from './helpers.js';

test('today, email tasks and completion share state without duplicating appointments', async ({ page }) => {
  await home(page);
  await openSecretary(page, 'email');
  await expect(page.locator('.secretary-title')).toHaveText('จากอีเมลเป็นงาน');
  await expect(page.locator('.secretary-badge')).toHaveCount(0);
  await page.getByTestId('import-email').click();
  await page.getByTestId('import-email').click();
  await expect(page.locator('.secretary-task')).toHaveCount(3);
  await page.locator('.secretary-task input').first().check();
  await page.getByRole('button', { name: 'สรุปวันนี้', exact: true }).last().click();
  await expect(page.locator('.secretary-summary')).toContainText('2 งานค้าง');
  await expect(page.locator('.secretary-event')).toHaveCount(3);
});

test('meeting alert proposes a free slot and sends only on explicit test-send tap', async ({ page }) => {
  await home(page);
  await openNoticeTest(page);
  await page.getByTestId('schedule-notice').click();
  await expect(page.getByTestId('notification-card')).toBeVisible();
  await expect(page.locator('.secretary-conflict')).toContainText('ประชุมทีม');
  await page.getByTestId('prepare-reply').click();
  await expect(page.locator('.secretary-title')).toHaveText('ร่างตอบกลับ');
  expect(await page.locator('.scene-secretary').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('.scene-secretary textarea')).toHaveValue(/14:30/);
  await page.locator('.scene-secretary textarea').fill('สะดวกเป็น 14:30 นะคะ');
  await page.evaluate(() => window.agentOS.secretary.schedule('email'));
  await expect(page.locator('.scene-secretary textarea')).toHaveValue('สะดวกเป็น 14:30 นะคะ');
  await expect(page.locator('.scene-secretary textarea')).toBeFocused();
  await say(page, 'ส่งเลย');
  expect(await page.evaluate(() => window.agentOS.secretary.get().sent)).toBe(false);
  await page.getByTestId('send-demo-reply').click();
  await expect(page.getByTestId('send-demo-reply')).toBeDisabled();
  expect(await page.evaluate(() => window.agentOS.secretary.get().events[1].start)).toBe('14:30');
});

test('alerts wait behind a task, snooze and reset; ordinary email never opens a scene', async ({ page }) => {
  await home(page);
  await openSecretary(page, 'today');
  await page.evaluate(() => window.agentOS.secretary.schedule('deadline'));
  await page.waitForTimeout(650);
  await expect(page.locator('.scene-secretary')).toHaveAttribute('data-view', 'today');
  await page.getByTestId('home-btn').click();
  await expect(page.getByTestId('notification-card')).toBeVisible();
  await page.getByTestId('snooze-1').click();
  await expectHome(page);
  expect(await page.evaluate(() => window.agentOS.secretary.get().notices[0].status)).toBe('scheduled');
  await openNoticeTest(page);
  await page.getByTestId('reset-secretary').click();
  expect(await page.evaluate(() => window.agentOS.secretary.get().notices)).toEqual([]);
  await openNoticeTest(page);
  await page.getByRole('combobox', { name: 'เหตุการณ์' }).selectOption('email');
  await page.getByTestId('schedule-notice').click();
  await page.waitForTimeout(650);
  await expectHome(page);
  expect(await page.evaluate(() => window.agentOS.secretary.get().quietEmails)).toBe(1);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`secretary controls remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await home(page);
    await openNoticeTest(page);
    await expect(page.locator('dialog')).toBeVisible();
    await page.getByRole('combobox', { name: 'แจ้งเมื่อ' }).selectOption('10');
    await page.getByTestId('schedule-notice').click();
    expect(await page.evaluate(() => window.agentOS.secretary.get().notices[0].status)).toBe('scheduled');
    await openSecretary(page, 'email');
    await page.getByTestId('import-email').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const footer = await page.locator('.interaction-panel').boundingBox();
    await page.locator('.secretary-task').last().scrollIntoViewIfNeeded();
    const visible = await page.locator('.secretary-task').last().boundingBox();
    expect(visible.y + visible.height).toBeLessThanOrEqual(footer.y + 1);
  });
}
