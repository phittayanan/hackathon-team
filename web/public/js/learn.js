// The agent learns from how it is used: short preferences kept on this phone (localStorage),
// from signals the demo already has. A page revised (what changed), a page kept, proposals the
// user passed over, and updates the agent spoke first about that the user dismissed or used.
// The live agent gets them as {{learned}} at session start and builds the next page with them.
// Capped (newest 6), each line short; `?forget=1` or the remember tool's forget_all resets.
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

// What a revise changed, as short preferences: [{ key, text }].
export function reviseLessons(before, after) {
  if (!before || !after) return [];
  const kind = kindOf(after);
  const name = pageName(after);
  const out = [];
  const was = types(before);
  const now = types(after);
  for (const t of now) if (!was.has(t) && BLOCKS[t]) out.push({ key: `${kind}:+${t}`, text: `${name} pages: add ${BLOCKS[t]}` });
  for (const t of was) if (!now.has(t) && BLOCKS[t]) out.push({ key: `${kind}:-${t}`, text: `${name} pages: leave out ${BLOCKS[t]}` });
  if (!uses(before, 'due') && uses(after, 'due')) out.push({ key: `${kind}:due`, text: `${name} pages: give checklist items due dates` });
  if (!uses(before, 'tag') && uses(after, 'tag')) out.push({ key: `${kind}:tag`, text: `${name} pages: tag checklist items` });
  if (after.accent && before.accent !== after.accent) out.push({ key: `${kind}:accent`, text: `${name} pages: ${after.accent} colour` });
  return out;
}

export function noteRevise(before, after) {
  return reviseLessons(before, after).map(({ key, text }) => learn(key, text));
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
  try {
    globalThis.localStorage?.removeItem('agentos.memory');
  } catch { /* nothing to forget */ }
  return true;
}
