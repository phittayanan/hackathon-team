import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';

const product = { id: 'p1', title: '<script>alert(1)</script>', seller: 'Real merchant', amount: 99900, currency: 'THB', description: 'Wireless headphones', url: 'https://merchant.example/products/headphones', image: null };

test('no shop button on the home; only Shopify discovery is offered; web search without a key is unavailable', async ({ page, request }) => {
  await home(page);
  await expect(page.getByTestId('shopify-catalog')).toHaveCount(0);
  await expect(page.getByTestId('shopping-search')).toHaveCount(0);
  expect((await request.post('/api/search', { data: { query: 'headphones' } })).status()).toBe(503);
  expect((await (await request.get('/api/health')).json()).search).toBe(false);
});

test('spoken requirements show Shopify product cards and selection never orders or pays', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/catalog', (route) => {
    calls++; expect(route.request().postDataJSON().budget).toBe(1500);
    return route.fulfill({ json: { provider: 'shopify', products: [product] } });
  });
  await home(page); await say(page, 'หาหูฟัง งบ 1500');
  await expect(page.locator('.catalog-product')).toHaveCount(1);
  await expect(page.locator('.catalog-product h2')).toHaveText('<script>alert(1)</script>');
  await expect(page.locator('.catalog-price')).toContainText('999.00');
  await expect(page.locator('.catalog-product')).toContainText('Real merchant');
  await page.getByRole('button', { name: 'เลือกรายการนี้' }).click();
  await expect(page.getByRole('button', { name: 'เลือกแล้ว' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'ดูสินค้าที่ร้าน' })).toHaveAttribute('href', product.url);
  expect(calls).toBe(1);
  await expect(page.getByTestId('checkout')).toHaveCount(0);
  // The next request carries the page's results and the chosen one (state()), not just {catalog:true}.
  const next = page.waitForRequest('**/api/route');
  await say(page, 'อันไหนถูกสุด');
  expect((await next).postDataJSON()).toMatchObject({ context: 'shopping', catalog: true, query: 'หาหูฟัง งบ 1500',
    results: [{ title: '<script>alert(1)</script>', seller: 'Real merchant', price: '฿999.00' }], error: null, chosen: '<script>alert(1)</script> (Real merchant) ฿999.00' });
});

test('Shopify empty results and errors are visible and retryable on a small phone', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/catalog', (route) => route.fulfill({ json: ++calls === 1 ? { products: [] } : { error: 'Shopify rate limited' } }));
  await page.setViewportSize({ width: 320, height: 568 });
  // No button: the agent opens the catalog (open_scene shopping with {"catalog":true}).
  await home(page); await page.evaluate(() => window.agentOS.openScene('shopping', { catalog: true }));
  await page.getByLabel('อยากได้สินค้าแบบไหน').fill('shoes');
  await page.getByRole('button', { name: 'ค้นสินค้า', exact: true }).click();
  await expect(page.locator('.scene-shopping [role=status]')).toContainText('ยังไม่พบสินค้า');
  await page.getByRole('button', { name: 'ค้นสินค้า', exact: true }).click();
  await expect(page.locator('.scene-shopping [role=status]')).toContainText('Shopify rate limited');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('home-btn').click(); await expectHome(page);
});
