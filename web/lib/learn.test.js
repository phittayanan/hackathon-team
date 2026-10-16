import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { learn, learned, learnedText, forgetLearnedKey, reviseLessons, noteRevise, noteKeep, noteIgnored, noteFeed, agentOpened, proactiveWatch, forgetOnRequest, MAX_LEARNED, styleChanges, noteStyle, noteHeard, heardWish } from '../public/js/learn.js';
import { styleProfile, setStyle, STYLE_DEFAULT } from '../public/js/style.js';
import { createToolHandlers } from '../public/js/agent-tools.js';
import { sessionVariables } from '../public/js/memory.js';

beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
});

const todo = (blocks, extra = {}) => ({ kind: 'todo', name: 'To-do list', accent: 'orange', blocks, ...extra });

test('a revise teaches what the user asked to change: blocks added or left out, due dates, colour', () => {
  const before = todo([{ type: 'checklist', items: [{ text: 'Run' }] }, { type: 'text', text: 'hi' }]);
  const after = todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }] }, { type: 'progress', value: 'auto' }], { accent: 'green' });
  assert.deepEqual(reviseLessons(before, after, 'add a progress bar, drop the note, give each a due date, make it green').map((l) => l.text), [
    'todo pages: add a progress bar',
    'todo pages: leave out a note',
    'todo pages: give checklist items due dates',
    'todo pages: green colour',
  ]);
  assert.deepEqual(reviseLessons(before, after, 'เพิ่มหลอดความคืบหน้า ใส่วันที่ครบกำหนด สีเขียว').map((l) => l.text), [
    'todo pages: add a progress bar',
    'todo pages: give checklist items due dates',
    'todo pages: green colour',
  ]);
  assert.deepEqual(reviseLessons(before, before, 'add a progress bar'), []);
  // No words heard (or older than a minute): nothing the user asked for, nothing learned.
  assert.deepEqual(reviseLessons(before, after), []);
  // Some items had a due date; after the revise every item has one.
  const some = todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }, { text: 'Swim' }] }]);
  const every = todo([{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }, { text: 'Swim', due: 'Tue' }] }]);
  assert.deepEqual(reviseLessons(some, every, 'due dates for all').map((l) => l.text), ['todo pages: give checklist items due dates']);
});

// Run log, session 50es27: the user only asked for a prettier page; the agent itself switched to
// orange and added numbers and a progress bar. None of that is the user's preference.
test('"make it prettier" teaches nothing: the agent\'s own changes are not the user\'s wishes', () => {
  const before = todo([{ type: 'checklist', items: [{ text: 'Run' }, { text: 'Swim' }] }], { accent: 'blue' });
  const after = todo([{ type: 'stat', label: 'Done', value: '0/2' }, { type: 'progress', value: 'auto' }, { type: 'checklist', items: [{ text: 'Run' }, { text: 'Swim' }] }], { accent: 'orange' });
  assert.deepEqual(reviseLessons(before, after, 'สวยกว่านี้ได้ไหม'), []);
  assert.deepEqual(reviseLessons(before, after, 'make it prettier'), []);
  noteHeard('สวยกว่านี้ได้ไหม');
  assert.deepEqual(noteRevise(before, after), []);
  assert.equal(learnedText(), 'nothing yet');
  // Only the change the words name: the colour, not the extras.
  assert.deepEqual(reviseLessons(before, after, 'เปลี่ยนเป็นสีส้ม').map((l) => l.text), ['todo pages: orange colour']);
  assert.deepEqual(reviseLessons(before, after, 'ขอตัวเลขสรุปด้วย').map((l) => l.text), ['todo pages: add numbers']);
});

test('words inside other words do not name a change', () => {
  const before = todo([{ type: 'text', text: 'hi' }], { accent: 'blue' });
  const after = todo([{ type: 'text', text: 'hi' }, { type: 'image', prompt: 'beach' }], { accent: 'orange' });
  assert.deepEqual(reviseLessons(before, after, 'เปลี่ยนรูปแบบหน่อย'), []); // "format", not "picture"
  assert.deepEqual(reviseLessons(before, after, 'อยากกินส้มตำ'), []); // som tam, not orange
  assert.deepEqual(reviseLessons(before, after, 'ใส่รูปทะเล').map((l) => l.text), ['todo pages: add a picture']);
  const list = todo([{ type: 'checklist', items: [{ text: 'a' }] }, { type: 'list', items: ['b'] }]);
  assert.deepEqual(reviseLessons(before, list, 'add a checklist').map((l) => l.text), ['todo pages: add a checklist']); // not "a list"
  assert.deepEqual(reviseLessons(before, list, 'add a check list').map((l) => l.text), ['todo pages: add a checklist']);
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
  noteHeard('give each task a due date');
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

const chartPage = (extra = []) => todo([{ type: 'chart', bars: [{ label: 'a', value: 1 }] }, ...extra]);
const plain = todo([{ type: 'text', text: 'hi' }]);
const wish = (text, profile = STYLE_DEFAULT) => styleChanges(plain, plain, text, profile);

test('block lessons and chart profile require explicit direction matching the diff', () => {
  for (const [direction, wishes] of [
    ['+', ['add a chart', 'include the graph', 'เพิ่มกราฟ', 'ใส่แผนภูมิ']],
    ['-', ['remove the chart', 'drop the graph', 'เอากราฟออก', 'ลบแผนภูมิ', 'ไม่เอากราฟ']],
  ]) {
    const [before, after] = direction === '+' ? [todo([]), chartPage()] : [chartPage(), todo([])];
    const profile = { ...STYLE_DEFAULT, charts: direction === '+' ? 'avoid' : 'ok' };
    for (const text of wishes) {
      assert.deepEqual(reviseLessons(before, after, text).map((l) => l.key), [`todo:${direction}chart`], text);
      assert.deepEqual(styleChanges(before, after, text, profile), [{ key: 'charts', value: direction === '+' ? 'ok' : 'avoid' }], text);
      assert.deepEqual(reviseLessons(after, before, text), [], `opposite diff: ${text}`);
      assert.deepEqual(styleChanges(after, before, text, profile), [], `opposite diff: ${text}`);
    }
  }
  for (const text of [
    'make chart prettier', 'make the chart green', 'เปลี่ยนสีกราฟ', 'ขอกราฟสวยขึ้นด้วย',
    'keep the chart', 'เก็บกราฟไว้', "don't remove the chart", 'do not add a chart',
    'never drop the chart', 'อย่าเอากราฟออก', 'ไม่ต้องเพิ่มกราฟ', 'ไม่ลบกราฟ', 'ไม่เอากราฟออก',
    'add a chart, remove the chart', 'add color to the chart', 'เพิ่มขนาดกราฟ',
    'remove the chart border', "remove the chart's title", 'remove the chart’s legend',
  ]) {
    for (const [before, after] of [[todo([]), chartPage()], [chartPage(), todo([])]]) {
      assert.deepEqual(reviseLessons(before, after, text).filter((l) => /[+-]chart$/.test(l.key)), [], text);
      for (const charts of ['ok', 'avoid']) {
        assert.deepEqual(styleChanges(before, after, text, { ...STYLE_DEFAULT, charts }).filter((l) => l.key === 'charts'), [], text);
      }
    }
  }
});

test('directions stay with their component across clauses', () => {
  const before = chartPage();
  const after = todo([{ type: 'progress', value: 'auto' }]);
  for (const text of ['remove the chart and add a progress bar', 'เอากราฟออก แล้วเพิ่มหลอดความคืบหน้า']) {
    assert.deepEqual(reviseLessons(before, after, text).map((l) => l.key), ['todo:+progress', 'todo:-chart'], text);
  }
  for (const text of ["don't remove the chart, add a progress bar", 'เก็บกราฟไว้ แต่เพิ่มหลอดความคืบหน้า']) {
    assert.deepEqual(reviseLessons(before, after, text).map((l) => l.key), ['todo:+progress'], text);
    assert.deepEqual(styleChanges(before, after, text), [], text);
  }
  assert.deepEqual(reviseLessons(before, after, 'remove the note, make the chart prettier'), []);
  assert.deepEqual(reviseLessons(todo([]), after, 'add due dates and a progress bar').map((l) => l.key), ['todo:+progress']);
  assert.deepEqual(reviseLessons(todo([]), after, "don't add due dates and a progress bar"), []);
  for (const text of ['remove the note but add due dates and a chart', 'remove the note then add due dates and a chart', 'remove the note and add due dates and a chart']) {
    assert.deepEqual(reviseLessons(chartPage(), todo([]), text), [], text);
    assert.deepEqual(styleChanges(chartPage(), todo([]), text), [], text);
    assert.deepEqual(reviseLessons(todo([]), chartPage(), text).map((l) => l.key), ['todo:+chart'], text);
  }
});

test('keeping a chart while changing colour cannot teach chart avoidance', () => {
  noteHeard('เก็บกราฟไว้ เปลี่ยนเป็นสีเขียว');
  noteRevise(chartPage(), todo([], { accent: 'green' }));
  assert.equal(styleProfile().charts, 'ok');
  assert.equal(styleProfile().accent, 'green');
  assert.deepEqual(learned().map((l) => l.key).sort(), ['style:accent', 'todo:accent']);
});

test('revise wishes become style changes, in Thai and English', () => {
  assert.deepEqual(wish('ขอตัวหนังสือใหญ่ขึ้น'), [{ key: 'size', value: 'large' }]);
  assert.deepEqual(wish('make the text bigger', { ...STYLE_DEFAULT, size: 'large' }), [{ key: 'size', value: 'xlarge' }]);
  assert.deepEqual(wish('bigger please', { ...STYLE_DEFAULT, size: 'xlarge' }), []); // already the largest
  assert.deepEqual(wish('ตัวใหญ่ไป', { ...STYLE_DEFAULT, size: 'large' }), [{ key: 'size', value: 'normal' }]);
  assert.deepEqual(wish('เล็กลงหน่อย', { ...STYLE_DEFAULT, size: 'large' }), [{ key: 'size', value: 'normal' }]);
  assert.deepEqual(wish('text is too small'), [{ key: 'size', value: 'large' }]);
  assert.deepEqual(wish('ขอโล่งๆ'), [{ key: 'density', value: 'airy' }]);
  assert.deepEqual(wish('simpler'), [{ key: 'density', value: 'airy' }]);
  assert.deepEqual(wish('แน่นกว่านี้ได้'), [{ key: 'density', value: 'compact' }]);
  assert.deepEqual(wish('more detail'), [{ key: 'density', value: 'compact' }]);
  assert.deepEqual(wish('อ่านยาก'), [{ key: 'contrast', value: 'high' }]);
  assert.deepEqual(wish('more contrast'), [{ key: 'contrast', value: 'high' }]);
  assert.deepEqual(wish('เปลี่ยนเป็นสีเขียวอมฟ้า'), [{ key: 'accent', value: 'teal' }]);
  assert.deepEqual(wish('make it blue'), [{ key: 'accent', value: 'blue' }]);
  assert.deepEqual(wish('สีชมพู'), [{ key: 'accent', value: 'rose' }]);
  assert.deepEqual(wish('bigger and teal'), [{ key: 'size', value: 'large' }, { key: 'accent', value: 'teal' }]);
});

test('words that only look like style wishes change nothing', () => {
  assert.deepEqual(wish('แก้เล็กน้อย เพิ่มงานแรก'), []); // "a little", "first"
  assert.deepEqual(wish('เพิ่มค่าไฟฟ้า'), []); // electricity bill
  assert.deepEqual(wish('add a due date'), []);
  assert.deepEqual(wish(''), []);
});

test('a chart the user asked to remove sets charts: avoid; one asked back sets ok; the agent\'s own does nothing', () => {
  assert.deepEqual(styleChanges(chartPage(), plain, 'เอากราฟออก'), [{ key: 'charts', value: 'avoid' }]);
  assert.deepEqual(styleChanges(plain, chartPage(), 'add a chart', { ...STYLE_DEFAULT, charts: 'avoid' }), [{ key: 'charts', value: 'ok' }]);
  assert.deepEqual(styleChanges(chartPage(), chartPage(), 'เอากราฟออก'), []);
  assert.deepEqual(styleChanges(chartPage(), plain, 'สวยกว่านี้ได้ไหม'), []);
  assert.deepEqual(styleChanges(chartPage(), plain, ''), []);
});

test('noteStyle saves the profile and adds one learned line per change', () => {
  noteStyle(chartPage(), plain, 'ใหญ่ขึ้น สีเขียวอมฟ้า ไม่เอากราฟ');
  assert.deepEqual(styleProfile(), { ...STYLE_DEFAULT, size: 'large', accent: 'teal', charts: 'avoid' });
  assert.match(learnedText(), /style: large text/);
  assert.match(learnedText(), /style: teal accent/);
  assert.match(learnedText(), /style: avoid charts/);
  // The same wish again on the largest step: nothing new.
  setStyle('size', 'xlarge');
  assert.deepEqual(noteStyle(plain, plain, 'bigger'), []);
});

test('noteRevise reads the last thing heard, within a minute', () => {
  noteHeard('bigger text please', 1000);
  assert.equal(heardWish(30000), 'bigger text please');
  assert.equal(heardWish(62000), '');
  noteHeard('ขอใหญ่ขึ้น');
  noteRevise(plain, plain);
  assert.equal(styleProfile().size, 'large');
  assert.equal(forgetOnRequest('?forget=1'), true);
  assert.deepEqual(styleProfile(), STYLE_DEFAULT);
});
