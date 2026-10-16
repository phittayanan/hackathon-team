// Generated UI: when no prebuilt scene fits, the agent describes a screen as JSON
// built from a small fixed component set. The browser draws it with textContent only;
// no model-written HTML or JS is ever run.
//
// spec = { kind, name, match, title, subtitle?, accent, blocks: [...], proposals: [{ id, label }] }
// kind/name/match let a page the user liked be kept as a saved scene and found again.
// block types:
//   text      { text }
//   stat      { label, value }
//   progress  { label, value: 0-100 | 'auto' }   ('auto' = share of checklist items done)
//   checklist { items: [{ text, done?, due?, tag? }] }
//   list      { items: [string] }
//   card      { title, text }
//   chart     { bars: [{ label, value }] }
//   field     { label, placeholder? }
//   button    { label }
//   divider   {}
//   steps     { items: [string] }                 (numbered steps, e.g. first aid)
//   call      { label, number }                   (big tel: button; only emergency numbers)
//   image     { prompt, caption? }                (picture made by the server; at most 2 per page)
//   sources   { items: [{ title, url }] }         (web search sources, shown as links; http(s) only)
// urgency: 'none' | 'urgent' | 'serious'. Urgent pages (health, injury, emergency) show steps at once:
// no like question, no proposed changes, never kept. Serious ones always get a 1669 call button.

export const TODO_WORDS = ['todo', 'to-do', 'to do', 'checklist', 'task list', 'รายการที่ต้องทำ', 'สิ่งที่ต้องทำ', 'ทูดู', 'เช็คลิสต์', 'ลิสต์งาน'];
export const ACCENTS = ['orange', 'green', 'blue', 'purple', 'pink', 'dark'];
export const BLOCK_TYPES = ['text', 'stat', 'progress', 'checklist', 'list', 'card', 'chart', 'field', 'button', 'divider', 'steps', 'call', 'image', 'sources'];
export const MAX_IMAGES = 2;
export const URGENCY = ['none', 'urgent', 'serious'];
// Thai emergency lines: 1669 medical, 191 police, 199 fire.
export const CALL_NUMBERS = ['1669', '191', '199'];
const CALL_1669 = { type: 'call', label: 'Call 1669 (emergency medical)', number: '1669' };

const str = (v, max = 120) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
const webUrl = (v) => {
  try {
    const u = new URL(String(v));
    return ['http:', 'https:'].includes(u.protocol) ? u.href.slice(0, 400) : '';
  } catch {
    return '';
  }
};
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// The model sometimes writes a block keyed by its type, {"checklist": {...}}; turn it into {type: 'checklist', ...}.
function unkey(b) {
  if (!isObj(b) || 'type' in b) return b;
  const keys = Object.keys(b);
  return keys.length === 1 && BLOCK_TYPES.includes(keys[0]) && isObj(b[keys[0]]) ? { ...b[keys[0]], type: keys[0] } : b;
}

function cleanBlock(b) {
  b = unkey(b);
  if (!b || !BLOCK_TYPES.includes(b.type)) return null;
  switch (b.type) {
    case 'text': return { type: 'text', text: str(b.text, 300) };
    case 'stat': return { type: 'stat', label: str(b.label, 40), value: str(b.value, 24) };
    case 'progress': {
      const n = Number(b.value);
      return { type: 'progress', label: str(b.label, 40), value: b.value === 'auto' ? 'auto' : Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)) };
    }
    case 'checklist':
      return {
        type: 'checklist',
        items: arr(b.items, 12).map((i) => ({
          text: str(typeof i === 'string' ? i : i?.text, 80),
          done: Boolean(i?.done),
          ...(i?.due ? { due: str(i.due, 20) } : {}),
          ...(i?.tag ? { tag: str(i.tag, 16) } : {}),
        })).filter((i) => i.text),
      };
    case 'list': return { type: 'list', items: arr(b.items, 12).map((i) => str(i, 80)).filter(Boolean) };
    case 'card': return { type: 'card', title: str(b.title, 60), text: str(b.text, 200) };
    case 'chart':
      return { type: 'chart', bars: arr(b.bars, 8).map((x) => ({ label: str(x?.label, 16), value: Math.max(0, Number(x?.value) || 0) })) };
    case 'field': return { type: 'field', label: str(b.label, 40), placeholder: str(b.placeholder, 60) };
    case 'button': return { type: 'button', label: str(b.label, 30) };
    case 'divider': return { type: 'divider' };
    case 'image': return str(b.prompt, 200) ? { type: 'image', prompt: str(b.prompt, 200), caption: str(b.caption, 80) } : null;
    case 'sources': {
      const items = arr(b.items, 6).map((i) => ({ title: str(i?.title, 80) || str(i?.url, 80), url: webUrl(i?.url) })).filter((i) => i.url);
      return items.length ? { type: 'sources', items } : null;
    }
    case 'steps': return { type: 'steps', items: arr(b.items, 8).map((i) => str(i, 160)).filter(Boolean) };
    case 'call': {
      const number = str(b.number, 8).replace(/\D/g, '');
      return CALL_NUMBERS.includes(number) ? { type: 'call', label: str(b.label, 50) || `Call ${number}`, number } : null;
    }
  }
  return null;
}

// Keep only known components and bounded strings. Returns null if nothing usable is left.
export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  let pictures = 0;
  let blocks = arr(spec.blocks, 14).map(cleanBlock).filter(Boolean).filter((b) => b.type !== 'image' || ++pictures <= MAX_IMAGES);
  if (!blocks.length) return null;
  const urgency = URGENCY.includes(spec.urgency) ? spec.urgency : 'none';
  if (urgency === 'serious' && !blocks.some((b) => b.type === 'call' && b.number === '1669')) blocks = [CALL_1669, ...blocks];
  const kind = str(spec.kind, 24).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'page';
  const name = str(spec.name, 40) || str(spec.title, 40) || 'Page';
  return {
    kind,
    name,
    match: [...new Set([kind, name.toLowerCase(), ...arr(spec.match, 12).map((w) => str(w, 30).toLowerCase())])].filter(Boolean),
    applied: arr(spec.applied, 10).map((x) => str(x, 20)),
    title: str(spec.title, 60) || 'For you',
    subtitle: str(spec.subtitle, 80),
    accent: ACCENTS.includes(spec.accent) ? spec.accent : 'orange',
    blocks,
    urgency,
    proposals: urgency !== 'none' ? [] : arr(spec.proposals, 2).map((p, i) => ({ id: str(p?.id, 20) || `p${i}`, label: str(p?.label ?? p, 40) })).filter((p) => p.label),
  };
}

// ---------- Page summary for the live agent ----------

export const SUMMARY_MAX = 600;
const doneShare = (spec) => {
  const items = spec.blocks.filter((b) => b.type === 'checklist').flatMap((b) => b.items);
  return items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0;
};
const numbered = (items) => items.map((t, n) => `${n + 1}. ${t}`).join('; ');

function blockSummary(b, spec) {
  switch (b.type) {
    case 'text': return `Text: ${b.text}`;
    case 'stat': return `Stat: ${b.label} ${b.value}`;
    case 'progress': return `Progress: ${b.label} ${b.value === 'auto' ? doneShare(spec) : b.value}%`;
    case 'checklist':
      return `Checklist: ${numbered(b.items.map((i) => {
        const notes = [i.done ? 'done' : 'not done', i.due && `due ${i.due}`, i.tag && `tag ${i.tag}`].filter(Boolean);
        return `${i.text} (${notes.join(', ')})`;
      }))}`;
    case 'list': return `List: ${numbered(b.items)}`;
    case 'card': return `Card "${b.title}": ${b.text}`;
    case 'chart': return `Chart: ${b.bars.map((x) => `${x.label} ${x.value}`).join(', ')}`;
    case 'field': return `Field: ${b.label}`;
    case 'button': return `Button: ${b.label}`;
    case 'steps': return `Steps: ${numbered(b.items)}`;
    case 'call': return `Call button: ${b.label} (${b.number})`;
    case 'image': return `Picture${b.caption ? `: ${b.caption}` : ''}`;
    case 'sources': return `Sources: ${b.items.map((i) => i.title).join(', ')}`;
  }
  return '';
}

// What a validated spec shows, as short plain text for the live agent: the title, then each block
// with its items, done state and numbers. At most SUMMARY_MAX characters, cut with an ellipsis.
export function pageSummary(spec) {
  if (!spec?.blocks) return '';
  const head = `"${spec.title}"${spec.subtitle ? ` (${spec.subtitle})` : ''}`;
  const text = [head, ...spec.blocks.map((b) => blockSummary(b, spec)).filter(Boolean)].join('. ');
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

// The silent update the live agent gets when the user changes the open page by hand.
export const changeNote = (change, spec) => `[screen] The user changed the page: ${change}. Page now shows: ${pageSummary(spec)}`;

// A toggle on a model-written page: set done on the checklist item whose text the toggle shows
// (the longest match wins). Returns the new spec and that item, or the same spec and null.
export function markDone(spec, shownText, done) {
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const shown = norm(shownText);
  let best = null;
  spec.blocks.forEach((b, bi) => {
    if (b.type !== 'checklist') return;
    b.items.forEach((i, ii) => {
      const t = norm(i.text);
      if (t && shown.includes(t) && (!best || t.length > best.len)) best = { bi, ii, len: t.length };
    });
  });
  if (!best) return { spec, item: null };
  const blocks = spec.blocks.map((b, bi) => (bi !== best.bi ? b : { ...b, items: b.items.map((i, ii) => (ii === best.ii ? { ...i, done } : i)) }));
  return { spec: { ...spec, blocks }, item: blocks[best.bi].items[best.ii] };
}

// ---------- No-key fallback: one canned todo spec and keyword revisions ----------

const DUE = ['Today', 'Today', 'Tomorrow', 'Fri', 'Fri'];
const TAGS = ['High', 'High', 'Medium', 'Low', 'Medium'];

const REVISIONS = {
  due: {
    label: 'Add due dates',
    words: ['due', 'date', 'deadline', 'วันกำหนด', 'กำหนดส่ง', 'วันที่', 'เดดไลน์'],
    apply: (s) => eachChecklist(s, (items) => items.map((it, i) => ({ ...it, due: DUE[i % DUE.length] }))),
  },
  progress: {
    label: 'Add a progress bar',
    words: ['progress', 'bar', 'ความคืบหน้า', 'แถบ', 'หลอด'],
    apply: (s) => (s.blocks.some((b) => b.type === 'progress') ? s : { ...s, blocks: [{ type: 'progress', label: 'Done', value: 'auto' }, ...s.blocks] }),
  },
  priority: {
    label: 'Mark priorities',
    words: ['priorit', 'important', 'urgent', 'สำคัญ', 'ด่วน', 'ลำดับ'],
    apply: (s) => eachChecklist(s, (items) => items.map((it, i) => ({ ...it, tag: TAGS[i % TAGS.length] }))),
  },
  dark: {
    label: 'Switch to dark mode',
    words: ['dark', 'night', 'black', 'มืด', 'ดำ', 'กลางคืน'],
    apply: (s) => ({ ...s, accent: 'dark' }),
  },
};
const POOL = Object.keys(REVISIONS);

function eachChecklist(spec, fn) {
  return { ...spec, blocks: spec.blocks.map((b) => (b.type === 'checklist' ? { ...b, items: fn(b.items) } : b)) };
}

function nextProposals(spec, used) {
  return POOL.filter((id) => !used.includes(id)).slice(0, 2).map((id) => ({ id, label: REVISIONS[id].label }));
}

export function cannedTodo() {
  return {
    kind: 'todo',
    name: 'To-do list',
    match: TODO_WORDS,
    title: 'To-do list',
    subtitle: 'Made for you just now',
    accent: 'orange',
    blocks: [
      {
        type: 'checklist',
        items: [
          { text: 'Finish the demo slides' },
          { text: 'Rehearse the 3-minute pitch' },
          { text: 'Charge phone and mic' },
          { text: 'Buy snacks for the team' },
          { text: 'Submit the project link' },
        ],
      },
      { type: 'button', label: 'Looks good' },
    ],
    proposals: nextProposals(null, []),
    applied: [],
  };
}

const has = (text, words) => words.some((w) => text.includes(w));
const LIKE = ['like it', 'love it', 'perfect', 'looks good', 'great', 'done', 'that\'s it', 'ชอบ', 'ดีแล้ว', 'เยี่ยม', 'เสร็จ', 'พอแล้ว', 'โอเคแล้ว'];
const DISLIKE = ['ไม่ชอบ', "don't like", 'do not like', 'hate'];
const YES = ['yes', 'ok', 'okay', 'sure', 'both', 'เอา', 'ได้', 'ใช่', 'ทั้งคู่', 'ทั้งสอง', 'จัดไป'];
const BOTH = ['both', 'ทั้งคู่', 'ทั้งสอง', 'all'];
// "add X" anywhere, also after a like: "ชอบ แต่ขอเพิ่มรายการออกกำลังกาย".
const ADD = /(?:\badd\b|เพิ่ม)\s*(?:an?\s+|items?\s+|รายการ\s*)?(.+)$/i;

// Revise a spec from what the user said, without a model.
// Returns { action: 'revise', spec } | { action: 'accept' } | { action: 'ask' }.
export function reviseByKeywords(spec, rawText) {
  const text = String(rawText || '').toLowerCase().trim();
  const used = spec.applied || [];
  if (has(text, DISLIKE)) return { action: 'ask' };

  let ids = POOL.filter((id) => has(text, REVISIONS[id].words));
  if (!ids.length && has(text, YES) && !has(text, LIKE)) {
    ids = (has(text, BOTH) ? spec.proposals : spec.proposals.slice(0, 1)).map((p) => p.id).filter((id) => REVISIONS[id]);
  }
  const added = String(rawText || '').trim().match(ADD);
  if (!ids.length && !added && has(text, LIKE)) return { action: 'accept' };

  let next = spec;
  for (const id of ids) next = REVISIONS[id].apply(next);

  if (!ids.length && added) {
    next = eachChecklist(next, (items) => [...items, { text: added[1].slice(0, 80) }]);
    ids = ['add'];
  }
  if (!ids.length) return { action: 'ask' };

  const applied = [...used, ...ids];
  return { action: 'revise', spec: { ...next, applied, proposals: nextProposals(next, applied) } };
}

// ---------- Urgent requests: first aid at once ----------

export const URGENT_WORDS = ['เลือด', 'เจ็บ', 'ล้ม', 'bleeding', 'blood', 'hurt', 'injur'];

export function cannedFirstAid() {
  return {
    kind: 'first-aid',
    name: 'First aid',
    match: [],
    urgency: 'urgent',
    title: 'Bleeding finger: first aid',
    subtitle: 'Do these now',
    accent: 'pink',
    blocks: [
      {
        type: 'steps',
        items: [
          'กดแผลให้แน่นด้วยผ้าสะอาด 10 นาที ห้ามเปิดดู',
          'ยกมือให้สูงกว่าระดับหัวใจ',
          'เลือดหยุดแล้ว ล้างแผลด้วยน้ำสะอาด',
          'ปิดแผลด้วยพลาสเตอร์หรือผ้าก๊อซ',
        ],
      },
      { type: 'card', title: 'โทร 1669 ทันทีถ้า', text: 'เลือดไม่หยุดใน 10 นาที · แผลลึกหรือกว้าง · เลือดพุ่ง · นิ้วชาหรือขยับไม่ได้' },
      CALL_1669,
    ],
    proposals: [],
  };
}
