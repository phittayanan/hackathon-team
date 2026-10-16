import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage } from '../public/js/page-check.js';
import { describePage, parseColour, colourName, MAX_LOOK_CHARS } from '../public/js/page-look.js';

const VIEW = { width: 390, height: 800, contentWidth: 390, background: 'rgba(0, 0, 0, 0) rgb(255, 255, 255)' };
const SPEC = { title: 'Beach day', blocks: [{ type: 'checklist', items: [{ text: 'Pack the bag' }, { text: 'Book the hotel room' }] }] };

const box = (parent, tag, text, [x, y, width, height], more = {}) => ({
  parent, tag, text, rect: { x, y, width, height }, fontSize: 16, display: 'block', visibility: 'visible', tap: false,
  color: 'rgb(30, 30, 30)', background: 'rgba(0, 0, 0, 0) none', hint: '', ...more,
});
// One wrapper holding a heading, a picture, a card with a two-item list, a progress bar and a button.
const page = () => [
  box(-1, 'main', '', [0, 0, 390, 1000]),
  box(0, 'h1', 'Beach day', [16, 16, 358, 48], { fontSize: 40 }),
  box(0, 'img', '', [16, 80, 358, 200]),
  box(0, 'section', '', [16, 300, 358, 220], { background: 'rgb(255, 255, 255) none', hint: 'card' }),
  box(3, 'h2', 'Plan', [32, 316, 326, 32], { fontSize: 22 }),
  box(3, 'ul', '', [32, 360, 326, 120]),
  box(5, 'li', 'Pack the bag', [32, 360, 326, 56], { fontSize: 14 }),
  box(5, 'li', 'Book the hotel room', [32, 424, 326, 56], { fontSize: 14 }),
  box(0, 'div', '', [16, 540, 358, 12], { background: 'rgb(220, 220, 220) none', hint: 'progressbar progress' }),
  box(0, 'button', 'Book now', [16, 900, 358, 56], { tap: true, color: 'rgb(255, 255, 255)', background: 'rgb(40, 100, 220) none' }),
];

test('a clean page: sections top to bottom, height, colours, text sizes and a passed check', () => {
  const boxes = page();
  const fails = checkPage(boxes, VIEW, SPEC);
  assert.deepEqual(fails, []);
  assert.equal(
    describePage(boxes, VIEW, fails),
    'Top to bottom: heading "Beach day", picture, card "Plan" with list of 2 items, progress bar, button "Book now". ' +
      'About 1.3 screens tall. Background white, accent blue. Text 14 to 40 px. Layout check: passed',
  );
});

test('a failed check is named with the same words as the log line', () => {
  const boxes = page();
  boxes[7].text = 'Something else';
  const fails = checkPage(boxes, VIEW, SPEC);
  assert.match(describePage(boxes, VIEW, fails), /Layout check: missing: item "Book the hotel room"$/);
});

test('sections come in screen order; hidden boxes are left out; a short page fits one screen', () => {
  const boxes = [
    box(-1, 'p', 'Second line of text', [0, 300, 390, 24]),
    box(-1, 'h1', 'First', [0, 0, 390, 40], { fontSize: 30 }),
    box(-1, 'p', 'Gone', [0, 100, 390, 24], { display: 'none' }),
  ];
  const out = describePage(boxes, { ...VIEW, background: 'rgb(20, 40, 80)' }, []);
  assert.match(out, /^Top to bottom: heading "First", text "Second line of text"\. Fits one screen\. Background navy, accent none\. Text 16 to 30 px\./);
});

test('the page background falls back past a transparent colour to a gradient', () => {
  const out = describePage([box(-1, 'h1', 'Hi there, friend', [0, 0, 390, 40])], { ...VIEW, background: 'rgba(0, 0, 0, 0) linear-gradient(rgb(255, 150, 50), rgb(59, 111, 182))' }, []);
  assert.match(out, /Background orange/);
});

test('a long page is cut with an ellipsis and keeps the check verdict', () => {
  const boxes = Array.from({ length: 40 }, (_, i) => box(-1, 'h2', `A rather long heading number ${i} for the page`, [0, i * 60, 390, 50]));
  const fails = [{ name: 'overlap', detail: '"a" and "b"' }];
  const out = describePage(boxes, VIEW, fails);
  assert.ok(out.length <= MAX_LOOK_CHARS, `${out.length} chars`);
  assert.match(out, /and 32 more\./);
  const long = describePage(boxes, VIEW, Array.from({ length: 30 }, () => fails[0]));
  assert.ok(long.length <= MAX_LOOK_CHARS && long.endsWith('…'));
});

test('colours: parsed from rgb, rgba and hex; transparent skipped; named by the nearest', () => {
  assert.deepEqual(parseColour('rgba(0, 0, 0, 0) rgb(1, 2, 3)'), [1, 2, 3]);
  assert.deepEqual(parseColour('rgb(10 20 30 / 50%)'), [10, 20, 30]);
  assert.deepEqual(parseColour('#fa0'), [255, 170, 0]);
  assert.equal(parseColour('rgba(0, 0, 0, 0) none'), null);
  assert.equal(colourName([250, 250, 250]), 'white');
  assert.equal(colourName([60, 60, 60]), 'dark grey');
  assert.equal(colourName([35, 162, 109]), 'green');
});

test('checkPage ignores the extra colour fields', () => {
  const plain = page().map(({ color, background, hint, ...rest }) => rest);
  assert.deepEqual(checkPage(page(), VIEW, SPEC), checkPage(plain, VIEW, SPEC));
});
