// The payment rules check, in plain code (no browser parts, so it is unit-tested in Node).
// The rules and the allowed-shop list are fixed here: whatever the agent sends in a payment's
// data (rules, a bigger budget, its own shop list, a small total) can never change the check.
import { SCENE_DEFAULTS } from './data.js';

const baht = (n) => `฿${Number(n).toLocaleString('en-US')}`;

// Frozen copy of the owner's rules; data.rules from the agent is never read.
export const RULES = Object.freeze({
  ...SCENE_DEFAULTS.payment.rules,
  allowedShops: Object.freeze([...SCENE_DEFAULTS.payment.rules.allowedShops]),
});

// The amount to check: never less than the items add up to, so a low "total" cannot hide them.
export function paymentTotal({ total, items = [] }) {
  const sum = items.reduce((s, i) => s + Number(i.price) * (Number(i.qty) || 1), 0);
  const stated = Number(total);
  return Number.isFinite(stated) ? Math.max(stated, sum) : sum;
}

export function checkRules({ total, merchant }) {
  const amount = Number(total);
  const ok = Number.isFinite(amount) && amount > 0;
  return [
    { label: 'Inside monthly budget', detail: `${baht(RULES.monthlyBudgetLeft)} left`, ok: ok && amount <= RULES.monthlyBudgetLeft },
    { label: 'Under cap per payment', detail: `cap ${baht(RULES.perPaymentCap)}`, ok: ok && amount <= RULES.perPaymentCap },
    { label: 'Shop on allowed list', detail: String(merchant), ok: RULES.allowedShops.includes(merchant) },
  ];
}
