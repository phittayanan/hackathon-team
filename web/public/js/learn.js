// The agent learns from how it is used: short preferences kept on this phone (localStorage),
// from signals the demo already has. A page revised (what changed), a page kept, proposals the
// user passed over, and updates the agent spoke first about that the user dismissed or used.
// The live agent gets them as {{learned}} at session start and builds the next page with them.
// Capped (newest 6), each line short; `?forget=1` or the remember tool's forget_all resets.
import { styleProfile, setStyle, resetStyle, STYLE_FIELDS, STYLE_WORDS } from './style.js';
import { forgetLessons } from './lessons.js';

const KEY = 'agentos.learned';
export const MAX_LEARNED = 6;
const MAX_LEN = 90;

// Plain words for the block types of a generated page.
const BLOCKS = {
  text: 'a note', stat: 'numbers', progress: 'a progress bar', checklist: 'a checklist', list: 'a list',
  card: 'a card', chart: 'a chart', field: 'an input field', button: 'a button', steps: 'steps', image: 'a picture',
};

function load() {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]');
    return Array.isArray(all) ? all.filter((l) => l && typeof l.key === 'string' && typeof l.text === 'string') : [];
  } catch {
    return [];
  }
}

function save(all) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch { /* storage blocked: nothing is learned this visit */ }
}

export const learned = () => load();

// Add or strengthen one preference; the newest MAX_LEARNED are kept.
export function learn(key, text) {
  if (!key || !text) return null;
  const all = load();
  const old = all.find((l) => l.key === key);
  const entry = { key, text: String(text).slice(0, MAX_LEN), n: (old?.n || 0) + 1, at: Date.now() };
  const next = [entry, ...all.filter((l) => l.key !== key)].slice(0, MAX_LEARNED);
  save(next);
  return entry;
}

export function forgetLearned() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch { /* nothing to forget */ }
}

// Forget one preference (the memory page). Returns false when there was no such line.
export function forgetLearnedKey(key) {
  const all = load();
  const next = all.filter((l) => l.key !== key);
  if (next.length === all.length) return false;
  save(next);
  return true;
}

// The {{learned}} text: one line per preference, newest first, "(2x)" when seen again.
export function learnedText(all = load()) {
  return all.length ? all.map((l) => `${l.text}${l.n > 1 ? ` (${l.n}x)` : ''}`).join('; ') : 'nothing yet';
}

// Lessons name the kind of page (todo, packing), so they carry over to the next page like it.
const pageName = (spec) => String(spec?.kind || spec?.name || 'generated').toLowerCase().slice(0, 30);
const kindOf = (spec) => String(spec?.kind || spec?.name || 'page').toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').slice(0, 30);
const types = (spec) => new Set((spec?.blocks || []).map((b) => b.type));
const items = (spec) => (spec?.blocks || []).filter((b) => b.type === 'checklist').flatMap((b) => b.items || []);
// Every checklist item has the field (a revise "give each task a due date" makes it so).
const uses = (spec, field) => items(spec).length > 0 && items(spec).every((i) => i[field]);

// Words that name each change, Thai and English, so a revise saves only what the user asked for.
// Thai words that sit inside common words are guarded ("รูปแบบ" is "format", not "a picture").
const BLOCK_WORDS = {
  text: /\bnotes?\b|\btext\b|ข้อความ|โน้ต/i,
  stat: /numbers?|\bstats?\b|statistic|ตัวเลข|สถิติ/i,
  progress: /progress|ความคืบหน้า|หลอด|แถบ/i,
  checklist: /check ?list|checkbox|เช็[คก]ลิสต์|ติ๊ก/i,
  list: /(?<!check ?)\blists?\b|รายการ/i,
  card: /\bcards?\b|การ์ด/i,
  chart: /chart|graph|กราฟ|แผนภูมิ/i,
  field: /\bfields?\b|\binput|ช่องกรอก|ช่องใส่/i,
  button: /button|ปุ่ม/i,
  steps: /\bsteps?\b|ขั้นตอน/i,
  image: /image|picture|photo|รูปภาพ|รูป(?!แบบ)/i,
};
const DUE_WORDS = /\bdue\b|deadline|\bdates?\b|กำหนดส่ง|ครบกำหนด|เดดไลน์|วันที่/i;
const TAG_WORDS = /\btags?\b|\blabels?\b|แท็ก|ป้าย/i;

// What a revise changed, as short preferences: [{ key, text }]. Only the changes the user's words
// (wish) name: the agent's own extras ("make it prettier" -> an orange accent and a progress bar)
// are not the user's preferences.
export function reviseLessons(before, after, wish = '') {
  if (!before || !after) return [];
  const said = String(wish || '');
  if (!said.trim()) return [];
  const kind = kindOf(after);
  const name = pageName(after);
  const out = [];
  const was = types(before);
  const now = types(after);
  const named = (t) => BLOCKS[t] && BLOCK_WORDS[t]?.test(said);
  for (const t of now) if (!was.has(t) && named(t)) out.push({ key: `${kind}:+${t}`, text: `${name} pages: add ${BLOCKS[t]}` });
  for (const t of was) if (!now.has(t) && named(t)) out.push({ key: `${kind}:-${t}`, text: `${name} pages: leave out ${BLOCKS[t]}` });
  if (!uses(before, 'due') && uses(after, 'due') && DUE_WORDS.test(said)) out.push({ key: `${kind}:due`, text: `${name} pages: give checklist items due dates` });
  if (!uses(before, 'tag') && uses(after, 'tag') && TAG_WORDS.test(said)) out.push({ key: `${kind}:tag`, text: `${name} pages: tag checklist items` });
  if (after.accent && before.accent !== after.accent && SPEC_ACCENT_WORDS[after.accent]?.test(said)) out.push({ key: `${kind}:accent`, text: `${name} pages: ${after.accent} colour` });
  return out;
}

// What the user last said or typed, so a revise can read the wish behind it (the agent's revise_ui
// call carries only the new spec). A wish older than a minute is not this revise's.
let heard = { text: '', at: 0 };
export const noteHeard = (text, now = Date.now()) => { heard = { text: String(text || '').slice(0, 300), at: now }; };
export const heardWish = (now = Date.now()) => (now - heard.at <= 60000 ? heard.text : '');

// Plain revise wishes -> the user's design system (style.js). Thai and English words; "too big" is
// read before "big". Size and density step one level; colour and contrast are set.
const WISHES = [
  ['size', -1, /ใหญ่ไป|ใหญ่เกิน|too (big|large)/i],
  ['size', 1, /เล็กไป|เล็กเกิน|too small|tiny/i],
  ['size', 1, /ใหญ่|bigger|larger|enlarge/i],
  ['size', -1, /เล็ก(?!น้อย)|smaller/i], // "เล็กน้อย" is "a little", not "small"
  ['density', -1, /โล่ง|ไม่รก|รกไป|รกเกิน|น้อยลง|simpler|simple|less (on|stuff|clutter)|cluttered/i], // not a bare "รก": "แรก"
  ['density', 1, /แน่น|ละเอียด|more detail|compact/i],
];
const CONTRAST_WORDS = /ชัด|อ่านยาก|contrast|hard to read/i;
// Teal before blue and green: "เขียวอมฟ้า" holds both. Blue needs "สีฟ้า": a bare "ฟ้า" is in "ไฟฟ้า".
const ACCENT_WORDS = [
  ['teal', /teal|turquoise|เขียวอมฟ้า/i],
  ['lavender', /lavender|purple|violet|ม่วง/i],
  ['rose', /rose|pink|ชมพู/i],
  ['blue', /blue|น้ำเงิน|สีฟ้า/i],
  ['green', /green|เขียว/i],
];
// The page accents (genui.js) and the words that name them: the style accents above where they
// match, plus orange and dark. "สีส้ม", not a bare "ส้ม" (som tam).
const accentWords = (style) => ACCENT_WORDS.find(([k]) => k === style)[1];
const SPEC_ACCENT_WORDS = {
  orange: /orange|สีส้ม/i,
  green: accentWords('green'),
  blue: accentWords('blue'),
  purple: accentWords('lavender'),
  pink: accentWords('rose'),
  dark: /\bdark\b|black|สีดำ|สีเข้ม|โทนมืด/i,
};

const step = (key, value, by) => {
  const values = STYLE_FIELDS[key].values;
  return values[Math.max(0, Math.min(values.length - 1, values.indexOf(value) + by))];
};

// Style changes a revise asks for: [{ key, value }], only those that change the profile.
export function styleChanges(before, after, wish = '', profile = styleProfile()) {
  const next = { ...profile };
  const text = String(wish || '');
  for (const key of ['size', 'density']) {
    const hit = WISHES.find(([k, , re]) => k === key && re.test(text));
    if (hit) next[key] = step(key, profile[key], hit[1]);
  }
  const accent = ACCENT_WORDS.find(([, re]) => re.test(text));
  if (accent) next.accent = accent[0];
  if (CONTRAST_WORDS.test(text)) next.contrast = 'high';
  // Charts only when the user's words name them, as for reviseLessons.
  if (before && after && BLOCK_WORDS.chart.test(text)) {
    if (types(before).has('chart') && !types(after).has('chart')) next.charts = 'avoid';
    else if (!types(before).has('chart') && types(after).has('chart')) next.charts = 'ok';
  }
  return Object.keys(STYLE_FIELDS).filter((k) => next[k] !== profile[k]).map((k) => ({ key: k, value: next[k] }));
}

// Apply them to the profile, each with one learned line ("style: large text") for {{learned}}.
export function noteStyle(before, after, wish = heardWish()) {
  return styleChanges(before, after, wish).map(({ key, value }) => {
    setStyle(key, value);
    return learn(`style:${key}`, `style: ${STYLE_WORDS[key][value]}`);
  });
}

export function noteRevise(before, after, wish = heardWish()) {
  return [...reviseLessons(before, after, wish).map(({ key, text }) => learn(key, text)), ...noteStyle(before, after, wish)];
}

export const noteKeep = (spec) => learn(`${kindOf(spec)}:kept`, `liked and kept the ${pageName(spec)} page layout`);

// Proposals offered on a page and not taken before it closed or was kept.
export function noteIgnored(spec, proposals) {
  const labels = (proposals || []).map((p) => p.label).filter(Boolean).slice(0, 2);
  if (!labels.length) return null;
  return learn(`${kindOf(spec)}:ignored`, `did not want "${labels.join('" or "')}" on ${pageName(spec)} pages`);
}

// An update the agent spoke first about: used (the scene stayed open and was acted on) or dismissed.
export function noteProactive(scene, used) {
  return used
    ? learn(`feed:${scene}`, `${scene} updates: the user acts on them, speak up`)
    : learn(`feed:${scene}`, `${scene} updates: the user closed one at once, speak only if urgent`);
}

// Updates the agent spoke first about. app.js notes each feed update sent to the agent; a scene the
// agent opens within 30 s of one is proactive. When it folds home: used if it moved on to another
// scene or stayed open 8 s or more, dismissed if the user closed it sooner.
let feedAt = 0;
let proactive = null;
export const noteFeed = (now = Date.now()) => { feedAt = now; };
export function agentOpened(scene, now = Date.now()) {
  if (!feedAt || now - feedAt > 30000) return false;
  feedAt = 0;
  proactive = { scene, at: now, moved: false };
  return true;
}
export const proactiveWatch = {
  sceneChanged(from, to, now = Date.now()) {
    if (!proactive) return;
    if (to !== 'home') {
      if (from && from !== 'home') proactive.moved = true;
      return;
    }
    noteProactive(proactive.scene, proactive.moved || now - proactive.at >= 8000);
    proactive = null;
  },
};

// Reset on ?forget=1 (judges and the team can start clean).
export function forgetOnRequest(search = globalThis.location?.search || '') {
  if (!new URLSearchParams(search).has('forget')) return false;
  forgetLearned();
  forgetLessons();
  resetStyle();
  try {
    globalThis.localStorage?.removeItem('agentos.memory');
  } catch { /* nothing to forget */ }
  return true;
}
