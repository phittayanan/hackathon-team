import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';

const place = { id: 'p1', name: '<b>Cafe Amazon</b>', address: 'บางมด กรุงเทพฯ', rating: 4.4, ratings: 1200, openNow: true, distanceM: 420, url: 'https://maps.google.com/?cid=1' };

test('a nearby request sends the browser position to our server and shows place cards in the page', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 13.6512, longitude: 100.4943 });
  let sent;
  await page.route('**/api/places', (route) => { sent = route.request().postDataJSON(); return route.fulfill({ json: { provider: 'google-maps', near: true, places: [place] } }); });
  await home(page);
  await say(page, 'หาร้านกาแฟแถวนี้ให้หน่อย');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'places');
  await expect(page.locator('.places-card')).toHaveCount(1);
  expect(sent).toEqual({ query: 'ร้านกาแฟ', lat: 13.6512, lng: 100.4943 });
  await expect(page.locator('.places-card h2')).toHaveText('<b>Cafe Amazon</b>');
  await expect(page.locator('.places-meta')).toHaveText('420 ม. · ★ 4.4 (1,200) · เปิดอยู่');
  const link = page.getByRole('link', { name: 'ดูใน Google Maps' });
  await expect(link).toHaveAttribute('href', place.url);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.places-credit')).toHaveText('Google Maps');
  await expect(page.locator('.places-credit')).toHaveAttribute('translate', 'no');
  // The next request carries what the page found, never the coordinates.
  const next = page.waitForRequest('**/api/route');
  await say(page, 'ร้านไหนใกล้สุด');
  const body = (await next).postDataJSON();
  expect(body).toMatchObject({ context: 'places', query: 'ร้านกาแฟ', near: true, results: [{ name: '<b>Cafe Amazon</b>', distance: '420 ม.' }] });
  expect(JSON.stringify(body)).not.toContain('13.65');
});

test('without location permission it still searches, and errors stay visible on a small phone', async ({ page }) => {
  let sent;
  await page.route('**/api/places', (route) => { sent = route.request().postDataJSON(); return route.fulfill({ json: { error: 'ยังไม่ได้ตั้งค่า GOOGLE_MAPS_API_KEY' } }); });
  await page.setViewportSize({ width: 320, height: 568 });
  await home(page);
  await page.evaluate(() => window.agentOS.openScene('places', { query: 'ร้านขายยา' }));
  await expect(page.locator('.scene-places [role=status]')).toContainText('GOOGLE_MAPS_API_KEY', { timeout: 10_000 });
  expect(sent).toEqual({ query: 'ร้านขายยา' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('home-btn').click(); await expectHome(page);
});
