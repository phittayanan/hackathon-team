import { test, expect } from '@playwright/test';
import { home, say } from './helpers.js';

test('a video tutorial request opens the matching YouTube search safely', async ({ page }) => {
  await home(page);
  await say(page, 'ช่วยหาวิดีโอสอนเล่น Rubik’s Cube ให้หน่อย');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'video-search');
  await expect(page.getByTestId('video-search-query')).toHaveText('เล่น Rubik’s Cube');
  const link = page.getByTestId('video-search-link');
  await expect(link).toHaveAttribute('href', /youtube\.com\/results\?search_query=/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
