// Lessons from mistakes, kept on this phone (localStorage), never on a server (docs/idea.md).
// The code notices a mistake (a tool error, a failed layout check, the user rejecting a page just
// shown, the agent saying it cannot see what the user means) and asks the live agent, silently, to
// write one short rule with the note_lesson tool. The newest MAX_LESSONS rules go back to the agent
// as {{lessons}} at session start. Mistakes every user hits belong in the prompt or the code:
// `npm run log:check` lists the lessons written so the team can move them there.
const KEY = 'agentos.lessons';
export const MAX_LESSONS = 5;
export const MAX_LESSON_LEN = 120;

function load() {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]');
    return Array.isArray(all) ? all.filter((l) => l && typeof l.text === 'string' && l.text) : [];
  } catch {
    return [];
  }
}

function save(all) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch { /* storage blocked: nothing is kept this visit */ }
}

// Two lessons are the same when they differ only in case, spaces and end punctuation.
export const normLesson = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!?。]+$/, '').trim();

export const lessons = () => load();

// Keep one lesson, newest first; the same lesson again moves to the top. Returns the entry or null.
export function addLesson(text, now = Date.now()) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LESSON_LEN);
  if (clean.length < 8) return null;
  const key = normLesson(clean);
  const entry = { text: clean, at: now };
  save([entry, ...load().filter((l) => normLesson(l.text) !== key)].slice(0, MAX_LESSONS));
  return entry;
}

// Forget one lesson (the memory page). Returns false when there was no such lesson.
export function forgetLesson(text) {
  const all = load();
  const next = all.filter((l) => normLesson(l.text) !== normLesson(text));
  if (next.length === all.length) return false;
  save(next);
  return true;
}

export function forgetLessons() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch { /* nothing to forget */ }
}

// The {{lessons}} text: the rules numbered, newest first, for example "1) When ... 2) When ...".
export const lessonsText = (all = load()) => (all.length ? all.map((l, i) => `${i + 1}) ${l.text}`).join(' ') : 'nothing yet');

// ---------- Mistake signals ----------

// The user turns a page down. Small on purpose: "ไม่" alone is in "ไม่เป็นไร" (never mind), so a bare
// no counts only as the whole reply or at its start ("ไม่ใช่", "ไม่เอา", "no, ...").
const REJECT_WORDS = /^\s*(ไม่(ค่ะ|ครับ|นะ|เอา|ใช่|ชอบ)?|no|nope)(\s|[,.!]|$)|ไม่ใช่|ไม่เอา|ไม่ชอบ|ไม่สวย|ไม่ได้ขอ|แย่|ใครจะดู|ผิด|\bwrong\b|not what i|\bugly\b|terrible|\bawful\b|i didn'?t ask/i;
// The agent says it cannot see or does not know what the user points at.
const BLIND_WORDS = /มองไม่เห็น|ไม่เห็น(หน้า|ภาพ|รูป|อัน|แบบ)|ไม่สามารถ(มอง)?เห็น|ไม่มีข้อมูล(ของ|เรื่อง)?(หน้า|เวอร์ชัน|อัน)|จำไม่ได้|can(no|')t see|cannot see|(don'?t|do not) (have|know) (that|which|the (old|earlier|previous))|can(no|')t remember/i;
// A page counts as just shown for this long: a "no" after that is about something else.
export const REJECT_WINDOW_MS = 60000;

export const isRejection = (text) => REJECT_WORDS.test(String(text || '').replace(/^\s*no\s+(?:problems?|worries)\b[\s,.!;:]*/i, ''));
export const saysBlind = (text) => BLIND_WORDS.test(String(text || ''));
export const isToolError = (result) => /^error:/.test(String(result || ''));
export const isLayoutFailure = (note) => String(note || '').startsWith('[screen] The designed page was replaced');

// The silent note that asks the agent for a lesson. `what` says what went wrong, in a few words.
export const lessonAsk = (what) =>
  `[lesson] A mistake just happened: ${String(what).slice(0, 240)}. Fix it for the user first if you can. ` +
  'Then call note_lesson once, without saying anything, with ONE short rule for next time: what to do, not what to avoid, ' +
  `at most ${MAX_LESSON_LEN} characters, for example "When asked to make a page prettier, change only its look and keep its content."`;

// Watches one live session for mistake signals and returns the note to send, or '' (no signal, or
// one was asked in the last COOLDOWN_MS: one lesson per mistake, not one per symptom).
export const COOLDOWN_MS = 20000;
export function createLessonWatch({ now = Date.now } = {}) {
  let pageAt = 0;
  let askedAt = -Infinity;
  const ask = (kind, what) => {
    if (now() - askedAt < COOLDOWN_MS) return null;
    askedAt = now();
    return { kind, text: lessonAsk(what) };
  };
  return {
    // A page was drawn or redrawn (render_ui, revise_ui).
    pageShown() { pageAt = now(); },
    tool(name, result) {
      if (name === 'note_lesson' || !isToolError(result)) return null;
      return ask('tool error', `the ${name} tool answered "${String(result).slice(0, 160)}"`);
    },
    context(note) {
      return isLayoutFailure(note) ? ask('layout check', 'the designed page failed its layout check and was replaced by the simple page') : null;
    },
    user(text) {
      if (!pageAt || now() - pageAt > REJECT_WINDOW_MS || !isRejection(text)) return null;
      return ask('user rejected', `right after the page appeared, the user said "${String(text).slice(0, 120)}"`);
    },
    agent(text) {
      return saysBlind(text) ? ask('agent blind', `you told the user "${String(text).slice(0, 120)}" about something they referred to`) : null;
    },
  };
}
