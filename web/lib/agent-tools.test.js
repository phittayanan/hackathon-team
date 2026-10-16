import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolHandlers, TOOL_DEFS, keptPagesNote } from '../public/js/agent-tools.js';
import { cannedTodo, cannedFirstAid, validateSpec } from '../public/js/genui.js';

function fakeUi(open = null) {
  const log = [];
  let current = open;
  return {
    log,
    ui: {
      current: () => current,
      openScene: (name, data) => { log.push(['open', name, data]); current = { name, ctl: { state: () => ({ spec: data?.spec }) } }; },
      closeScene: () => { log.push(['close']); current = null; },
      action: (name, extra) => log.push(['action', name, extra]),
      nudgeAllow: () => log.push(['nudge']),
    },
  };
}

test('every tool has a handler', () => {
  const h = createToolHandlers(fakeUi().ui);
  for (const t of TOOL_DEFS) assert.equal(typeof h[t.name], 'function', t.name);
});

test('secretary tool validates actions, has no send action and converts snooze minutes', () => {
  const calls = [];
  const handlers = createToolHandlers({ secretary: (...args) => { calls.push(args); return 'demo data'; } });
  assert.match(handlers.secretary_action({ action: 'send' }), /^error/);
  assert.match(handlers.secretary_action({ action: 'snooze', minutes: '60' }), /^error/);
  assert.equal(handlers.secretary_action({ action: 'snooze', minutes: '5' }), 'demo data');
  assert.deepEqual(calls, [['snooze', 5]]);
});

test('no tool can approve a payment', () => {
  const { ui, log } = fakeUi({ name: 'payment', ctl: {} });
  const out = createToolHandlers(ui).scene_action({ action: 'confirm' });
  assert.match(out, /^refused/);
  assert.deepEqual(log, [['nudge']]);
});

test('open_scene checks the scene and the JSON', async () => {
  const { ui, log } = fakeUi();
  const h = createToolHandlers(ui);
  assert.match(await h.open_scene({ scene: 'bank_transfer' }), /^error/);
  assert.match(await h.open_scene({ scene: 'flight', data_json: '{bad' }), /^error/);
  assert.equal(await h.open_scene({ scene: 'flight', data_json: '{"delayMinutes":90}' }), 'opened flight');
  assert.deepEqual(log[0], ['open', 'flight', { delayMinutes: 90 }]);
});

test('catalog tools reject invalid actions/data and cannot act on a payment or closed scene', async () => {
  const { ui, log } = fakeUi({ name: 'payment', ctl: {} });
  const h = createToolHandlers(ui);
  for (const data_json of ['{bad', '[]', 'false']) assert.match(await h.catalog_action({ action: 'search', data_json }), /^error/);
  assert.match(await h.catalog_action({ action: 'pay' }), /^error/);
  assert.match(await h.catalog_action({ action: 'select', data_json: '{"product_id":"x"}' }), /no catalog/);
  assert.deepEqual(log, []);
  ui.closeScene();
  assert.match(await h.catalog_action({ action: 'read' }), /no catalog/);
});

test('a catalog read waiting for results does not return a scene that the owner closed', async () => {
  const { ui } = fakeUi({ name: 'shopping', ctl: { state: () => ({ catalog: true }), ready: async () => ui.closeScene() } });
  assert.match(await createToolHandlers(ui).catalog_action({ action: 'read' }), /closed or replaced/);
});

test('render_ui validates the spec; unknown components are dropped', async () => {
  const { ui, log } = fakeUi();
  const h = createToolHandlers(ui);
  assert.match(await h.render_ui({ spec_json: '{"blocks":[{"type":"script"}]}' }), /^error/);
  const out = await h.render_ui({ spec_json: JSON.stringify({ ...cannedTodo(), blocks: [...cannedTodo().blocks, { type: 'html', html: '<b>' }] }) });
  assert.match(out, /ask if the user likes it/);
  assert.equal(log[0][2].spec.blocks.length, 2);
});

test('mark_urgent and keep_scene: first-aid pages are never kept', async () => {
  const { ui, log } = fakeUi();
  const h = createToolHandlers(ui);
  await h.render_ui({ spec_json: JSON.stringify(cannedTodo()) });
  assert.match(h.keep_scene(), /^kept/);
  assert.equal(h.mark_urgent({ level: 'serious' }), 'marked serious');
  const urgentSpec = log.find((l) => l[1] === 'urgent')[2].spec;
  assert.equal(urgentSpec.blocks[0].number, '1669');
  assert.deepEqual(urgentSpec.proposals, []);

  const first = fakeUi();
  const h2 = createToolHandlers(first.ui);
  await h2.render_ui({ spec_json: JSON.stringify(validateSpec(cannedFirstAid())) });
  assert.match(h2.keep_scene(), /^refused/);
});

test('kept pages: the note lists name, words and reference; render_ui reopens one by its reference', async () => {
  const saved = { todo: { kind: 'todo', name: 'To-do list', match: ['todo', 'to-do'], spec: cannedTodo() } };
  assert.equal(keptPagesNote({}), '');
  const note = keptPagesNote(saved);
  assert.match(note, /^\[screen\] Pages the user kept earlier: "To-do list" \(reference: \{"saved":"todo"\}; words: todo, to-do\)/);
  assert.match(note, /call render_ui with spec_json set to its reference/);

  const { ui, log } = fakeUi();
  const told = [];
  const h = createToolHandlers({ ...ui, saved: () => saved, tellAgent: (t) => told.push(t) });
  assert.match(await h.render_ui({ spec_json: '{"saved":"todo"}' }), /^reopened the kept page "To-do list"/);
  assert.deepEqual(log[0], ['open', 'generated', { savedKind: 'todo' }]);
  assert.match(await h.render_ui({ spec_json: '{"saved":"groceries"}' }), /^error: no kept page "groceries"/);
  assert.equal(log.length, 1);

  // Keeping a page tells the agent the new list at once.
  await h.render_ui({ spec_json: JSON.stringify(cannedTodo()) });
  assert.match(h.keep_scene(), /^kept/);
  assert.equal(told.length, 1);
  assert.match(told[0], /\{"saved":"todo"\}/);
});
