import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_DEFAULTS } from '../public/js/data.js';
import { paymentSummary, flightSummary, shoppingSummary, trainingSummary, catalogSummary, clip, openPageNote, SCENE_SUMMARY_MAX } from '../public/js/scene-summary.js';

test('payment summary: merchant, total, every rule passed and Allow enabled', () => {
  const s = paymentSummary(SCENE_DEFAULTS.payment);
  assert.match(s, /^Payment request to FreshMart Online, total ฿849\./);
  assert.match(s, /Inside monthly budget passed \(฿5,000 left\); Under cap per payment passed \(cap ฿2,000\); Shop on allowed list passed \(FreshMart Online\)/);
  assert.match(s, /Allow is enabled/);
  assert.match(s, /Items: Weekly groceries ฿849\./);
});

test('payment summary: names each failed rule and uses the real total, not the stated one', () => {
  const s = paymentSummary({ merchant: 'Evil Shop', total: 1, items: [{ name: 'Gadget', qty: 2, price: 22500 }] });
  assert.match(s, /total ฿45,000/);
  assert.match(s, /Inside monthly budget FAILED.*Under cap per payment FAILED.*Shop on allowed list FAILED \(Evil Shop\)/);
  assert.match(s, /Allow is disabled: blocked by the rules check/);
  assert.match(s, /Gadget × 2 ฿45,000/);
});

test('payment summary: a long item list is cut, the rules stay', () => {
  const items = Array.from({ length: 40 }, (_, n) => ({ name: `Item number ${n}`, price: 10 }));
  const s = paymentSummary({ merchant: 'FreshMart Online', items });
  assert.ok(s.length <= SCENE_SUMMARY_MAX);
  assert.ok(s.endsWith('…'));
  assert.match(s, /Shop on allowed list passed/);
});

test('flight summary: codes, old and delayed times, the offer', () => {
  const s = flightSummary(SCENE_DEFAULTS.flight);
  assert.match(s, /^TG 102 BKK→CNX is delayed 2 h \(Ground delay at BKK\): departs 10:00 instead of 08:00, lands 11:15 instead of 09:15, missing Client meeting, Chiang Mai at 11:00\./);
  assert.match(s, /Offer: FD 3433 DMK 08:40 → CNX 09:55, seat held, no extra cost\./);
});

test('shopping and training summaries carry their key facts', () => {
  const shop = shoppingSummary(SCENE_DEFAULTS.shopping);
  assert.match(shop, /^Shopping list at FreshMart Online from Mom's email, 6 items, total ฿849: Fresh milk 2 L ฿95,/);
  const train = trainingSummary(SCENE_DEFAULTS.training);
  assert.match(train, /^Sleep score 86, 7 h 40 m asleep, resting 54 bpm\. This week: Today Easy 5 km at 6:30 \/km,/);
  assert.match(train, /Race: Bangkok City 10K, 15 Nov 2026, Lumphini Park, Free team slot/);
  for (const s of [shop, train]) assert.ok(s.length <= SCENE_SUMMARY_MAX);
});

test('catalog summary: searching, results with sellers and prices, chosen, error, empty', () => {
  assert.equal(catalogSummary({ query: 'หูฟัง', searching: true }), 'Shopify product search for "หูฟัง": searching.');
  const results = [{ title: 'Buds A', seller: 'Shop One', price: '฿1,290.00' }, { title: 'Buds B', seller: 'Shop Two', price: '฿990.00' }];
  assert.equal(catalogSummary({ query: 'หูฟัง', budget: 1500, results }),
    'Shopify product search for "หูฟัง", budget ฿1500: 2 results: 1. Buds A (Shop One) ฿1,290.00; 2. Buds B (Shop Two) ฿990.00. Choosing is not buying.');
  assert.match(catalogSummary({ query: 'x', results, chosen: 'Buds B (Shop Two) ฿990.00' }), /Chosen: Buds B \(Shop Two\) ฿990\.00\./);
  assert.equal(catalogSummary({ query: 'x', error: 'Shopify rate limited' }), 'Shopify product search for "x": the search failed: Shopify rate limited.');
  assert.match(catalogSummary({ query: 'x', results: [] }), /no products found/);
});

test('clip folds whitespace and cuts with an ellipsis at the limit', () => {
  assert.equal(clip('a \n b'), 'a b');
  const long = clip('x'.repeat(1000));
  assert.equal(long.length, SCENE_SUMMARY_MAX);
  assert.ok(long.endsWith('…'));
});

test('open page note: a scene\'s summary, a generated page\'s summary, a bare name, nothing on the home', () => {
  assert.equal(openPageNote(null), '');
  assert.equal(openPageNote({ name: 'payment', ctl: { summary: () => 'Payment request to FreshMart Online, total ฿849.' } }),
    '[screen] The payment page is open: Payment request to FreshMart Online, total ฿849.');
  const spec = { title: 'Packing list', blocks: [{ type: 'checklist', items: [{ text: 'Passport', done: true }] }] };
  assert.match(openPageNote({ name: 'generated', ctl: { state: () => ({ spec }) } }), /^\[screen\] The generated page is open: "Packing list"\. .*Passport/);
  assert.equal(openPageNote({ name: 'secretary', ctl: {} }), '[screen] The secretary page is open.');
  assert.ok(openPageNote({ name: 'x', ctl: { summary: () => 'y'.repeat(900) } }).length <= SCENE_SUMMARY_MAX + 40);
});
