// What the agent offers to do, as tappable lines sent as the user's own words.
// Instant: picked on the phone from this pool by time of day and memory, at home load.
// Every line routes to its kind with the offline keyword router too (lib/suggest.test.js checks it),
// so a tap works with or without the live agent. demo: one of the stage use cases.
export const SUGGESTION_POOL = [
  { say: 'สัปดาห์นี้ยุ่งมาก', en: 'This week is hectic', kind: 'shopping', demo: true },
  { say: 'ซื้อของตามอีเมล', en: 'Shop my email list', kind: 'shopping', demo: true },
  { say: 'วางแผนซ้อมวิ่ง 10K', en: 'Plan 10K training', kind: 'training', demo: true },
  { say: 'สมัครงานวิ่ง 10K', en: 'Sign up for a 10K', kind: 'training', demo: true },
  { say: 'เช็คเที่ยวบินพรุ่งนี้', en: 'Check my flight', kind: 'flight', demo: true, hours: [12, 24] },
  { say: 'ทำ to-do list', en: 'Make a to-do list', kind: 'generated', demo: true },
  { say: 'สรุปวันนี้', en: 'Brief me on today', kind: 'secretary', hours: [5, 12] },
  { say: 'อีเมลเป็นงาน', en: 'Email to tasks', kind: 'secretary', hours: [8, 19] },
  { say: 'วันนี้ซ้อมวิ่งดีไหม', en: 'Should I run today?', kind: 'training', hours: [5, 10] },
  { say: 'หาหูฟัง งบ 1500', en: 'Find headphones', kind: 'shopping' },
  { say: 'จำอะไรไว้บ้าง', en: 'What you remember', kind: 'memory', needsMemory: true },
];

// What the app can actually do: a live suggestion of another kind is dropped.
export const SUGGESTION_KINDS = [...new Set(SUGGESTION_POOL.map((s) => s.kind))];

const LIKES = { training: /วิ่ง|run|10k|ซ้อม/i, shopping: /ซื้อ|ช้อป|shop|หูฟัง/i, flight: /บิน|เที่ยว|flight|travel/i };
const inHours = (hour, [from, to]) => hour >= from && hour < to;
const sameSet = (a, b) => a.length === b.length && a.every((s) => b.includes(s));

// count lines: at least one demo use case, no two of one kind, never exactly the set shown last time.
// facts: what the agent remembers (memory.js recall()); last: the lines shown last time.
export function pickSuggestions({ hour = new Date().getHours(), facts = {}, last = [], count = 3, random = Math.random } = {}) {
  const known = Object.keys(facts).length > 0;
  const likes = `${facts.likes || ''} ${facts.last_task || ''}`;
  const eligible = SUGGESTION_POOL.filter((s) => (!s.hours || inHours(hour, s.hours)) && (!s.needsMemory || known));
  const score = (s) => (s.hours ? 2 : 0) + (LIKES[s.kind]?.test(likes) ? 2 : 0) + (s.needsMemory ? 1 : 0) + random() * 1.5;
  const ranked = eligible.map((s) => [score(s), s]).sort((a, b) => b[0] - a[0]).map(([, s]) => s);
  let pick = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // Later attempts start from a reshuffled order, so the set can change.
    const order = attempt ? ranked.map((s) => [random(), s]).sort((a, b) => a[0] - b[0]).map(([, s]) => s) : ranked;
    pick = [order.find((s) => s.demo)];
    for (const s of order) {
      if (pick.length >= count) break;
      if (!pick.includes(s) && !pick.some((p) => p.kind === s.kind)) pick.push(s);
    }
    if (!sameSet(pick.map((s) => s.say), last)) break;
  }
  return pick;
}
