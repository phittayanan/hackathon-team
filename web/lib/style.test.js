import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { styleProfile, setStyle, resetStyle, styleText, styleVars, isDefaultStyle, STYLE_DEFAULT, STYLE_FIELDS, ACCENTS } from '../public/js/style.js';

beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
});

test('a new profile is the Q-Bot default', () => {
  assert.deepEqual(styleProfile(), { size: 'normal', density: 'normal', accent: 'lavender', contrast: 'normal', charts: 'ok' });
  assert.equal(isDefaultStyle(), true);
  assert.equal(styleText(), 'Q-Bot defaults; base: Q-Bot glass design system');
  assert.equal(styleVars()['--st-accent'], '#7655aa');
  assert.equal(styleVars()['--st-body'], '16px');
});

test('setStyle keeps a value inside its set and rejects anything else', () => {
  assert.equal(setStyle('size', 'large'), true);
  assert.equal(setStyle('size', 'huge'), false);
  assert.equal(setStyle('accent', 'neon'), false);
  assert.equal(setStyle('font', 'comic'), false);
  assert.equal(setStyle('__proto__', 'x'), false);
  assert.equal(styleProfile().size, 'large');
  assert.equal(JSON.parse(localStorage.getItem('agentos.style')).size, 'large');
});

test('styleText names only what differs from the base', () => {
  setStyle('size', 'large');
  setStyle('density', 'airy');
  setStyle('accent', 'teal');
  setStyle('charts', 'avoid');
  assert.equal(styleText(), 'large text, airy spacing, teal accent, avoid charts; base: Q-Bot glass design system');
  assert.ok(styleText().length <= 200);
  assert.equal(isDefaultStyle(), false);
});

test('styleVars follow each field', () => {
  setStyle('size', 'xlarge');
  setStyle('density', 'compact');
  setStyle('contrast', 'high');
  setStyle('accent', 'rose');
  const v = styleVars();
  assert.equal(v['--st-body'], '20px');
  assert.equal(v['--st-scale'], '1.25');
  assert.equal(v['--st-gap'], '6px');
  assert.equal(v['--st-accent'], ACCENTS.rose.hex);
  assert.equal(v['--st-dim'], '1');
  assert.equal(styleVars({ ...STYLE_DEFAULT, size: 'large' })['--st-body'], '18px');
});

test('a broken or tampered store reads as the default; reset clears it', () => {
  localStorage.setItem('agentos.style', '{"size":"giant","accent":"teal"');
  assert.deepEqual(styleProfile(), STYLE_DEFAULT);
  localStorage.setItem('agentos.style', JSON.stringify({ size: 'giant', accent: 'teal' }));
  assert.deepEqual(styleProfile(), { ...STYLE_DEFAULT, accent: 'teal' });
  resetStyle();
  assert.equal(localStorage.getItem('agentos.style'), null);
  assert.deepEqual(styleProfile(), STYLE_DEFAULT);
});

test('blocked storage: the default, and no throw', () => {
  const fail = () => { throw new Error('blocked'); };
  globalThis.localStorage = { getItem: fail, setItem: fail, removeItem: fail };
  assert.deepEqual(styleProfile(), STYLE_DEFAULT);
  assert.equal(setStyle('size', 'large'), true);
  assert.doesNotThrow(() => resetStyle());
  delete globalThis.localStorage;
  assert.deepEqual(styleProfile(), STYLE_DEFAULT);
});

// WCAG relative luminance contrast.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('every accent keeps AA contrast with white text and on the Q-Bot pale glass', () => {
  assert.deepEqual(STYLE_FIELDS.accent.values, Object.keys(ACCENTS));
  for (const [name, a] of Object.entries(ACCENTS)) {
    assert.ok(ratio(a.hex, '#ffffff') >= 4.5, `${name} on white`);
    assert.ok(ratio(a.hex, '#f5f2ff') >= 4.5, `${name} on #f5f2ff`);
    assert.ok(a.th && a.en, `${name} has Thai and English names`);
  }
});
