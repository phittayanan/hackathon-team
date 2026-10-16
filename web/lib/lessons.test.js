import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addLesson, lessons, lessonsText, forgetLesson, forgetLessons, normLesson, isRejection, saysBlind, isToolError, isLayoutFailure, createLessonWatch, MAX_LESSONS, MAX_LESSON_LEN, REJECT_WINDOW_MS, COOLDOWN_MS } from '../public/js/lessons.js';
import { createToolHandlers, TOOL_DEFS } from '../public/js/agent-tools.js';
import { sessionVariables } from '../public/js/memory.js';
import { forgetOnRequest } from '../public/js/learn.js';

beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
});

const PRETTIER = 'When asked to make a page prettier, change only its look and keep its content.';

test('lessons: newest first, capped, deduplicated by normalized text, cut to 120 characters', () => {
  assert.equal(lessonsText(), 'nothing yet');
  for (let i = 0; i < MAX_LESSONS + 2; i++) addLesson(`Rule number ${i} for the agent.`, i);
  assert.equal(lessons().length, MAX_LESSONS);
  assert.equal(lessons()[0].text, `Rule number ${MAX_LESSONS + 1} for the agent.`);
  // The same rule again (other case, spaces, no full stop) moves to the top, not a second copy.
  addLesson('  rule NUMBER 3   for the agent ', 99);
  assert.equal(lessons().length, MAX_LESSONS);
  assert.equal(normLesson(lessons()[0].text), 'rule number 3 for the agent');
  assert.equal(lessons().filter((l) => normLesson(l.text) === 'rule number 3 for the agent').length, 1);
  assert.equal(addLesson('x'.repeat(300)).text.length, MAX_LESSON_LEN);
  assert.equal(addLesson(''), null);
  assert.equal(addLesson('short'), null);
});

test('{{lessons}} goes to the agent at session start; forget one, forget all, ?forget=1', () => {
  addLesson('Write spec_json as one valid JSON object.');
  addLesson(PRETTIER);
  assert.equal(sessionVariables({}).lessons, `1) ${PRETTIER} 2) Write spec_json as one valid JSON object.`);
  assert.equal(forgetLesson(PRETTIER.toUpperCase()), true);
  assert.equal(forgetLesson(PRETTIER), false);
  assert.equal(lessons().length, 1);
  forgetLessons();
  assert.equal(sessionVariables({}).lessons, 'nothing yet');
  addLesson(PRETTIER);
  forgetOnRequest('?forget=1');
  assert.equal(lessonsText(), 'nothing yet');
});

test('rejection words: a small list, Thai and English, and words that only look like a no', () => {
  for (const no of ['ไม่', 'ไม่ค่ะ', 'ไม่ใช่แบบนี้', 'ไม่เอาแบบนี้', 'ไม่ชอบเลย', 'แย่มาก', 'ใครจะดู', 'สีผิด', 'no', 'No, not that', 'that is wrong', 'ugly', "I didn't ask for that"]) {
    assert.equal(isRejection(no), true, no);
  }
  for (const fine of ['ไม่เป็นไร', 'สวยกว่านี้ได้ไหม', 'ok nice', 'noted', 'not bad', 'know more', 'ขอบคุณ', '']) {
    assert.equal(isRejection(fine), false, fine);
  }
});

test('the agent saying it cannot see what the user means, and other signals', () => {
  assert.equal(saysBlind('ขอโทษค่ะ ฉันมองไม่เห็นหน้าก่อนหน้านี้'), true);
  assert.equal(saysBlind("Sorry, I can't see the earlier version."), true);
  assert.equal(saysBlind('I do not know which one you mean'), true);
  assert.equal(saysBlind('ได้เลยค่ะ เปลี่ยนสีให้แล้ว'), false);
  assert.equal(isToolError('error: spec_json is not valid JSON'), true);
  assert.equal(isToolError('refused: only the owner can approve a payment by tapping Allow.'), false);
  assert.equal(isLayoutFailure('[screen] The designed page was replaced by the simple page because: overlap'), true);
  assert.equal(isLayoutFailure('[screen] The designed page (v1) looks like: ...'), false);
});

test('reassurance after a page is shown does not ask for a mistake lesson', () => {
  const w = createLessonWatch({ now: () => 100000 });
  w.pageShown();
  for (const text of ['No problem, thank you', 'No worries', 'NO PROBLEM!', 'No problems, thanks']) {
    assert.equal(isRejection(text), false, text);
    assert.equal(w.user(text), null, text);
  }
  assert.equal(w.user('No problem, but this is wrong').kind, 'user rejected');
});

test('the watch asks once per mistake: tool error, layout check, rejection right after a page, blind reply', () => {
  let t = 0;
  const w = createLessonWatch({ now: () => t });
  const ask = w.tool('render_ui', 'error: spec_json is not valid JSON');
  assert.equal(ask.kind, 'tool error');
  assert.match(ask.text, /^\[lesson\] A mistake just happened: the render_ui tool answered "error: spec_json is not valid JSON"\. .*call note_lesson once/);
  assert.match(ask.text, /what to do, not what to avoid/);
  // Within the cooldown, the next symptom of the same mistake asks nothing.
  t += 1000;
  assert.equal(w.tool('render_ui', 'error: spec has no usable blocks'), null);
  t += COOLDOWN_MS;
  assert.equal(w.tool('render_ui', 'page shown; now ask if the user likes it'), null);
  assert.equal(w.tool('note_lesson', 'error: whatever'), null); // never about itself
  assert.equal(w.context('[screen] The designed page was replaced by the simple page because: overlap').kind, 'layout check');
  t += COOLDOWN_MS;
  // A "no" counts only right after a page appeared.
  assert.equal(w.user('ไม่ใช่'), null);
  w.pageShown();
  t += 5000;
  assert.equal(w.user('ไม่เป็นไร'), null);
  assert.equal(w.user('ใครจะดู').kind, 'user rejected');
  t += COOLDOWN_MS + REJECT_WINDOW_MS;
  assert.equal(w.user('ไม่ใช่'), null); // the page is old news
  assert.equal(w.agent('ขอโทษค่ะ มองไม่เห็นหน้าเดิม').kind, 'agent blind');
});

test('negated criticism is feedback, not a mistake signal, while separate criticism still counts', () => {
  const w = createLessonWatch({ now: () => 100000 });
  w.pageShown();
  for (const text of ['ไม่ผิดแล้ว', 'ไม่แย่เลย', 'not ugly', 'it is not wrong', 'not terrible', 'not awful', 'ไม่ได้แย่เลย']) {
    assert.equal(isRejection(text), false, text);
    assert.equal(w.user(text), null, text);
  }
  for (const text of ['ไม่ผิดแล้ว แต่ไม่ชอบสี', 'ไม่แย่เลย แต่กราฟผิด', 'not ugly, but the numbers are wrong', 'not wrong, but ugly']) {
    assert.equal(isRejection(text), true, text);
    const rejected = createLessonWatch({ now: () => 100000 });
    rejected.pageShown();
    assert.equal(rejected.user(text).kind, 'user rejected', text);
  }
});

test('note_lesson: a tool in the agent config, stores the line, never answers "error:"', () => {
  const def = TOOL_DEFS.find((t) => t.name === 'note_lesson');
  assert.ok(def);
  assert.equal(def.params.lesson.required, true);
  assert.match(def.description, /what to do next time, not\s+what to avoid/);
  const h = createToolHandlers({ plan: { start() { return false; }, busy() {}, tick() {}, clear() {} }, remember: () => true, current: () => null });
  assert.equal(h.note_lesson({ lesson: PRETTIER }), 'noted; do not mention it to the user');
  assert.deepEqual(lessons().map((l) => l.text), [PRETTIER]);
  assert.match(h.note_lesson({ lesson: '' }), /^not saved/);
  assert.match(h.remember({ key: 'forget_all' }), /^forgot everything/);
  assert.equal(lessonsText(), 'nothing yet');
});
