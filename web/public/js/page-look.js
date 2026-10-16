// How a painted model page looks, as one short plain-text line for the live agent.
// Pure code on the same measured boxes as page-check.js (scenes/generated.js measures them), so it
// runs in the browser and in Node tests. Measurement only: no screenshot, no picture, no model call.
//
// describePage(boxes, viewport, fails) -> 'Top to bottom: heading "…", card "…" with list of 3 items, …'
//   boxes: as in page-check.js, plus two optional fields from getComputedStyle:
//     color: the text colour; background: background-color and background-image, joined by a space
//     hint: the element's role and class, for names like card, progress or timeline
//   viewport: as in page-check.js, plus background: the page's own background (same form as above)
//   fails: the checkPage result for these boxes
import { isHidden, failureText } from './page-check.js';

export const MAX_LOOK_CHARS = 600;
export const MAX_SECTIONS = 8;

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const PICTURES = new Set(['img', 'svg', 'picture', 'canvas', 'video']);
const LISTS = new Set(['ul', 'ol']);

// A small named list; a colour gets the nearest name.
export const COLOUR_NAMES = {
  white: [255, 255, 255],
  cream: [250, 243, 230],
  'light grey': [211, 211, 211],
  grey: [128, 128, 128],
  'dark grey': [64, 64, 64],
  black: [0, 0, 0],
  red: [220, 40, 40],
  orange: [245, 140, 40],
  yellow: [245, 215, 60],
  green: [50, 160, 80],
  teal: [30, 150, 150],
  'light blue': [140, 200, 245],
  blue: [40, 100, 220],
  navy: [20, 40, 80],
  purple: [130, 60, 170],
  pink: [235, 110, 170],
  brown: [130, 80, 40],
};

// The first colour with any opacity in a CSS value: rgb()/rgba() or #hex. null when there is none.
export function parseColour(text) {
  const s = String(text ?? '');
  const re = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)|#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  for (const m of s.matchAll(re)) {
    if (m[5]) {
      const h = m[5].length === 3 ? [...m[5]].map((c) => c + c).join('') : m[5];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const alpha = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (alpha > 0) return [m[1], m[2], m[3]].map(Number);
  }
  return null;
}

export function colourName(rgb) {
  let best = 'white';
  let far = Infinity;
  for (const [name, c] of Object.entries(COLOUR_NAMES)) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < far) [best, far] = [name, d];
  }
  return best;
}

// Colourful enough to be an accent (not white, black or a grey).
const vivid = (rgb) => Math.max(...rgb) - Math.min(...rgb) >= 60;
const quote = (s) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return `"${t.length > 30 ? `${t.slice(0, 29)}…` : t}"`;
};
const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);

export function describePage(boxes, viewport, fails = []) {
  return describeLook(boxes, viewport, fails).text;
}

// The same look as facts too, for the page's version history (page-history.js):
// { text, background, accent ('none' when there is none), sections: ['heading "…"', …] }.
export function describeLook(boxes, viewport, fails = []) {
  const shown = boxes.map((b) => !isHidden(b, viewport));
  const kids = boxes.map(() => []);
  boxes.forEach((b, i) => {
    if (shown[i] && b.parent >= 0 && kids[b.parent]) kids[b.parent].push(i);
  });
  const below = (i) => kids[i].flatMap((k) => [k, ...below(k)]);
  const textOf = (i) => [i, ...below(i)].map((k) => (shown[k] ? boxes[k].text : '')).join(' ').replace(/\s+/g, ' ').trim();
  const hint = (i) => String(boxes[i].hint || '').toLowerCase();

  // The main sections: the top boxes, stepping down through a lone wrapper (a page often has one).
  let top = boxes.map((_, i) => i).filter((i) => shown[i] && boxes[i].parent < 0);
  while (top.length === 1 && kids[top[0]].length && !boxes[top[0]].text.trim() && !boxes[top[0]].tap) top = kids[top[0]];
  top.sort((x, y) => boxes[x].rect.y - boxes[y].rect.y);

  const items = (i) => below(i).filter((k) => boxes[k].tag === 'li').length;
  const button = (i) => {
    const k = [i, ...below(i)].find((n) => boxes[n].tap && textOf(n));
    return k == null ? '' : `button ${quote(textOf(k))}`;
  };
  const what = (i) => {
    const x = boxes[i];
    const h = hint(i);
    if (x.tag === 'progress' || x.tag === 'meter' || /progress|meter|\bbar\b/.test(h)) return 'progress bar';
    if (/timeline/.test(h)) return `timeline${items(i) ? ` of ${items(i)} items` : ''}`;
    if (HEADINGS.has(x.tag)) return `heading ${quote(textOf(i))}`;
    if (PICTURES.has(x.tag)) return 'picture';
    if (x.tap) return textOf(i) ? `button ${quote(textOf(i))}` : 'button';
    if (LISTS.has(x.tag)) return `list of ${items(i)} items`;
    if (!kids[i].length) return textOf(i) ? `text ${quote(textOf(i))}` : 'empty box';
    // A container: a card when it says so or has its own background, else a group.
    const head = below(i).find((k) => HEADINGS.has(boxes[k].tag));
    const parts = [items(i) && `list of ${items(i)} items`, below(i).some((k) => PICTURES.has(boxes[k].tag)) && 'picture', button(i)].filter(Boolean);
    const name = /card|tile/.test(h) || parseColour(x.background) ? 'card' : 'group';
    const label = head != null ? ` ${quote(textOf(head))}` : textOf(i) ? ` ${quote(textOf(i))}` : '';
    return `${name}${label}${parts.length ? ` with ${parts.join(', ')}` : ''}`;
  };
  const listed = top.slice(0, MAX_SECTIONS).map(what);
  if (top.length > MAX_SECTIONS) listed.push(`and ${top.length - MAX_SECTIONS} more`);

  // Height, colours and text sizes from the visible boxes.
  const bottom = Math.max(0, ...boxes.filter((_, i) => shown[i]).map((x) => x.rect.y + x.rect.height));
  const screens = viewport.height > 0 ? Math.max(1, Math.round((bottom / viewport.height) * 10) / 10) : 1;
  const back = parseColour(viewport.background) || [255, 255, 255];
  const weight = new Map();
  boxes.forEach((x, i) => {
    if (!shown[i]) return;
    const bg = parseColour(x.background);
    if (bg && vivid(bg)) weight.set(colourName(bg), (weight.get(colourName(bg)) || 0) + area(x.rect));
    const fg = parseColour(x.color);
    const chars = x.text.trim().length;
    if (fg && vivid(fg) && chars) weight.set(colourName(fg), (weight.get(colourName(fg)) || 0) + chars * (x.fontSize || 16) ** 2);
  });
  weight.delete(colourName(back));
  const accent = [...weight].sort((p, q) => q[1] - p[1])[0]?.[0];
  const sizes = boxes.filter((x, i) => shown[i] && x.text.trim() && x.fontSize > 0).map((x) => Math.round(x.fontSize));

  const rest = [
    `${screens === 1 ? 'Fits one screen' : `About ${screens} screens tall`}.`,
    `Background ${colourName(back)}, accent ${accent || 'none'}.`,
    sizes.length ? `Text ${Math.min(...sizes)} to ${Math.max(...sizes)} px.` : 'No text.',
    `Layout check: ${fails.length ? failureText(fails) : 'passed'}`,
  ].join(' ');
  // The sections give way first, so the check verdict is always there.
  let sections = `Top to bottom: ${listed.join(', ') || 'nothing visible'}.`;
  const room = MAX_LOOK_CHARS - rest.length - 1;
  if (sections.length > room) sections = `${sections.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  const out = `${sections} ${rest}`;
  const text = out.length > MAX_LOOK_CHARS ? `${out.slice(0, MAX_LOOK_CHARS - 1)}…` : out;
  return { text, background: colourName(back), accent: accent || 'none', sections: listed };
}
