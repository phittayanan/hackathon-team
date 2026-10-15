// Small memory across visits: a few facts about the user, kept on this phone (localStorage).
// The live agent gets them as {{memory}} at session start, saves new ones with the `remember`
// tool, and the last task is saved by itself when a tool opens a page.
import { learnedText } from './learn.js';

const KEY = 'agentos.memory';
export const MEMORY_KEYS = ['name', 'likes', 'last_task', 'note'];
const MAX_LEN = 80;
const LABELS = { name: 'name', likes: 'likes', last_task: 'last task', note: 'note' };

// No storage (private window, blocked site data, Node tests): memory is just empty.
function load() {
  try {
    const facts = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
    return facts && typeof facts === 'object' ? facts : {};
  } catch {
    return {};
  }
}

export function recall() {
  const facts = load();
  return Object.fromEntries(MEMORY_KEYS.filter((k) => typeof facts[k] === 'string' && facts[k]).map((k) => [k, facts[k]]));
}

// Save one fact; an empty value forgets it. Returns false for an unknown key.
export function remember(key, value) {
  if (!MEMORY_KEYS.includes(key)) return false;
  const facts = recall();
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  if (text) facts[key] = text;
  else delete facts[key];
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(facts));
  } catch { /* storage blocked: this visit still works, it just will not remember */ }
  return true;
}

export const hasMemory = () => Object.keys(recall()).length > 0;

export function forgetMemory() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch { /* nothing to forget */ }
}

// The {{memory}} text for the agent prompt, for example "name: Ploy; likes: running; last task: ...".
export function memoryText(facts = recall()) {
  const parts = MEMORY_KEYS.filter((k) => facts[k]).map((k) => `${LABELS[k]}: ${facts[k]}`);
  return parts.length ? parts.join('; ') : 'nothing yet (first visit)';
}

// The dynamic variables sent at session start: today's date from the server, the memory, and
// what the agent learned from how this user uses the app.
export const sessionVariables = (session = {}) => ({
  ...(session.today ? { today: session.today } : {}),
  memory: memoryText(),
  learned: learnedText(),
});
