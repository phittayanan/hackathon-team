import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addVersion, historyText, lookText, paletteOf, referenceOf, MAX_VERSIONS, MAX_HISTORY_CHARS } from '../public/js/page-history.js';

const shown = (list, look, palette) => Object.assign(list.at(-1), { view: 'html', look, palette });

test('paletteOf: the most used colours as #rrggbb; character references and 8-digit hex are not colours', () => {
  const html = '<style>.a{color:#2b6be0}.b{background:#2B6BE0}.c{border:1px solid rgb(246, 239, 228)}.d{color:#fff}' +
    '.e{color:rgba(0,0,0,0)}.f{color:#ffffff80}</style><p>&#123; ok</p>';
  assert.deepEqual(paletteOf(html), ['#2b6be0', '#f6efe4', '#ffffff']);
  assert.deepEqual(paletteOf(''), []);
});

test('versions: numbered, the newest five kept, the one on screen named', () => {
  let list = addVersion([], { brief: 'A blue list of races', accent: 'blue', view: 'pending' });
  shown(list, { background: 'cream', accent: 'blue', sections: ['heading "Bangkok runs"', 'list of 2 items'] }, ['#2b6be0', '#f6efe4']);
  list = addVersion(list, { brief: 'Orange race poster, big countdown', accent: 'orange', view: 'pending' });
  const text = historyText(list);
  assert.match(text, /^Versions of this page: v1 from "A blue list of races": heading "Bangkok runs", list of 2 items; background cream, accent blue, colours #2b6be0 #f6efe4; /);
  assert.match(text, /v2 \(on screen now\) from "Orange race poster, big countdown": designed page still being written\.$/);
  for (let i = 0; i < 6; i++) list = addVersion(list, {});
  assert.equal(list.length, MAX_VERSIONS);
  assert.equal(list.at(-1).v, 8);
  assert.equal(historyText([]), '');
});

test('history: the oldest versions give way first, so the page on screen is always listed', () => {
  let list = [];
  for (let i = 0; i < 5; i++) {
    list = addVersion(list, { brief: `brief ${i} ${'x'.repeat(200)}` });
    shown(list, { background: 'cream', accent: 'blue', sections: ['y'.repeat(200)] }, ['#111111']);
  }
  const text = historyText(list);
  assert.ok(text.length <= MAX_HISTORY_CHARS);
  assert.match(text, /v5 \(on screen now\)/);
  assert.ok(!text.includes('v1 '));
});

test('a version without a designed page: the simple page, and nothing to send the page writer', () => {
  const list = addVersion([], { accent: 'green', view: 'blocks' });
  assert.equal(lookText(list[0]), 'simple block page, accent green');
  assert.equal(referenceOf(list[0]), null);
  shown(list, { background: 'white', accent: 'green', sections: [] }, []);
  assert.deepEqual(referenceOf(list[0]), { v: 1, look: 'background white, accent green', palette: [], brief: '' });
});
