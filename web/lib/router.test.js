import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordRoute, route } from './router.js';

test('hectic week opens the shopping scene', () => {
  assert.equal(keywordRoute('this week is hectic').scene, 'shopping');
  assert.equal(keywordRoute('สัปดาห์นี้ยุ่งมาก').scene, 'shopping');
});

test('pay opens the payment scene', () => {
  assert.equal(keywordRoute('pay for it').scene, 'payment');
});

test('video tutorial requests open YouTube search with the useful subject terms', () => {
  const r = keywordRoute('ช่วยหาวิดีโอสอนเล่น rubric ให้หน่อย');
  assert.equal(r.scene, 'video-search');
  assert.equal(r.data.query, "เล่น Rubik's Cube");
  assert.match(r.say, /YouTube/);
});

test('a Shorts request opens the video scene in Shorts mode; ordinary words do not', () => {
  const r = keywordRoute('ขอดูช็อตส์สอนทำกาแฟหน่อย');
  assert.equal(r.scene, 'video-search');
  assert.equal(r.data.shorts, true);
  assert.equal(r.data.query, 'ทำกาแฟ');
  assert.equal(keywordRoute('ช่วยหาวิดีโอสอนเล่น rubric ให้หน่อย').data.shorts, undefined);
  assert.notEqual(keywordRoute('keyboard shortcut').scene, 'video-search');
});

test('voice can never approve a payment', () => {
  for (const said of ['allow', 'yes', 'ok pay now', 'อนุมัติ', 'จ่ายเลย']) {
    const r = keywordRoute(said, 'payment');
    assert.equal(r.action, 'button-only', said);
    assert.equal(r.scene, null, said);
  }
});

test('yes on the flight card confirms, no keeps it', () => {
  assert.equal(keywordRoute('yes change it', 'flight').action, 'confirm');
  assert.equal(keywordRoute('ไม่เอา', 'flight').action, 'decline');
});

test('unknown text only talks', () => {
  const r = keywordRoute('blue elephants');
  assert.equal(r.scene, null);
  assert.equal(r.line, 'unsure');
});

test('no key uses keywords', async () => {
  const r = await route('hectic', null);
  assert.equal(r.via, 'keywords');
  assert.equal(r.scene, 'shopping');
});
