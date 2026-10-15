import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRules, paymentTotal, RULES } from '../public/js/pay-rules.js';
import { SCENE_DEFAULTS } from '../public/js/data.js';

// What the payment scene checks, given the data it is mounted with (defaults plus the agent's data).
const checksFor = (agentData) => {
  const data = { ...SCENE_DEFAULTS.payment, ...agentData };
  return checkRules({ merchant: data.merchant, total: paymentTotal(data) }).map((c) => c.ok);
};

test('the default grocery payment passes all three rules', () => {
  assert.deepEqual(checksFor({}), [true, true, true]);
});

test('agent-supplied rules cannot unblock 45,000 THB at "Evil Shop"', () => {
  const evil = { merchant: 'Evil Shop', total: 45000, items: [{ name: 'Gadget', qty: 1, price: 45000 }] };
  assert.deepEqual(checksFor(evil), [false, false, false]);
  const override = { ...evil, rules: { monthlyBudgetLeft: 100000, perPaymentCap: 99999, allowedShops: ['Evil Shop'] } };
  assert.deepEqual(checksFor(override), [false, false, false]);
});

test('a low stated total cannot hide expensive items', () => {
  const hidden = { total: 100, items: [{ name: 'TV', qty: 1, price: 45000 }] };
  assert.equal(paymentTotal({ ...SCENE_DEFAULTS.payment, ...hidden }), 45000);
  assert.deepEqual(checksFor(hidden), [false, false, true]);
});

test('missing or bad totals never pass the money rules', () => {
  assert.deepEqual(checkRules({ merchant: 'FreshMart Online', total: NaN }).map((c) => c.ok), [false, false, true]);
  assert.deepEqual(checkRules({ merchant: 'FreshMart Online', total: -5 }).map((c) => c.ok), [false, false, true]);
});

test('the rules cannot be changed at run time', () => {
  assert.throws(() => { 'use strict'; RULES.perPaymentCap = 1e9; });
  assert.throws(() => RULES.allowedShops.push('Evil Shop'));
  assert.equal(RULES.perPaymentCap, 2000);
});
