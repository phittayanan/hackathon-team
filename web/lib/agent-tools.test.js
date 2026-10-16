import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolHandlers, TOOL_DEFS, keptPagesNote } from '../public/js/agent-tools.js';
import { cannedTodo, cannedFirstAid, validateSpec, pageSummary, SUMMARY_MAX } from '../public/js/genui.js';

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

test('open_scene returns the open scene\'s summary so the agent knows its facts', async () => {
  const ui = { current: () => ({ name: 'payment', ctl: { summary: () => 'Payment request to FreshMart Online, total ฿849.' } }), openScene: () => {} };
  assert.equal(await createToolHandlers(ui).open_scene({ scene: 'payment' }), 'opened payment: Payment request to FreshMart Online, total ฿849.');
  // Another scene is showing (the open did not take): no summary from the wrong page.
  assert.equal(await createToolHandlers(ui).open_scene({ scene: 'flight' }), 'opened flight');
});

test('render_ui validates the spec; unknown components are dropped', async () => {
  const { ui, log } = fakeUi();
  const h = createToolHandlers(ui);
  assert.match(await h.render_ui({ spec_json: '{"blocks":[{"type":"script"}]}' }), /^error/);
  const out = await h.render_ui({ spec_json: JSON.stringify({ ...cannedTodo(), blocks: [...cannedTodo().blocks, { type: 'html', html: '<b>' }] }) });
  assert.match(out, /ask if the user likes it/);
  assert.equal(log[0][2].spec.blocks.length, 2);
});

test('render_ui and revise_ui: the no-usable-blocks error names the block shape on one line', async () => {
  const h = createToolHandlers(fakeUi().ui);
  const bad = await h.render_ui({ spec_json: '{"blocks":[{"type":"script"}]}' });
  await h.render_ui({ spec_json: JSON.stringify(cannedTodo()) });
  for (const err of [bad, h.revise_ui({ spec_json: '{"blocks":[]}' })]) {
    assert.match(err, /^error: spec has no usable blocks/);
    assert.match(err, /\{"type":"checklist","items":\[\{"text":"\.\.\.","done":false\}\]\}/);
    assert.ok(!err.includes('\n'));
  }
  const defs = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t.description]));
  for (const name of ['render_ui', 'revise_ui']) assert.match(defs[name], /\{"type":"checklist","items":\[\{"text":"\.\.\.","done":false\}\]\}/, name);
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

test('pageSummary: title, each block with its items, done state and numbers', () => {
  const spec = validateSpec({
    title: 'Trip prep',
    subtitle: 'Sat 17 Oct',
    blocks: [
      { type: 'progress', label: 'Done', value: 'auto' },
      { type: 'checklist', items: [{ text: 'Passport', done: true }, { text: 'Charger', due: 'Fri', tag: 'High' }] },
      { type: 'stat', label: 'Budget', value: '1,500 THB' },
      { type: 'chart', bars: [{ label: 'Mon', value: 3 }, { label: 'Tue', value: 5 }] },
      { type: 'card', title: 'Hotel', text: 'Check in at 14:00' },
      { type: 'button', label: 'Book' },
      { type: 'divider' },
    ],
  });
  assert.equal(
    pageSummary(spec),
    '"Trip prep" (Sat 17 Oct). Progress: Done 50%. ' +
      'Checklist: 1. Passport (done); 2. Charger (not done, due Fri, tag High). ' +
      'Stat: Budget 1,500 THB. Chart: Mon 3, Tue 5. Card "Hotel": Check in at 14:00. Button: Book',
  );
  assert.equal(pageSummary(null), '');
});

test('pageSummary: a long page is cut with an ellipsis', () => {
  const spec = validateSpec({ title: 'Long', blocks: Array.from({ length: 6 }, () => ({ type: 'text', text: 'x'.repeat(300) })) });
  const out = pageSummary(spec);
  assert.equal(out.length, SUMMARY_MAX);
  assert.ok(out.endsWith('…'));
});

test('render_ui, revise_ui and a reopened kept page say what the page shows', async () => {
  const todo = validateSpec(cannedTodo());
  const saved = { todo: { kind: 'todo', name: 'To-do list', match: ['todo'], spec: todo } };
  const { ui } = fakeUi();
  const h = createToolHandlers({ ...ui, saved: () => saved });

  const shown = await h.render_ui({ spec_json: JSON.stringify(todo) });
  assert.equal(shown, `page shown; now ask if the user likes it and propose one or two changes. Page now shows: ${pageSummary(todo)}`);

  const changed = { ...todo, title: 'Shorter list', blocks: todo.blocks.filter((b) => b.type === 'checklist') };
  const redrawn = h.revise_ui({ spec_json: JSON.stringify(changed) });
  assert.equal(redrawn, `page redrawn. Page now shows: ${pageSummary(validateSpec(changed))}`);
  assert.match(redrawn, /"Shorter list"/);

  const reopened = await h.render_ui({ spec_json: '{"saved":"todo"}' });
  assert.match(reopened, /^reopened the kept page "To-do list"; say it is ready, do not ask if they like it\. Page now shows: "/);

  const aid = await createToolHandlers(fakeUi().ui).render_ui({ spec_json: JSON.stringify(cannedFirstAid()) });
  assert.match(aid, /^first-aid page shown\. Page now shows: .*Steps: 1\. /);
});
