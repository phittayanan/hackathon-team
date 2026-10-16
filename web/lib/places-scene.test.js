import { test } from 'node:test';
import assert from 'node:assert/strict';

// A tiny DOM: enough for the places scene to build its cards.
const node = (tag) => {
  const n = { tag, children: [], dataset: {}, attrs: {}, textContent: '', className: '',
    append: (...c) => n.children.push(...c), replaceChildren: (...c) => { n.children = c; },
    setAttribute: (k, v) => { n.attrs[k] = v; }, addEventListener() {} };
  return n;
};
globalThis.document = { createElement: node, getElementById: () => null, body: { dataset: {} } };
const { default: mountPlaces } = await import('../public/js/scenes/places.js');
const { createToolHandlers } = await import('../public/js/agent-tools.js');

const place = { id: 'p1', name: 'Cafe Amazon', address: 'บางมด', rating: 4.4, ratings: 12, openNow: true, distanceM: 420, url: 'https://maps.google.com/?cid=1' };
const later = () => { let go; const p = new Promise((r) => { go = r; }); return { p, go }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const reply = later();
  const sent = [];
  let alive = true;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 13.65, longitude: 100.49 } }) } } });
  globalThis.fetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); await reply.p; return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ places: [place] }) }; };
  const events = [];
  const agent = { alive: () => alive, close: () => { alive = false; }, event: (text, label) => events.push({ text, label }), tell: () => assert.fail('a [screen] note does not start a turn') };
  const el = node('section');
  const ui = { current: () => null, openScene: async (name, data) => { assert.equal(name, 'places'); mountPlaces(el, data, agent); },
    plan: { start() {}, busy() {}, tick() {}, clear() {} }, remember() {} };
  return { reply, sent, events, agent, el, tools: createToolHandlers(ui), close: () => { alive = false; } };
}

test('results that arrive after find_places returned start an agent turn with the places found', async () => {
  const s = setup();
  const out = await s.tools.find_places({ query: 'ร้านกาแฟ' });
  assert.match(out, /\[scene event\]/);
  await tick();
  assert.equal(s.events.length, 0, 'nothing is said before the results arrive');
  assert.deepEqual(s.sent[0].body, { query: 'ร้านกาแฟ', lat: 13.65, lng: 100.49 });
  s.reply.go(); await tick(); await tick();
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].label, undefined, 'offline the router already spoke');
  assert.match(s.events[0].text, /^Places results: .*1\. Cafe Amazon 420 ม\., rating 4\.4, เปิดอยู่.*Tell the user now/);
  assert.doesNotMatch(s.events[0].text, /13\.65|100\.49/);
});

test('closing the page before the results arrive sends nothing to the agent', async () => {
  const s = setup();
  await s.tools.find_places({ query: 'ร้านกาแฟ' });
  await tick();
  s.close();
  s.reply.go(); await tick(); await tick();
  assert.equal(s.events.length, 0);
});
