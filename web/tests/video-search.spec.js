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

test('without a video list the scene says so and keeps the YouTube link', async ({ page }) => {
  await page.route('**/api/videos', (route) => route.fulfill({ json: { unavailable: true, videos: [] } }));
  await home(page);
  await say(page, 'ช่วยหาวิดีโอสอนเล่น Rubik’s Cube ให้หน่อย');
  await expect(page.getByTestId('video-search')).toContainText('ดึงรายการคลิปไม่ได้ตอนนี้');
  await expect(page.getByTestId('video-list').locator('li')).toHaveCount(0);
  await expect(page.getByTestId('video-search-link')).toBeVisible();
});

test('the video list plays a tapped clip in the app and goes back to the list', async ({ page }) => {
  let asked = null;
  await page.route('**/api/videos', async (route) => {
    asked = route.request().postDataJSON();
    await route.fulfill({ json: { provider: 'youtube', query: asked.query, videos: [
      { id: 'abcdefghijk', title: 'Rubik’s Cube มือใหม่ ทีละขั้น', channel: 'Cube TH', published: '2024-05-01' },
      { id: 'bad id"><x', title: 'dropped', channel: 'x' },
      { id: 'lmnopqrstuv', title: 'Solve a cube in 10 minutes', channel: 'Cube EN', published: '2023-01-01' },
    ] } });
  });
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 404 }));
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await home(page);
  await say(page, 'ช่วยหาวิดีโอสอนเล่น Rubik’s Cube ให้หน่อย');
  const cards = page.getByTestId('video-list').getByRole('button');
  await expect(cards).toHaveCount(2);
  expect(asked.query).toBe('เล่น Rubik’s Cube');
  await expect(cards.first()).toContainText('Cube TH');
  const box = await cards.first().boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await cards.first().click();
  const frame = page.getByTestId('video-frame');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0&playsinline=1');
  await expect(page.getByTestId('video-list')).toBeHidden();
  await page.getByTestId('video-back').click();
  await expect(page.getByTestId('video-player')).toBeHidden();
  await expect(cards).toHaveCount(2);
});

test('Shorts: a vertical grid, a looping 9:16 player and a next button that moves through the clips', async ({ page }) => {
  let asked = null;
  await page.route('**/api/videos', async (route) => {
    asked = route.request().postDataJSON();
    await route.fulfill({ json: { provider: 'youtube', query: asked.query, shorts: true, videos: [
      { id: 'aaaaaaaaaaa', title: 'Latte art หัวใจ', channel: 'Barista TH', seconds: 45 },
      { id: 'bbbbbbbbbbb', title: 'Latte art ทิวลิป', channel: 'Barista TH', seconds: 59 },
    ] } });
  });
  await page.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 404 }));
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
  await home(page);
  await say(page, 'ขอดูช็อตส์สอนทำ latte art หน่อย');
  await expect(page.getByTestId('video-search')).toHaveClass(/is-shorts/);
  const cards = page.getByTestId('video-list').getByRole('button');
  await expect(cards).toHaveCount(2);
  expect(asked).toEqual({ query: 'ทำ latte art', shorts: true });
  await expect(cards.first()).toContainText('0:45');
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); // two columns
  expect(a.height).toBeGreaterThan(a.width); // vertical cards
  await cards.first().click();
  const frame = page.getByTestId('video-frame');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?autoplay=1&rel=0&playsinline=1&loop=1&playlist=aaaaaaaaaaa');
  const box = await frame.boundingBox();
  expect(box.height).toBeGreaterThan(box.width);
  await page.getByTestId('video-next').click();
  await expect(frame).toHaveAttribute('src', /embed\/bbbbbbbbbbb/);
  await page.getByTestId('video-next').click();
  await expect(frame).toHaveAttribute('src', /embed\/aaaaaaaaaaa/);
  await expect(page.getByRole('link', { name: /YouTube/ }).first()).toHaveAttribute('href', 'https://www.youtube.com/shorts/aaaaaaaaaaa');
});
