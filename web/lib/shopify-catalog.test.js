import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchShopifyCatalog } from './shopify-catalog.js';
import { keywordRoute } from './router.js';

const variant = { id: 'v1', url: 'https://merchant.example/products/headphones', seller: { name: 'Merchant' }, availability: { available: true }, price: { amount: 99900, currency: 'THB' } };
const product = { id: 'p1', title: 'Headphones', variants: [variant], description: { html: '<p>Wireless</p>' } };
const reply = (products) => async () => ({ ok: true, json: async () => ({ result: { structuredContent: { products } } }) });

test('Global Catalog uses keyless profile, TH shipping and minor-unit budget without creating a shop', async () => {
  let sent;
  const out = await searchShopifyCatalog({ query: ' wireless headphones ', budget: 1500 }, {}, async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) }; return reply([product])();
  });
  assert.equal(sent.url, 'https://catalog.shopify.com/api/ucp/mcp');
  assert.equal(sent.body.params.name, 'search_catalog');
  assert.equal(sent.options.headers.authorization, undefined);
  assert.equal(sent.body.params.arguments.catalog.filters.price.max, 150000);
  assert.deepEqual(sent.body.params.arguments.catalog.filters.ships_to, { country: 'TH' });
  assert.equal(out.products[0].amount, 99900);
  assert.equal(out.products[0].description, 'Wireless');
});

test('catalog rejects invalid input before network and handles limits/RPC errors', async () => {
  const fail = () => assert.fail('must not call');
  for (const input of [{}, { query: '' }, { query: 'x', budget: -1 }, { query: 'x', budget: '1500' }, { query: 'x'.repeat(251) }]) await assert.rejects(searchShopifyCatalog(input, {}, fail));
  await assert.rejects(searchShopifyCatalog({ query: 'x' }, { SHOPIFY_AGENT_PROFILE_URL: 'http://localhost' }, fail));
  await assert.rejects(searchShopifyCatalog({ query: 'x' }, {}, async () => ({ ok: false, status: 429 })), /Shopify/);
  await assert.rejects(searchShopifyCatalog({ query: 'x' }, {}, async () => ({ ok: true, json: async () => ({ error: { message: 'bad' } }) })), /Shopify/);
});

test('catalog filters unavailable, unsafe, wrong-currency and over-budget offers; chooses an affordable variant', async () => {
  const products = [
    { ...product, variants: [{ ...variant, url: 'javascript:alert(1)' }] },
    { ...product, variants: [{ ...variant, availability: { available: false } }] },
    { ...product, variants: [{ ...variant, price: { amount: 100, currency: 'USD' } }] },
    { ...product, variants: [{ ...variant, price: { amount: 200000, currency: 'THB' } }, variant] },
  ];
  const out = await searchShopifyCatalog({ query: 'x', budget: 1500 }, {}, reply(products));
  assert.equal(out.products.length, 1); assert.equal(out.products[0].amount, 99900);
});

test('spoken product discovery routes to Shopify with a baht budget, leaving sample shopping intact', () => {
  const out = keywordRoute('หาหูฟัง งบ 1,500');
  assert.equal(out.data.catalog, true); assert.equal(out.data.budget, 1500);
  assert.equal(keywordRoute('this week is hectic').scene, 'shopping');
  assert.equal(keywordRoute('this week is hectic').data.catalog, undefined);
});
