// Versions of the open generated page, so the live agent and the page writer can point at an earlier
// one while changing the current page ("the colours of the first one, this layout"). Going back is not
// the goal: an earlier version is a reference for the next change. Kept in memory for the open page
// only (scenes/generated.js); pure code, so Node tests run it too.
//
// A version: { v, brief, accent, view, look, palette }
//   v: 1, 2, 3...; brief: the design brief it was drawn from ('' for none); accent: the spec's accent
//   view: 'pending' (designed page being written), 'html' (designed page shown), 'blocks' (simple page)
//   look: { background, accent, sections } from page-look.js describeLook, once the designed page painted
//   palette: the designed page's most used colours, '#rrggbb', most used first
import { parseColour } from './page-look.js';

export const MAX_VERSIONS = 5;
export const MAX_HISTORY_CHARS = 700;
const MAX_PALETTE = 5;

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const hex = (rgb) => `#${rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;

// The most used colours in a page's HTML (style blocks and style attributes), as '#rrggbb'.
// '&#123;' is a character reference, not a colour; 8-digit hex (with alpha) is skipped.
export function paletteOf(html) {
  const counts = new Map();
  for (const m of String(html || '').matchAll(/(?<!&)#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])|rgba?\([^)]*\)/gi)) {
    const rgb = parseColour(m[0]);
    if (!rgb) continue;
    const key = hex(rgb);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_PALETTE).map(([c]) => c);
}

// Add a version; the newest MAX_VERSIONS are kept.
export function addVersion(list, { brief = '', accent = '', view = 'blocks' } = {}) {
  const v = (list.at(-1)?.v || 0) + 1;
  return [...list, { v, brief: clip(brief, 600), accent, view, look: null, palette: [] }].slice(-MAX_VERSIONS);
}

// How one version looked, in a few words; '' while it is not known.
export function lookText(version) {
  if (!version) return '';
  if (version.view === 'html' && version.look) {
    const colours = version.palette.length ? `, colours ${version.palette.join(' ')}` : '';
    const layout = version.look.sections.length ? `${clip(version.look.sections.join(', '), 120)}; ` : '';
    return `${layout}background ${version.look.background}, accent ${version.look.accent}${colours}`;
  }
  if (version.view === 'pending') return 'designed page still being written';
  return `simple block page, accent ${version.accent || 'orange'}`;
}

// What the page writer gets about a version: its look, palette and brief. null when nothing is known.
export function referenceOf(version) {
  if (!version || version.view !== 'html' || !version.look) return null;
  return { v: version.v, look: lookText(version), palette: version.palette, brief: version.brief };
}

// The line for the live agent: every kept version, the newest one on screen now.
export function historyText(list) {
  if (!list?.length) return '';
  const now = list.at(-1).v;
  const parts = list.map((x) => {
    const brief = x.brief ? ` from "${clip(x.brief, 70)}"` : '';
    return `v${x.v}${x.v === now ? ' (on screen now)' : ''}${brief}: ${lookText(x)}`;
  });
  // The oldest versions give way first, so the one on screen is always there.
  const line = () => `Versions of this page: ${parts.join('; ')}.`;
  while (line().length > MAX_HISTORY_CHARS && parts.length > 1) parts.shift();
  const out = line();
  return out.length > MAX_HISTORY_CHARS ? `${out.slice(0, MAX_HISTORY_CHARS - 1)}…` : out;
}
