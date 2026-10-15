import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { learn, learned, learnedText, forgetLearnedKey, reviseLessons, noteRevise, noteKeep, noteIgnored, noteFeed, agentOpened, proactiveWatch, forgetOnRequest, MAX_LEARNED } from '../public/js/learn.js';
import { createToolHandlers } from '../public/js/agent-tools.js';
import { sessionVariables } from '../public/js/memory.js';

beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
});

const todo = (blocks, extra = {}) => ({ kind: 'todo', name: 'To-do list', accent: 'orange', blocks, ...extra });

test('a revise teaches what changed: blocks added or left out, due dates, colour', () => {
  const before = todo([{ type: 'checklist', items: [{ text: 'Run' }] }, { type: 'text', text: 'hi' }]);
  const after = todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }] }, { type: 'progress', value: 'auto' }], { accent: 'green' });
  assert.deepEqual(reviseLessons(before, after).map((l) => l.text), [
    'todo pages: add a progress bar',
    'todo pages: leave out a note',
    'todo pages: give checklist items due dates',
    'todo pages: green colour',
  ]);
  assert.deepEqual(reviseLessons(before, before), []);
  // Some items had a due date; after the revise every item has one.
  const some = todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }, { text: 'Swim' }] }]);
  const every = todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }, { text: 'Swim', due: 'Tue' }] }]);
  assert.deepEqual(reviseLessons(some, every).map((l) => l.text), ['todo pages: give checklist items due dates']);
});

test('learned preferences are capped, deduplicated with a count, and become {{learned}}', () => {
  assert.equal(learnedText(), 'nothing yet');
  for (let i = 0; i < MAX_LEARNED + 3; i++) learn(`k${i}`, `pref ${i}`);
  assert.equal(learned().length, MAX_LEARNED);
  assert.equal(learned()[0].text, `pref ${MAX_LEARNED + 2}`); // newest first
  learn('k8', 'pref 8');
  assert.match(learnedText(), /^pref 8 \(2x\); /);
  assert.equal(sessionVariables({}).learned, learnedText());
  assert.equal(forgetOnRequest('?forget=1'), true);
  assert.equal(learnedText(), 'nothing yet');
  assert.equal(forgetOnRequest(''), false);
});

test('kept pages and passed-over proposals are learned', () => {
  noteKeep(todo([]));
  noteIgnored(todo([]), [{ id: 'a', label: 'Add weather' }]);
  assert.equal(noteIgnored(todo([]), []), null);
  assert.deepEqual(learned().map((l) => l.text), ['did not want "Add weather" on todo pages', 'liked and kept the todo page layout']);
});

test('updates the agent spoke first about: closed at once = dismissed, used = speak up', () => {
  noteFeed(1000);
  assert.equal(agentOpened('flight', 2000), true);
  proactiveWatch.sceneChanged('home', 'flight', 2100);
  proactiveWatch.sceneChanged('flight', 'home', 5000); // closed after 3 s
  assert.match(learnedText(), /flight updates: the user closed one at once, speak only if urgent/);
  noteFeed(10000);
  agentOpened('training', 11000);
  proactiveWatch.sceneChanged('training', 'home', 30000);
  assert.match(learnedText(), /^training updates: the user acts on them, speak up/);
  // A scene the user asked for (no feed just before) is not proactive.
  assert.equal(agentOpened('flight', 99000), false);
});

test('tools: a revise and a keep feed the learner; forget_all clears it', async () => {
  let current = null;
  const ui = {
    plan: { start() { return false; }, busy() {}, tick() {}, clear() {} },
    remember: () => true,
    current: () => current,
    openScene: async (name, data) => { current = { name, spec: data.spec, ctl: { state: () => ({ spec: current.spec }) } }; },
    closeScene: () => { current = null; },
    action: (name, extra) => { if (name === 'revise') current.spec = extra.spec; },
    nudgeAllow() {},
  };
  const h = createToolHandlers(ui);
  const page = todo([{ type: 'checklist', items: [{ text: 'Run' }] }], { proposals: [{ id: 'w', label: 'Add weather' }] });
  await h.render_ui({ spec_json: JSON.stringify(page) });
  h.revise_ui({ spec_json: JSON.stringify(todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }] }])) });
  h.keep_scene();
  assert.deepEqual(learned().map((l) => l.text), ['liked and kept the todo page layout', 'todo pages: give checklist items due dates']);
  // A new page whose proposals are passed over (closed, then another page drawn).
  await h.render_ui({ spec_json: JSON.stringify(page) });
  await h.render_ui({ spec_json: JSON.stringify(todo([{ type: 'text', text: 'x' }])) });
  assert.match(learnedText(), /^did not want "Add weather"/);
  assert.match(h.remember({ key: 'forget_all' }), /^forgot everything/);
  assert.equal(learnedText(), 'nothing yet');
});

test('forgetLearnedKey forgets one preference and keeps the rest', () => {
  learn('todo:due', 'todo pages: give checklist items due dates');
  learn('todo:progress', 'todo pages: add a progress bar');
  assert.equal(forgetLearnedKey('todo:due'), true);
  assert.deepEqual(learned().map((l) => l.key), ['todo:progress']);
  assert.equal(forgetLearnedKey('todo:due'), false);
  assert.equal(learnedText(), 'todo pages: add a progress bar');
});
