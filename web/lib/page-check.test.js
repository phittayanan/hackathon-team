import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, textShown, isHidden, failureText, norm, MAX_PER_CHECK } from '../public/js/page-check.js';

const VIEW = { width: 390, height: 800, contentWidth: 390 };
const SPEC = {
  title: 'Weekend trip',
  blocks: [
    { type: 'text', text: 'Sea and sun' },
    { type: 'checklist', items: [{ text: 'Pack the bag', done: false }, { text: 'Book the hotel room', done: false }] },
  ],
};

// A box with sensible defaults; parent 0 is the page section.
const box = (tag, text, [x, y, width, height], more = {}) => ({
  parent: 0, tag, text, rect: { x, y, width, height }, fontSize: 16, display: 'block', visibility: 'visible', tap: false, ...more,
});
// A clean page: a section holding a title, two items and a button, stacked with no overlap.
const clean = () => [
  box('section', '', [0, 0, 390, 400], { parent: -1 }),
  box('h1', 'Weekend trip', [16, 16, 358, 48], { fontSize: 40 }),
  box('ul', '', [16, 80, 358, 120]),
  box('li', 'Pack the bag', [16, 80, 358, 40], { parent: 2 }),
  box('li', 'Book the hotel room', [16, 130, 358, 40], { parent: 2 }),
  box('button', 'Go', [16, 220, 358, 48], { tap: true }),
  box('p', 'Sea and sun every day', [16, 290, 358, 24]),
];
const names = (fails) => fails.map((f) => f.name);

test('a clean page passes every check', () => {
  assert.deepEqual(checkPage(clean(), VIEW, SPEC), []);
});

test('overflow: content wider than the screen, or a box past an edge', () => {
  assert.deepEqual(names(checkPage(clean(), { ...VIEW, contentWidth: 520 }, SPEC)), ['overflow']);
  const page = clean();
  page[5].rect.x = 200; // 200 + 358 > 390
  const fails = checkPage(page, VIEW, SPEC);
  assert.deepEqual(names(fails), ['overflow']);
  assert.match(fails[0].detail, /"Go" runs past the right edge/);
  page[5].rect.x = 1; // 1 px of rounding is fine
  assert.deepEqual(checkPage(page, VIEW, SPEC), []);
});

test('overlap: text boxes over each other by more than 20% of the smaller; parent and child never count', () => {
  const page = clean();
  page[4].rect.y = 90; // second item 30 of its 40 px over the first
  const fails = checkPage(page, VIEW, SPEC);
  assert.deepEqual(names(fails), ['overlap']);
  assert.equal(fails[0].detail, '"Pack the bag" and "Book the hotel room"');
  page[4].rect.y = 115; // 5 of 40 px: 12.5%, fine
  assert.deepEqual(checkPage(page, VIEW, SPEC), []);
  // A picture over text counts; the list around its own items does not (it has no text of its own).
  const pic = [...clean(), box('img', '', [16, 16, 120, 48])];
  assert.deepEqual(names(checkPage(pic, VIEW, SPEC)), ['overlap']);
  // Inline text that wraps: its line boxes are compared, not its bounding box.
  const inline = [
    ...clean(),
    box('span', 'first part of a long line that wraps', [16, 330, 358, 40], { rects: [{ x: 16, y: 330, width: 358, height: 20 }, { x: 16, y: 350, width: 100, height: 20 }] }),
    box('b', 'next part', [116, 350, 80, 20]),
  ];
  assert.deepEqual(checkPage(inline, VIEW, SPEC), []);
});

test('too big: a box over 1.5 screens tall, a picture wider than the screen, huge text outside a heading', () => {
  const tall = [...clean(), box('div', '', [16, 400, 358, 1300])]; // an empty box 1.6 screens tall
  assert.deepEqual(failureText(checkPage(tall, VIEW, SPEC)), 'too big: <div> is 1300 px tall');
  const long = clean();
  long[0].rect.height = 3000; // a long container is fine: pages scroll
  assert.deepEqual(checkPage(long, VIEW, SPEC), []);
  assert.deepEqual(names(checkPage([...clean(), box('img', '', [0, 500, 700, 200])], VIEW, SPEC)), ['overflow', 'too big']);
  const huge = [...clean(), box('div', '62%', [16, 330, 200, 90], { fontSize: 88 })];
  assert.match(failureText(checkPage(huge, VIEW, SPEC)), /^too big: "62%" text is 88 px$/);
  const heading = clean();
  heading[1].fontSize = 72;
  assert.deepEqual(checkPage(heading, VIEW, SPEC), []);
  // A span inside a heading is part of the heading.
  assert.deepEqual(checkPage([...clean(), box('span', 'trip', [16, 16, 100, 48], { parent: 1, fontSize: 72 })], VIEW, SPEC), []);
});

test('too small: body text under 12 px, a tap target under 32 x 32 px', () => {
  const page = clean();
  page[3].fontSize = 10;
  page[5].rect.height = 24;
  const fails = checkPage(page, VIEW, SPEC);
  assert.deepEqual(fails.map((f) => f.detail), ['"Pack the bag" text is 10 px', 'tap target "Go" is 358x24 px']);
});

test('missing: the title and each checklist item must appear, whole or most of its words', () => {
  assert.equal(textShown('Book the hotel room', norm('Book a hotel room now')), true); // 3 of 4 words
  assert.equal(textShown('Book the hotel room', norm('Hotel')), false);
  assert.equal(textShown('ทริป หัวหิน', norm('ทริปหัวหิน')), true); // spaces never matter
  const page = clean().filter((b) => b.text !== 'Book the hotel room');
  page[1].text = 'Trip';
  const fails = checkPage(page, VIEW, SPEC);
  assert.deepEqual(fails, [{ name: 'missing', detail: 'title "Weekend trip"' }, { name: 'missing', detail: 'item "Book the hotel room"' }]);
});

test('extra or repeated: a text block of 12+ characters three times; more list items than the spec holds', () => {
  const page = [...clean(), box('p', 'Sea and sun all day', [16, 330, 358, 20]), box('p', 'Sea and sun all day', [16, 360, 358, 20])];
  assert.deepEqual(checkPage(page, VIEW, SPEC), []); // twice is fine
  page.push(box('p', 'sea and  sun all day', [16, 390, 358, 20]));
  assert.deepEqual(failureText(checkPage(page, VIEW, SPEC)), 'repeated: "sea and sun all day" shown 3 times');
  const more = [...clean(), box('li', 'Buy sun cream', [16, 180, 358, 30], { parent: 2 })];
  assert.deepEqual(failureText(checkPage(more, VIEW, SPEC)), 'extra: 3 list items, the spec holds 2');
  // A spec with no list items says nothing about how many the page may use.
  const plain = { title: 'Weekend trip', blocks: [{ type: 'text', text: 'Sea' }] };
  assert.deepEqual(checkPage(more, VIEW, plain), []);
});

test('empty or hidden: under 20 visible characters; more than half the items present but hidden', () => {
  const empty = [box('section', '', [0, 0, 390, 400], { parent: -1 }), box('p', 'Hi there', [16, 16, 200, 20])];
  assert.deepEqual(names(checkPage(empty, VIEW, { title: 'Hi', blocks: [] })), ['empty']);
  for (const hide of [{ display: 'none' }, { visibility: 'hidden' }, { rect: { x: 0, y: 0, width: 0, height: 0 } }, { rect: { x: -500, y: 80, width: 300, height: 40 } }]) {
    const page = clean();
    Object.assign(page[3], hide);
    Object.assign(page[4], hide);
    assert.equal(isHidden(page[3], VIEW), true);
    assert.deepEqual(names(checkPage(page, VIEW, SPEC)), ['hidden'], JSON.stringify(hide));
  }
  const half = clean();
  half[4].display = 'none'; // one of two is not more than half
  assert.deepEqual(checkPage(half, VIEW, SPEC), []);
});

test('at most a few failures per check, so the log line stays short', () => {
  const page = [box('section', '', [0, 0, 390, 400], { parent: -1 }), ...Array.from({ length: 8 }, (_, i) => box('p', `Weekend trip ${i} Pack the bag Book the hotel room`, [16, 16, 358, 20], { fontSize: 10 }))];
  const fails = checkPage(page, VIEW, SPEC);
  assert.equal(fails.filter((f) => f.name === 'overlap').length, MAX_PER_CHECK);
  assert.equal(fails.filter((f) => f.name === 'too small').length, MAX_PER_CHECK);
});
