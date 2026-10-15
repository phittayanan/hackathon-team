// The user's own design system: a small style profile kept on this phone (localStorage), built on
// the Q-Bot base (docs/qbot-design-system.md). Every field has a fixed set of values and a Q-Bot
// default, so a personal style can only move inside the base system. The block page applies it as
// CSS custom properties (styleVars); the page model gets it as one line (styleText).
// It is learned from revises (learn.js) and changed by hand on the memory page.
const KEY = 'agentos.style';

// Accents keep at least 4.5:1 with white text and on the Q-Bot pale glass (#f5f2ff); see style.test.js.
export const ACCENTS = {
  lavender: { hex: '#7655aa', th: 'ม่วงลาเวนเดอร์', en: 'lavender' },
  teal: { hex: '#0f766e', th: 'เขียวอมฟ้า', en: 'teal' },
  blue: { hex: '#1d4ed8', th: 'น้ำเงิน', en: 'blue' },
  rose: { hex: '#be185d', th: 'ชมพูกุหลาบ', en: 'rose' },
  green: { hex: '#15803d', th: 'เขียว', en: 'green' },
};

// Each field: allowed values in order (smallest or lightest first) and the Q-Bot default.
export const STYLE_FIELDS = {
  size: { values: ['normal', 'large', 'xlarge'], fallback: 'normal' },
  density: { values: ['airy', 'normal', 'compact'], fallback: 'normal' },
  accent: { values: Object.keys(ACCENTS), fallback: 'lavender' },
  contrast: { values: ['normal', 'high'], fallback: 'normal' },
  charts: { values: ['ok', 'avoid'], fallback: 'ok' },
};

export const STYLE_DEFAULT = Object.freeze(Object.fromEntries(Object.entries(STYLE_FIELDS).map(([k, f]) => [k, f.fallback])));

// Short English words for the page writer and the learned lines.
export const STYLE_WORDS = {
  size: { normal: 'normal text', large: 'large text', xlarge: 'extra large text' },
  density: { airy: 'airy spacing', normal: 'normal spacing', compact: 'compact spacing' },
  accent: Object.fromEntries(Object.entries(ACCENTS).map(([k, a]) => [k, `${a.en} accent`])),
  contrast: { normal: 'normal contrast', high: 'high contrast' },
  charts: { ok: 'charts are fine', avoid: 'avoid charts' },
};

// No storage (private window, blocked site data, Node tests): the Q-Bot default.
function load() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function save(profile) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(profile));
  } catch { /* storage blocked: the change holds for this page only */ }
}

// The profile with every field valid: an unknown or missing value is the Q-Bot default.
export function styleProfile() {
  const raw = load();
  return Object.fromEntries(Object.entries(STYLE_FIELDS).map(([k, f]) => [k, f.values.includes(raw[k]) ? raw[k] : f.fallback]));
}

// Set one field. Returns false (and changes nothing) for an unknown field or a value outside its set.
export function setStyle(key, value) {
  if (!Object.hasOwn(STYLE_FIELDS, key) || !STYLE_FIELDS[key].values.includes(value)) return false;
  save({ ...styleProfile(), [key]: value });
  return true;
}

export function resetStyle() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch { /* nothing to reset */ }
}

export const isDefaultStyle = (p = styleProfile()) => Object.keys(STYLE_FIELDS).every((k) => p[k] === STYLE_DEFAULT[k]);

// One short line for the page writer, for example
// "large text, airy spacing, teal accent, avoid charts; base: Q-Bot glass design system".
// Only the fields that differ from the base are named.
export function styleText(p = styleProfile()) {
  const parts = Object.keys(STYLE_FIELDS).filter((k) => p[k] !== STYLE_DEFAULT[k]).map((k) => STYLE_WORDS[k][p[k]]);
  return `${parts.length ? parts.join(', ') : 'Q-Bot defaults'}; base: Q-Bot glass design system`;
}

const SIZE = { normal: [16, 1], large: [18, 1.125], xlarge: [20, 1.25] };
const DENSITY = { airy: [16, 18], normal: [10, 12], compact: [6, 8] }; // [gap, padding] in px, on the 4 px rhythm or close to it
const CONTRAST = {
  normal: { ink: '#21183b', ink2: '#6c6385', dim: '0.7', line: 'rgba(127, 127, 127, .25)' },
  high: { ink: '#0d0820', ink2: '#2f2748', dim: '1', line: '#4b4366' },
};

// CSS custom properties for a root element: { '--st-body': '18px', ... }.
export function styleVars(p = styleProfile()) {
  const [body, scale] = SIZE[p.size];
  const [gap, pad] = DENSITY[p.density];
  const c = CONTRAST[p.contrast];
  return {
    '--st-body': `${body}px`,
    '--st-scale': String(scale),
    '--st-gap': `${gap}px`,
    '--st-pad': `${pad}px`,
    '--st-accent': ACCENTS[p.accent].hex,
    '--st-ink': c.ink,
    '--st-ink-2': c.ink2,
    '--st-dim': c.dim,
    '--st-line': c.line,
  };
}

// Put the vars on an element (the block page root, the memory page preview). data-style-accent is
// "own" only when the user picked an accent; with the base accent a page keeps the colour it was given.
export function applyStyle(el, p = styleProfile()) {
  for (const [k, v] of Object.entries(styleVars(p))) el.style.setProperty(k, v);
  el.dataset.styleAccent = p.accent === STYLE_DEFAULT.accent ? 'base' : 'own';
  el.dataset.styleContrast = p.contrast;
  return el;
}
