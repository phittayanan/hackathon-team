import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, cannedTodo, cannedFirstAid, reviseByKeywords, pageLayout, tagTone } from '../public/js/genui.js';
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

test('long strings end in an ellipsis and stay within their limit', () => {
  const s = validateSpec({ title: 'x'.repeat(100), blocks: [{ type: 'text', text: '  short  ' }, { type: 'button', label: 'Sign me up for the Bangkok Midnight Run' }] });
  assert.equal(s.title.length, 60);
  assert.ok(s.title.endsWith('…'));
  assert.equal(s.blocks[0].text, 'short');
  assert.equal(s.blocks[1].label.length, 30);
  assert.ok(s.blocks[1].label.endsWith('…'));
});

test('empty blocks are dropped; an empty checklist stays for its empty state', () => {
  const s = validateSpec({
    blocks: [
      { type: 'text', text: '' }, { type: 'list', items: [] }, { type: 'steps', items: [''] }, { type: 'chart', bars: [] },
      { type: 'card' }, { type: 'button' }, { type: 'stat', label: 'Saved' }, { type: 'field' }, { type: 'checklist', items: [] },
    ],
  });
  assert.deepEqual(s.blocks.map((b) => b.type), ['checklist']);
  assert.equal(validateSpec({ blocks: [{ type: 'text', text: ' ' }] }), null);
  // Old specs still pass unchanged.
  assert.deepEqual(validateSpec(cannedTodo()).blocks.map((b) => b.type), ['checklist', 'button']);
});

test('free-text tags map to a fixed tone, never to raw class text', () => {
  assert.equal(tagTone('High'), 'high');
  assert.equal(tagTone('Urgent!!'), 'high');
  assert.equal(tagTone('ด่วน'), 'high');
  assert.equal(tagTone('ไม่ด่วน'), 'low');
  assert.equal(tagTone('Medium'), 'medium');
  assert.equal(tagTone('"><script>'), 'other');
  assert.equal(tagTone(undefined), 'other');
});

test('page layout: lead answer, stats grouped in a row, one primary button', () => {
  const blocks = validateSpec({
    blocks: [
      { type: 'text', text: 'Answer' }, { type: 'stat', label: 'A', value: 1 }, { type: 'stat', label: 'B', value: 2 },
      { type: 'button', label: 'Go' }, { type: 'stat', label: 'C', value: 3 }, { type: 'button', label: 'Later' },
    ],
  }).blocks;
  const g = pageLayout(blocks);
  assert.deepEqual(g.map((x) => x.kind), ['block', 'stats', 'block', 'stats', 'block']);
  assert.equal(g[0].lead, true);
  assert.equal(g[1].blocks.length, 2);
  assert.deepEqual(g.filter((x) => x.primary).map((x) => x.block.label), ['Go']);
  assert.equal(pageLayout([{ type: 'stat', value: 1 }, { type: 'text', text: 'not first' }])[1].lead, false);
  // With an emergency call on the page, no other button is primary.
  const urgent = validateSpec({ urgency: 'serious', blocks: [{ type: 'steps', items: ['Press'] }, { type: 'button', label: 'Done' }] });
  assert.equal(pageLayout(urgent.blocks).some((x) => x.primary), false);
});
