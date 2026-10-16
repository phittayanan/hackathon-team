// Layout check for a model-written page after it is painted (scenes/generated.js measures it).
// Pure code on measured boxes, so the same module runs in the browser and in Node tests.
// Measurement only: no AI look check, no model call, no screenshot.
//
// checkPage(boxes, viewport, spec) -> [{ name, detail }]   (empty list: the page is fine)
//   boxes: one per element under the page wrapper, in document order (nothing inside an <svg>):
//     { parent, tag, text, rect: {x, y, width, height}, rects?, fontSize, display, visibility, tap }
//     parent: index of the parent box, or -1; text: the element's own text (its direct text nodes)
//     rect: relative to the page frame, in CSS px; rects: line boxes of an inline element (for overlap)
//     tap: the element is a tap target (data-action, data-toggle, data-count-step, button, link)
//   viewport: { width, height, contentWidth? }   width = the page frame; contentWidth = its scrollWidth
//   spec: the validated spec the page was written for (genui.js validateSpec)

export const EDGE_SLACK_PX = 2; // rounding room before a box counts as past an edge
export const OVERLAP_SHARE = 0.2; // two boxes overlap by more than this share of the smaller one
export const TALL_VIEWPORTS = 1.5; // one text or picture box taller than this many viewport heights
export const MAX_TEXT_PX = 64; // text bigger than this outside a heading
export const MIN_TEXT_PX = 12; // body text smaller than this
export const MIN_TAP_PX = 32; // a tap target smaller than this in width or height
export const MOST_WORDS = 0.6; // share of an item's words that must appear when the whole text does not
export const REPEAT_MIN_CHARS = 12; // a text block this long or longer...
export const REPEAT_TIMES = 3; // ...shown this many times or more
export const MIN_VISIBLE_CHARS = 20; // visible text (no spaces) below this: the page is empty
export const HIDDEN_SHARE = 0.5; // more than this share of the spec's items present but hidden
export const MAX_PER_CHECK = 3; // failures kept per check, so the log line stays short

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const PICTURES = new Set(['img', 'svg']);

// Lower case, no spaces, punctuation or symbols: Thai has no spaces between words, and the model
// may break a line or add an emoji inside an item.
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const quote = (s) => `"${String(s).replace(/\s+/g, ' ').trim().slice(0, 40)}"`;

// The text appears in the page text: all of it, or most of its words.
export function textShown(want, pageText) {
  const whole = norm(want);
  if (!whole) return true;
  if (pageText.includes(whole)) return true;
  const words = String(want).split(/\s+/).map(norm).filter(Boolean);
  if (words.length < 2) return false;
  return words.filter((w) => pageText.includes(w)).length / words.length >= MOST_WORDS;
}

const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
function shared(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function ancestors(boxes, i) {
  const out = new Set();
  for (let p = boxes[i].parent; p >= 0 && !out.has(p); p = boxes[p]?.parent ?? -1) out.add(p);
  return out;
}

// Hidden: display:none, visibility:hidden, zero size, or wholly outside the frame (left, right or above).
export function isHidden(box, viewport) {
  const r = box.rect;
  if (box.display === 'none' || box.visibility === 'hidden' || box.visibility === 'collapse') return true;
  if (!(r.width > 0 && r.height > 0)) return true;
  return r.x + r.width <= 0 || r.x >= viewport.width || r.y + r.height <= 0;
}

const specItems = (spec, types) =>
  (spec?.blocks || []).filter((b) => types.includes(b.type)).flatMap((b) => b.items.map((i) => (typeof i === 'string' ? i : i.text || i.title || '')));

export function checkPage(boxes, viewport, spec) {
  const fails = [];
  const add = (name, detail) => {
    if (fails.filter((f) => f.name === name).length < MAX_PER_CHECK) fails.push({ name, detail });
  };
  const hidden = boxes.map((b) => isHidden(b, viewport));
  const shown = boxes.map((b, i) => (hidden[i] ? null : b));
  const label = (b) => (b.text.trim() ? quote(b.text) : `<${b.tag}>`);
  const isText = (b) => Boolean(b.text.trim());
  const ups = boxes.map((_, i) => ancestors(boxes, i));
  const inHeading = (i) => HEADINGS.has(boxes[i].tag) || [...ups[i]].some((p) => HEADINGS.has(boxes[p].tag));

  // Overflow: the page is wider than the frame, or a box runs past the left or right edge.
  if (viewport.contentWidth > viewport.width + EDGE_SLACK_PX) {
    add('overflow', `page is ${Math.round(viewport.contentWidth)} px wide in a ${Math.round(viewport.width)} px screen`);
  }
  shown.forEach((b) => {
    if (b && (b.rect.x < -EDGE_SLACK_PX || b.rect.x + b.rect.width > viewport.width + EDGE_SLACK_PX)) {
      add('overflow', `${label(b)} runs past the ${b.rect.x < -EDGE_SLACK_PX ? 'left' : 'right'} edge`);
    }
  });

  // Overlap: two visible text or picture boxes, not one inside the other.
  const solid = shown.map((b, i) => (b && (isText(b) || PICTURES.has(b.tag)) ? i : -1)).filter((i) => i >= 0);
  const parts = (b) => (b.rects?.length ? b.rects : [b.rect]);
  for (let x = 0; x < solid.length; x++) {
    for (let y = x + 1; y < solid.length; y++) {
      const i = solid[x];
      const j = solid[y];
      if (ups[j].has(i) || ups[i].has(j)) continue;
      const a = boxes[i];
      const b = boxes[j];
      let both = 0;
      for (const ra of parts(a)) for (const rb of parts(b)) both += shared(ra, rb);
      const smaller = Math.min(parts(a).reduce((s, r) => s + area(r), 0), parts(b).reduce((s, r) => s + area(r), 0));
      if (smaller > 0 && both > OVERLAP_SHARE * smaller) add('overlap', `${label(a)} and ${label(b)}`);
    }
  }

  // Too big: a text or picture box (or a box with nothing inside) over 1.5 screens tall, a picture
  // wider than the screen, text over 64 px outside a heading. Containers may be long: pages scroll.
  const hasChild = new Set(boxes.map((b) => b.parent));
  shown.forEach((b, i) => {
    if (!b) return;
    if ((isText(b) || PICTURES.has(b.tag) || !hasChild.has(i)) && b.rect.height > TALL_VIEWPORTS * viewport.height) {
      add('too big', `${label(b)} is ${Math.round(b.rect.height)} px tall`);
    } else if (PICTURES.has(b.tag) && b.rect.width > viewport.width + EDGE_SLACK_PX) {
      add('too big', `picture <${b.tag}> is ${Math.round(b.rect.width)} px wide`);
    } else if (isText(b) && b.fontSize > MAX_TEXT_PX && !inHeading(i)) {
      add('too big', `${label(b)} text is ${Math.round(b.fontSize)} px`);
    }
  });

  // Too small: body text under 12 px, a tap target under 32 x 32 px.
  shown.forEach((b) => {
    if (!b) return;
    if (isText(b) && b.fontSize < MIN_TEXT_PX) add('too small', `${label(b)} text is ${Math.round(b.fontSize)} px`);
    if (b.tap && (b.rect.width < MIN_TAP_PX || b.rect.height < MIN_TAP_PX)) {
      add('too small', `tap target ${label(b)} is ${Math.round(b.rect.width)}x${Math.round(b.rect.height)} px`);
    }
  });

  // Missing: the title and each checklist item must appear in the page text (hidden text counts here;
  // hidden items are the "hidden" check below).
  const allText = boxes.map((b) => norm(b.text)).join('');
  const seenText = shown.map((b) => (b ? norm(b.text) : '')).join('');
  if (spec?.title && !textShown(spec.title, allText)) add('missing', `title ${quote(spec.title)}`);
  specItems(spec, ['checklist']).forEach((t) => {
    if (t && !textShown(t, allText)) add('missing', `item ${quote(t)}`);
  });

  // Extra or repeated: the same text block of 12+ characters three or more times; more list items
  // than the spec holds (only when the spec has list items at all).
  const counts = new Map();
  shown.forEach((b) => {
    const t = b?.text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (t && t.length >= REPEAT_MIN_CHARS) counts.set(t, (counts.get(t) || 0) + 1);
  });
  for (const [t, n] of counts) if (n >= REPEAT_TIMES) add('repeated', `${quote(t)} shown ${n} times`);
  const holds = specItems(spec, ['checklist', 'list', 'steps', 'sources']).length;
  const listed = shown.filter((b) => b?.tag === 'li').length;
  if (holds && listed > holds) add('extra', `${listed} list items, the spec holds ${holds}`);

  // Empty or hidden: under 20 visible characters; more than half the spec's items present but hidden.
  if (seenText.length < MIN_VISIBLE_CHARS) add('empty', `${seenText.length} visible characters`);
  const items = specItems(spec, ['checklist', 'list', 'steps']).filter((t) => norm(t));
  const gone = items.filter((t) => textShown(t, allText) && !textShown(t, seenText));
  if (items.length && gone.length > HIDDEN_SHARE * items.length) {
    add('hidden', `${gone.length} of ${items.length} items are hidden: ${gone.slice(0, 3).map(quote).join(', ')}`);
  }
  return fails;
}

// One line for the log and the agent: "overlap: "a" and "b"; missing: item "c"".
export const failureText = (fails) => fails.map((f) => `${f.name}: ${f.detail}`).join('; ');
