import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';

const product = { id: 'p1', title: '<script>alert(1)</script>', seller: 'Real merchant', amount: 99900, currency: 'THB', description: 'Wireless headphones', url: 'https://merchant.example/products/headphones', image: null };

const SDK = `export const Conversation = { async startSession(opts) {
  window.__catalogConv = { opts, setMicMuted() {}, setVolume() {}, sendUserMessage() {}, sendContextualUpdate() {}, async endSession() {} };
  opts.onConnect(); return window.__catalogConv;
} };`;
async function catalogHome(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/catalog' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK }));
  await home(page);
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
}
const tool = (page, name, params) => page.evaluate(([name, params]) => window.__catalogConv.opts.clientTools[name](params), [name, params]);
const openCatalog = (page, data = {}) => tool(page, 'open_scene', { scene: 'shopping', data_json: JSON.stringify({ catalog: true, query: 'running headphones', budget: 2000, ...data }) });

test('live catalog returns visible results and tracks owner/tool selections without another search or payment', async ({ page }) => {
  const products = [{ ...product, id: 'A', title: 'Running A', amount: 180000 }, { ...product, id: 'B', title: 'Running B', amount: 120000 }];
  let calls = 0;
  await page.route('**/api/catalog', (r) => { calls++; return r.fulfill({ json: { products } }); });
  await catalogHome(page);
  const result = JSON.parse(await openCatalog(page));
  expect(result.status).toBe('ready');
  expect(result.products.map((p) => [p.position, p.id, p.amount])).toEqual([[1, 'A', 180000], [2, 'B', 120000]]);
  await expect(page.locator('.catalog-product h2')).toHaveText(result.products.map((p) => p.title));
  await page.getByRole('button', { name: 'เลือกรายการนี้' }).nth(1).click();
  expect(JSON.parse(await tool(page, 'catalog_action', { action: 'read' })).selectedId).toBe('B');
  expect(JSON.parse(await tool(page, 'catalog_action', { action: 'select', data_json: '{"product_id":"A"}' })).selectedId).toBe('A');
  await expect(page.locator('.catalog-product').first().getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  expect(await tool(page, 'catalog_action', { action: 'select', data_json: '{"product_id":"not-visible"}' })).toMatch(/^error/);
  expect(calls).toBe(1);
  await expect(page.getByTestId('checkout')).toHaveCount(0);
  await expect(page.getByTestId('allow')).toHaveCount(0);
});

test('live refinements keep omitted constraints, clear old selection and reuse the open catalog', async ({ page }) => {
  const requests = [];
  await page.route('**/api/catalog', (r) => {
    const input = r.request().postDataJSON(); requests.push(input);
    return r.fulfill({ json: { products: [{ ...product, id: input.budget === 1500 ? 'B' : 'A' }] } });
  });
  await catalogHome(page);
  await openCatalog(page);
  await tool(page, 'catalog_action', { action: 'select', data_json: '{"product_id":"A"}' });
  const refined = JSON.parse(await tool(page, 'catalog_action', { action: 'search', data_json: '{"budget":1500}' }));
  expect(requests[1]).toEqual({ query: 'running headphones', budget: 1500 });
  expect(refined.selectedId).toBeNull();
  expect(refined.products[0]).toMatchObject({ id: 'B', position: 1 });
  expect(await tool(page, 'catalog_action', { action: 'select', data_json: '{"product_id":"A"}' })).toMatch(/^error/);
  const changed = JSON.parse(await tool(page, 'open_scene', { scene: 'shopping', data_json: '{"catalog":true,"query":"running headphones waterproof"}' }));
  expect(requests[2]).toEqual({ query: 'running headphones waterproof', budget: 1500 });
  expect(changed.budget).toBe(1500);
  expect(await page.evaluate(() => window.__runlog.filter((e) => e.type === 'scene_open' && e.name === 'shopping').length)).toBe(1);
  expect(await tool(page, 'catalog_action', { action: 'search', data_json: '{"budget":"1500"}' })).toMatch(/^error/);
  expect(requests).toHaveLength(3);
});

test('live catalog distinguishes an empty search from failure and retries with the same conditions', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/catalog', (r) => {
    calls++;
    return r.fulfill(calls === 2 ? { status: 503, json: { error: 'catalog temporarily unavailable' } } : { json: { products: calls === 1 ? [] : [product] } });
  });
  await catalogHome(page);
  const empty = JSON.parse(await openCatalog(page));
  expect(empty.status).toBe('ready'); expect(empty.products).toEqual([]);
  const error = await tool(page, 'catalog_action', { action: 'search' });
  expect(error).toMatch(/^error:/);
  expect(JSON.parse(error.slice('error: '.length))).toMatchObject({ status: 'error', products: [], error: 'catalog temporarily unavailable', budget: 2000 });
  expect(await tool(page, 'catalog_action', { action: 'read' })).toMatch(/^error:/);
  expect(calls).toBe(2);
  expect(JSON.parse(await tool(page, 'catalog_action', { action: 'search' })).products[0].id).toBe('p1');
  expect(calls).toBe(3);
});

test('closing a catalog while its search is pending never returns stale results or reopens it', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/catalog', async (r) => { await gate; await r.fulfill({ json: { products: [product] } }).catch(() => {}); });
  await catalogHome(page);
  await page.evaluate(() => { window.__openingCatalog = window.__catalogConv.opts.clientTools.open_scene({ scene: 'shopping', data_json: '{"catalog":true,"query":"headphones"}' }); });
  await expect(page.locator('.scene-shopping [role=status]')).toContainText('กำลังค้น');
  await page.getByTestId('home-btn').click();
  release();
  expect(await page.evaluate(() => window.__openingCatalog)).toMatch(/closed or replaced/);
  await expectHome(page);
});

test('only Shopify discovery is offered and the removed web search API is unavailable', async ({ page, request }) => {
  await home(page);
  await expect(page.getByTestId('shopify-catalog')).toBeVisible();
  await expect(page.getByTestId('shopping-search')).toHaveCount(0);
  expect((await request.post('/api/search', { data: { query: 'headphones' } })).status()).toBe(404);
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
});

test('Shopify empty results and errors are visible and retryable on a small phone', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/catalog', (route) => route.fulfill({ json: ++calls === 1 ? { products: [] } : { error: 'Shopify rate limited' } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await home(page); await page.getByTestId('shopify-catalog').click();
  await page.getByLabel('อยากได้สินค้าแบบไหน').fill('shoes');
  await page.getByRole('button', { name: 'ค้นสินค้า', exact: true }).click();
  await expect(page.locator('.scene-shopping [role=status]')).toContainText('ยังไม่พบสินค้า');
  await page.getByRole('button', { name: 'ค้นสินค้า', exact: true }).click();
  await expect(page.locator('.scene-shopping [role=status]')).toContainText('Shopify rate limited');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('home-btn').click(); await expectHome(page);
});
