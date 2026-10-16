// Memory page: what the agent remembers on this phone, and the user's say over it.
// Four groups: facts (memory.js), what it learned from use (learn.js), kept pages (generated.js) and
// the user's own design system (style.js), with a live preview and choice buttons per field.
// Each line can be forgotten, a fact can be edited, and "Forget everything" clears all of it after
// one confirm step on the page. With the live agent connected, every change is sent as context,
// so the agent does not repeat a forgotten fact in this session.
import { recall, remember, forgetMemory, MEMORY_KEYS } from '../memory.js';
import { learned, forgetLearnedKey, forgetLearned } from '../learn.js';
import { loadSaved, removeSaved } from './generated.js';
import { live, sendContext } from '../live-agent.js';
import { styleProfile, setStyle, resetStyle, isDefaultStyle, applyStyle, ACCENTS, STYLE_FIELDS, STYLE_WORDS } from '../style.js';

const MAX_LEN = 80; // remember() cuts at the same length
const LABELS = { name: ['ชื่อ', 'Name'], likes: ['ชอบ', 'Likes'], last_task: ['งานล่าสุด', 'Last task'], note: ['โน้ต', 'Note'] };

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const button = (label, action, testid, cls = '') => {
  const el = h('button', `mem-btn ${cls}`.trim(), label);
  el.type = 'button';
  el.addEventListener('click', action);
  if (testid) el.dataset.testid = testid;
  return el;
};
// The style fields in Thai and English, and each value's words.
const STYLE_LABELS = {
  size: ['ขนาดตัวอักษร', 'Text size', { normal: ['ปกติ', 'Normal'], large: ['ใหญ่', 'Large'], xlarge: ['ใหญ่มาก', 'Extra large'] }],
  density: ['ระยะห่าง', 'Spacing', { airy: ['โล่ง', 'Airy'], normal: ['ปกติ', 'Normal'], compact: ['แน่น', 'Compact'] }],
  accent: ['สีหลัก', 'Accent', Object.fromEntries(Object.entries(ACCENTS).map(([k, a]) => [k, [a.th, a.en[0].toUpperCase() + a.en.slice(1)]]))],
  contrast: ['ความคมชัด', 'Contrast', { normal: ['ปกติ', 'Normal'], high: ['สูง', 'High'] }],
  charts: ['กราฟ', 'Charts', { ok: ['ใช้ได้', 'OK'], avoid: ['ไม่เอา', 'Avoid'] }],
};
const kept = () => Object.values(loadSaved() || {}).filter((p) => p && p.kind);

export default function mountMemory(el) {
  let editing = null; // the fact key being edited
  let confirming = false; // "Forget everything" asked once
  let refocus = null; // the testid of the style button to focus again after a redraw

  const tell = (change) => {
    if (live.connected) sendContext(`[screen] The user changed what you remember: ${change}.`);
  };

  const group = (th, en, testid, rows) => {
    const section = h('section', 'mem-group');
    section.dataset.testid = testid;
    section.append(h('h2', null, th), h('p', 'mem-en', en));
    if (rows.length) {
      const list = h('ul', 'mem-list');
      list.append(...rows);
      section.append(list);
    } else section.append(h('p', 'mem-empty', 'ยังไม่มี · Nothing yet'));
    return section;
  };

  const factRow = (key, value) => {
    const row = h('li', 'mem-row');
    row.dataset.key = key;
    const [th, en] = LABELS[key];
    const label = h('span', 'mem-label', th);
    label.append(h('small', null, en));
    if (editing === key) {
      const form = h('form', 'mem-edit');
      const input = h('input');
      input.value = value;
      input.maxLength = MAX_LEN;
      input.setAttribute('aria-label', `${en}, at most ${MAX_LEN} characters`);
      input.dataset.testid = `edit-${key}`;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const next = input.value.trim();
        remember(key, next);
        editing = null;
        tell(next ? `${LABELS[key][1].toLowerCase()} is now "${recall()[key]}"` : `forgot ${key}`);
        draw();
      });
      const actions = h('div', 'mem-actions');
      const save = button('บันทึก · Save', () => {}, `save-${key}`, 'mem-primary');
      save.type = 'submit';
      actions.append(save, button('ยกเลิก · Cancel', () => { editing = null; draw(); }, `cancel-${key}`));
      form.append(input, actions);
      row.append(label, form);
      queueMicrotask(() => input.focus());
      return row;
    }
    const actions = h('div', 'mem-actions');
    actions.append(
      button('แก้ · Edit', () => { editing = key; draw(); }, `edit-btn-${key}`),
      button('ลืม · Forget', () => { remember(key, ''); if (editing === key) editing = null; tell(`forgot ${key}`); draw(); }, `forget-${key}`),
    );
    row.append(label, h('span', 'mem-value', value), actions);
    return row;
  };

  const learnedRow = (line) => {
    const row = h('li', 'mem-row');
    row.dataset.key = line.key;
    const actions = h('div', 'mem-actions');
    actions.append(button('ลืม · Forget', () => { forgetLearnedKey(line.key); tell(`forgot the learned preference "${line.text}"`); draw(); }, `forget-learned-${line.key}`));
    row.append(h('span', 'mem-value', line.text), actions);
    return row;
  };

  const keptRow = (page) => {
    const row = h('li', 'mem-row');
    row.dataset.key = page.kind;
    const actions = h('div', 'mem-actions');
    const name = String(page.name || page.kind);
    actions.append(button('ลบ · Remove', () => { removeSaved(page.kind); tell(`removed the kept page "${name}"`); draw(); }, `remove-kept-${page.kind}`));
    row.append(h('span', 'mem-value', name), actions);
    return row;
  };

  // A mini card drawn with the profile's vars: what the next generated page will look like.
  const preview = (p) => {
    const card = applyStyle(h('div', 'style-preview'), p);
    card.dataset.testid = 'style-preview';
    card.setAttribute('aria-label', 'ตัวอย่าง · Preview');
    card.append(h('p', 'style-preview-title', 'ตัวอย่าง · Preview'), h('p', 'style-preview-text', 'ข้อความบนหน้าของคุณ · Text on your pages'));
    const bars = h('div', 'style-preview-bars');
    if (p.charts === 'ok') [60, 90, 40].forEach((v) => { const bar = h('i'); bar.style.height = `${v}%`; bars.append(bar); });
    else bars.append(h('span', null, 'ไม่มีกราฟ · No charts'));
    card.append(bars, h('span', 'style-preview-btn', 'ปุ่ม · Button'));
    return card;
  };

  const styleRow = (key, p) => {
    const [th, en, values] = STYLE_LABELS[key];
    const row = h('li', 'mem-row style-row');
    row.dataset.key = key;
    const label = h('span', 'mem-label', th);
    label.append(h('small', null, en));
    const value = h('span', 'mem-value', values[p[key]].join(' · '));
    value.dataset.testid = `style-value-${key}`;
    const choices = h('div', 'style-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', en);
    for (const v of STYLE_FIELDS[key].values) {
      const testid = `style-${key}-${v}`;
      const on = p[key] === v;
      // The chosen value carries a check mark, not only a colour.
      const choice = button(`${on ? '✓ ' : ''}${values[v][0]} · ${values[v][1]}`, () => {
        if (on) return;
        setStyle(key, v);
        refocus = testid;
        tell(`the user's style is now ${STYLE_WORDS[key][v]}`);
        draw();
      }, testid, 'style-choice');
      choice.setAttribute('aria-pressed', String(on));
      if (key === 'accent') {
        const dot = h('i', 'style-dot');
        dot.style.background = ACCENTS[v].hex;
        choice.prepend(dot);
      }
      choices.append(choice);
    }
    row.append(label, value, choices);
    return row;
  };

  const styleGroup = () => {
    const p = styleProfile();
    const section = group('สไตล์ของคุณ', 'Your style. Built on the Q-Bot design system; every page made for you uses it.', 'mem-style', Object.keys(STYLE_FIELDS).map((k) => styleRow(k, p)));
    section.querySelector('.mem-en').after(preview(p));
    const actions = h('div', 'mem-actions style-reset');
    const reset = button('กลับเป็นค่าเริ่มต้น Q-Bot · Back to Q-Bot default', () => {
      resetStyle();
      refocus = 'style-reset';
      tell("the user's style is back to the Q-Bot default");
      draw();
    }, 'style-reset');
    reset.disabled = isDefaultStyle(p);
    actions.append(reset);
    section.append(actions);
    return section;
  };

  const forgetAll = () => {
    forgetMemory();
    forgetLearned();
    resetStyle();
    for (const page of kept()) removeSaved(page.kind);
    confirming = false;
    editing = null;
    tell('forgot everything (all facts, all learned preferences, all kept pages, and the style is back to the Q-Bot default)');
    draw();
  };

  const draw = () => {
    const facts = recall();
    const lines = learned();
    const pages = kept();
    el.replaceChildren();
    const head = h('header', 'mem-head');
    head.append(h('p', 'eyebrow', 'Memory'), h('h1', 'mem-title', 'สิ่งที่ฉันจำไว้'),
      h('p', 'mem-en', 'What I remember about you. It stays on this phone; edit or forget anything.'));
    el.append(head,
      group('สิ่งที่รู้เกี่ยวกับคุณ', 'What I know about you', 'mem-facts', MEMORY_KEYS.filter((k) => facts[k]).map((k) => factRow(k, facts[k]))),
      group('สิ่งที่เรียนรู้จากการใช้งาน', 'What I learned from how you use the app', 'mem-learned', lines.map(learnedRow)),
      group('หน้าที่คุณเก็บไว้', 'Pages you kept', 'mem-kept', pages.map(keptRow)),
      styleGroup());

    const foot = h('div', 'mem-foot');
    const anything = Object.keys(facts).length || lines.length || pages.length || !isDefaultStyle();
    if (confirming) {
      const ask = h('div', 'mem-confirm');
      ask.dataset.testid = 'forget-all-confirm';
      ask.setAttribute('role', 'group');
      ask.append(h('p', null, 'ลืมทั้งหมดจริงไหม? · Forget everything? This cannot be undone.'));
      const actions = h('div', 'mem-actions');
      actions.append(button('ลืมทั้งหมด · Yes, forget all', forgetAll, 'forget-all-yes', 'mem-danger'),
        button('ยกเลิก · Cancel', () => { confirming = false; draw(); }, 'forget-all-cancel'));
      ask.append(actions);
      foot.append(ask);
    } else if (anything) {
      foot.append(button('ลืมทั้งหมด · Forget everything', () => { confirming = true; draw(); }, 'forget-all', 'mem-danger'));
    }
    el.append(foot);
    if (refocus) {
      const again = el.querySelector(`[data-testid="${refocus}"]`);
      refocus = null;
      // A disabled reset cannot take focus: the group's first choice does.
      (again && !again.disabled ? again : el.querySelector('.style-choice'))?.focus();
    }
  };

  draw();
  return {};
}
