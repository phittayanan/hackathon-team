import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, cannedTodo, cannedFirstAid, reviseByKeywords, markDone, changeNote, pageSummary } from '../public/js/genui.js';
import { keywordRoute, route } from './router.js';

test('validateSpec drops unknown components and keeps strings plain', () => {
  const spec = validateSpec({
    title: 'X',
    accent: 'neon',
    blocks: [{ type: 'script', src: 'evil.js' }, { type: 'html', html: '<img onerror=1>' }, { type: 'text', text: '<b>hi</b>' }],
  });
  assert.equal(spec.blocks.length, 1);
  assert.equal(spec.blocks[0].text, '<b>hi</b>'); // drawn with textContent, so shown as text
  assert.equal(spec.accent, 'orange');
  assert.equal(validateSpec({ blocks: [{ type: 'iframe' }] }), null);
});

test('todo request without a key opens the canned generated page', () => {
  const r = keywordRoute('help me make a todo list');
  assert.equal(r.scene, 'generated');
  assert.equal(r.data.spec.kind, 'todo');
  assert.equal(r.data.spec.proposals.length, 2);
});

test('spoken change revises the spec', () => {
  const spec = cannedTodo();
  const r = reviseByKeywords(spec, 'add due dates please');
  assert.equal(r.action, 'revise');
  assert.ok(r.spec.blocks.find((b) => b.type === 'checklist').items.every((i) => i.due));
  const yes = reviseByKeywords(spec, 'yes both');
  assert.ok(yes.spec.blocks.some((b) => b.type === 'progress'));
  assert.equal(reviseByKeywords(spec, 'เพิ่ม Call mom').spec.blocks[0].items.at(-1).text, 'Call mom');
  // A like with an added item is a change, not a keep.
  const liked = reviseByKeywords(spec, 'ชอบ แต่ขอเพิ่มรายการออกกำลังกาย');
  assert.equal(liked.action, 'revise');
  assert.equal(liked.spec.blocks[0].items.at(-1).text, 'ออกกำลังกาย');
  assert.equal(reviseByKeywords(spec, 'I like it, but add stretching').spec.blocks[0].items.at(-1).text, 'stretching');
});

test('like asks to keep; yes keeps; no closes', () => {
  const spec = cannedTodo();
  assert.equal(keywordRoute('I like it', 'generated', { spec }).action, 'accept');
  assert.equal(keywordRoute('ชอบมาก', 'generated', { spec }).action, 'accept');
  assert.equal(keywordRoute('ไม่ชอบ', 'generated', { spec }).action, 'ask');
  assert.equal(keywordRoute('keep it', 'generated', { spec, stage: 'keep' }).action, 'keep');
  assert.equal(keywordRoute('no thanks', 'generated', { spec, stage: 'keep' }).action, 'close');
});

test('a kept page opens at once, with no generation', async () => {
  const r = await route('todo list for tomorrow', null, { saved: [{ kind: 'todo', match: ['todo'] }] });
  assert.equal(r.via, 'saved');
  assert.equal(r.data.savedKind, 'todo');
});

test('bleeding finger opens first aid at once, with a 1669 button and no proposals', () => {
  const r = keywordRoute('เลือดผมออกที่นิ้วทำไงดี');
  assert.equal(r.scene, 'generated');
  assert.equal(r.line, 'first_aid');
  assert.equal(r.data.spec.urgency, 'urgent');
  assert.deepEqual(r.data.spec.proposals, []);
  assert.ok(r.data.spec.blocks.some((b) => b.type === 'call' && b.number === '1669'));
  assert.equal(keywordRoute('my finger is bleeding', 'payment').scene, 'generated');
});

test('urgent page: like is never asked or kept', () => {
  const spec = validateSpec(cannedFirstAid());
  assert.equal(keywordRoute('I like it', 'generated', { spec, stage: 'urgent' }).action, 'close');
  assert.notEqual(keywordRoute('yes keep it', 'generated', { spec, stage: 'urgent' }).action, 'keep');
});

test('serious spec always gets 1669; call only to emergency numbers; urgent drops proposals', () => {
  const s = validateSpec({ urgency: 'serious', blocks: [{ type: 'steps', items: ['Call for help'] }], proposals: [{ label: 'x' }] });
  assert.equal(s.blocks[0].number, '1669');
  assert.deepEqual(s.proposals, []);
  const bad = validateSpec({ blocks: [{ type: 'call', number: '0812345678' }, { type: 'text', text: 'ok' }] });
  assert.equal(bad.blocks.length, 1);
});

test('image block: prompt required, at most 2 per page', () => {
  const s = validateSpec({ blocks: [1, 2, 3].map((i) => ({ type: 'image', prompt: `pic ${i}` })).concat([{ type: 'image' }]) });
  assert.equal(s.blocks.length, 2);
});

test('markDone: a toggle on a model page ticks the checklist item it shows; the spec is not mutated', () => {
  const spec = validateSpec({ title: 'Water', blocks: [{ type: 'checklist', items: ['Water', 'Water plants'] }] });
  const out = markDone(spec, '  Water   plants (morning) ', true);
  assert.equal(out.item.text, 'Water plants');
  assert.deepEqual(out.spec.blocks[0].items.map((i) => i.done), [false, true]);
  assert.deepEqual(spec.blocks[0].items.map((i) => i.done), [false, false]);
  const none = markDone(spec, 'Something else', true);
  assert.equal(none.item, null);
  assert.equal(none.spec, spec);
});

test('changeNote: a [screen] line with the change and what the page shows now', () => {
  const spec = validateSpec(cannedTodo());
  assert.equal(changeNote('ticked "x"', spec), `[screen] The user changed the page: ticked "x". Page now shows: ${pageSummary(spec)}`);
});
