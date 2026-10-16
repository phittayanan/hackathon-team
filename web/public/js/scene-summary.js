// One-line, plain-text summaries of what each prebuilt scene shows, for the live agent.
// open_scene returns one, and a new live session hears the open page's one (openPageNote),
// so the agent can say the total, which rule failed or the flight times without guessing.
// Pure: data in, text out. At most SCENE_SUMMARY_MAX characters, cut with an ellipsis.
import { checkRules, paymentTotal } from './pay-rules.js';
import { pageSummary } from './genui.js';

export const SCENE_SUMMARY_MAX = 400;
const baht = (n) => `฿${Number(n).toLocaleString('en-US')}`;
const qty = (i) => Number(i.qty) || 1;
export const clip = (text, max = SCENE_SUMMARY_MAX) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

// Same arithmetic as the flight card: the delayed times it shows.
export const addMinutes = (hhmm, mins) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = h * 60 + m + Number(mins || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// Rules first, so a long item list is what the cut drops, never a rule.
export function paymentSummary(data = {}) {
  const total = paymentTotal(data);
  const checks = checkRules({ merchant: data.merchant, total });
  const passed = checks.every((c) => c.ok);
  const rules = checks.map((c) => `${c.label} ${c.ok ? 'passed' : 'FAILED'} (${c.detail})`).join('; ');
  const items = (data.items || []).map((i) => `${i.name}${qty(i) > 1 ? ` × ${qty(i)}` : ''} ${baht(Number(i.price) * qty(i))}`).join(', ');
  return clip(
    `Payment request to ${data.merchant}, total ${baht(total)}. Rules: ${rules}. ` +
    `${passed ? 'Allow is enabled; only the owner\'s tap pays.' : 'Allow is disabled: blocked by the rules check.'}` +
    `${data.method ? ` Pay with ${data.method}.` : ''}${items ? ` Items: ${items}.` : ''}`,
  );
}

export function flightSummary(data = {}) {
  const { old = {}, proposed = {} } = data;
  const late = Number(data.delayMinutes) || 0;
  return clip(
    `${old.code} ${old.from}→${old.to} is delayed ${late / 60} h${data.reason ? ` (${data.reason})` : ''}: ` +
    `departs ${addMinutes(old.depart, late)} instead of ${old.depart}, lands ${addMinutes(old.arrive, late)} instead of ${old.arrive}` +
    `${data.meeting ? `, missing ${data.meeting} at ${data.meetingTime}` : ''}. ` +
    `Offer: ${proposed.code} ${proposed.from} ${proposed.depart} → ${proposed.to} ${proposed.arrive}, seat held, no extra cost. ` +
    'Buttons: Keep, Yes change it.',
  );
}

export function shoppingSummary(data = {}) {
  const items = data.items || [];
  const total = items.reduce((s, i) => s + Number(i.price) * qty(i), 0);
  const list = items.map((i) => `${i.name}${qty(i) > 1 ? ` × ${qty(i)}` : ''} ${baht(Number(i.price) * qty(i))}`).join(', ');
  return clip(
    `Shopping list at ${data.merchant}${data.email?.from ? ` from ${data.email.from}'s email` : ''}, ` +
    `${items.length} items, total ${baht(total)}: ${list}. It goes on to the payment card.`,
  );
}

export function trainingSummary(data = {}) {
  const { race = {}, plan = [] } = data;
  const week = plan.map((p) => `${p.day} ${p.run} at ${p.pace}`).join(', ');
  return clip(
    `Sleep score ${data.sleepScore}, ${data.sleepHours} asleep, resting ${data.restingHr} bpm. ` +
    `This week: ${week}. Race: ${race.name}, ${race.date}, ${race.place}, ${race.entry}; the sign-up form fills and submits itself.`,
  );
}

// facts: { query, budget, results: [{ title, seller, price }], error, chosen, searching }
export function catalogSummary(facts = {}) {
  const head = `Shopify product search${facts.query ? ` for "${facts.query}"` : ''}${facts.budget ? `, budget ฿${facts.budget}` : ''}`;
  if (facts.searching) return clip(`${head}: searching.`);
  if (facts.error) return clip(`${head}: the search failed: ${facts.error}.`);
  if (!facts.results) return clip(`${head}: no search yet.`);
  if (!facts.results.length) return clip(`${head}: no products found that ship to Thailand.`);
  const list = facts.results.map((r, n) => `${n + 1}. ${r.title} (${r.seller}) ${r.price}`).join('; ');
  return clip(`${head}: ${facts.results.length} results: ${list}.${facts.chosen ? ` Chosen: ${facts.chosen}.` : ''} Choosing is not buying.`);
}

// The [screen] note for a page that is open when a new live session starts; '' on the home.
// current: { name, ctl } from the app; generated pages use the page summary (genui.js).
export function openPageNote(current) {
  if (!current?.name) return '';
  const summary = current.name === 'generated' ? pageSummary(current.ctl?.state?.()?.spec) : current.ctl?.summary?.();
  return `[screen] The ${current.name} page is open${summary ? `: ${clip(summary)}` : '.'}`;
}
