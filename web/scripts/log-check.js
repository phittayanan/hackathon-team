// Summarize a run log and flag problems.
// Usage: npm run log:check            (latest run in web/logs/)
//        npm run log:check -- <file>  (a named run)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLOW_MS = 3000;
export const ECHO_WINDOW_MS = 8000;
export const ECHO_SIMILARITY = 0.6;

// Character-bigram similarity (Dice), good enough for Thai, which has no spaces between words.
export function similarity(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s.,!?'"“”…]/g, '');
  const grams = (s) => { const g = new Map(); for (let i = 0; i < s.length - 1; i++) g.set(s.slice(i, i + 2), (g.get(s.slice(i, i + 2)) || 0) + 1); return g; };
  const x = norm(a); const y = norm(b);
  if (x.length < 2 || y.length < 2) return 0;
  const gx = grams(x); const gy = grams(y);
  let both = 0;
  for (const [k, n] of gx) both += Math.min(n, gy.get(k) || 0);
  return (2 * both) / (x.length - 1 + y.length - 1);
}

// Audio intervals from audio_start / audio_end pairs (per source + id).
export function audioIntervals(events) {
  const open = new Map();
  const out = [];
  for (const e of events) {
    const key = `${e.source}:${e.id ?? ''}`;
    if (e.type === 'audio_start') open.set(key, e);
    if (e.type === 'audio_end' && open.has(key)) {
      out.push({ source: e.source, id: e.id, start: open.get(key).t, end: e.t });
      open.delete(key);
    }
  }
  const last = events.at(-1)?.t ?? 0;
  for (const s of open.values()) out.push({ source: s.source, id: s.id, start: s.t, end: last, unfinished: true });
  return out.sort((a, b) => a.start - b.start);
}

const speakingAt = (intervals, t) => intervals.filter((i) => i.start <= t && t < i.end);

export function checkRun(events) {
  events = [...events].sort((a, b) => a.t - b.t);
  const t0 = events[0]?.t ?? 0;
  const at = (t) => `+${((t - t0) / 1000).toFixed(1)}s`;
  const flags = [];
  const audio = audioIntervals(events);

  // 1. Overlapping audio: two voices at once.
  for (let i = 0; i < audio.length; i++) {
    for (let j = i + 1; j < audio.length && audio[j].start < audio[i].end; j++) {
      flags.push({ kind: 'overlap', t: audio[j].start, msg: `${audio[i].source}:${audio[i].id ?? ''} and ${audio[j].source}:${audio[j].id ?? ''} speak at once (${audio[i].end - audio[j].start} ms)` });
    }
  }

  // 2. Slow replies: end of user speech (mic up, final text, typed text) to the first agent audio.
  const turnEnds = events.filter((e) => (e.type === 'mic' && e.state === 'up') || e.type === 'user_text' || (e.type === 'stt' && e.final));
  const latencies = [];
  for (const u of turnEnds) {
    const next = events.find((e) => e.t > u.t && e.type === 'audio_start');
    const nextTurn = turnEnds.find((x) => x.t > u.t + 50);
    if (!next || (nextTurn && nextTurn.t < next.t)) continue;
    const ms = next.t - u.t;
    latencies.push(ms);
    if (ms > SLOW_MS) flags.push({ kind: 'slow reply', t: u.t, msg: `${ms} ms from end of user speech to agent audio` });
  }

  // 3. A scene opened before the agent said anything about it: no speech between what triggered it
  //    (the user's turn or a feed push) and the moment it opened (4 s window if there is no trigger).
  const triggers = events.filter((e) => e.type === 'user_text' || (e.type === 'stt' && e.final) || (e.type === 'mic' && e.state === 'down') || e.type === 'push' || e.type === 'feed');
  for (const s of events.filter((e) => e.type === 'scene_open' && !e.swap)) {
    const trigger = triggers.filter((e) => e.t <= s.t).at(-1);
    const from = trigger && s.t - trigger.t < 30000 ? trigger.t : s.t - 4000;
    const spoke = audio.some((i) => i.start <= s.t && (i.start >= from || i.end > s.t));
    if (!spoke) flags.push({ kind: 'scene before speech', t: s.t, msg: `${s.name} opened with no agent speech first` });
  }

  // 4. Feed events pushed while something was speaking.
  for (const f of events.filter((e) => e.type === 'push' || e.type === 'feed')) {
    const busy = speakingAt(audio, f.t);
    if (busy.length) flags.push({ kind: 'feed during speech', t: f.t, msg: `${f.type} while ${busy.map((b) => b.source).join('+')} was speaking` });
  }

  // 5. Self-hearing: the mic heard the agent's own words (speech to text matches what it just said).
  const agentWords = events.filter((e) => (e.type === 'agent_reply' && e.text) || (e.type === 'audio_start' && e.text));
  for (const s of events.filter((e) => e.type === 'stt' && e.text && e.text.length >= 4)) {
    const recent = agentWords.filter((a) => a.t <= s.t && a.t >= s.t - ECHO_WINDOW_MS);
    const best = recent.map((a) => ({ a, score: similarity(s.text, a.text) })).sort((p, q) => q.score - p.score)[0];
    if (best && best.score >= ECHO_SIMILARITY) flags.push({ kind: 'self-hearing', t: s.t, msg: `heard "${s.text.slice(0, 40)}", ${Math.round(best.score * 100)}% like what the agent said ${((s.t - best.a.t) / 1000).toFixed(1)} s before` });
  }

  // 6. Errors.
  for (const e of events.filter((x) => x.type === 'error')) flags.push({ kind: 'error', t: e.t, msg: `${e.where || e.src}: ${e.message}` });

  // Lessons the agent wrote after a mistake (lessons.js): a lesson that comes back again and again
  // is a mistake every user hits, so it belongs in the prompt or the code.
  const lessons = events.filter((e) => e.type === 'lesson' && e.state === 'noted' && e.text).map((e) => ({ at: at(e.t), text: e.text }));
  const asked = events.filter((e) => e.type === 'lesson' && e.state === 'asked').map((e) => e.signal);

  const count = (type) => events.filter((e) => e.type === type).length;
  return {
    lessons,
    lessonAsks: asked,
    durationS: events.length ? (events.at(-1).t - t0) / 1000 : 0,
    counts: { userTurns: turnEnds.length, agentAudio: audio.filter((a) => a.source === 'agent').length, localAudio: audio.filter((a) => a.source !== 'agent').length, tools: count('tool'), scenes: count('scene_open'), feeds: count('feed_event') },
    latency: latencies.length ? { median: latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)], max: Math.max(...latencies) } : null,
    flags: flags.sort((a, b) => a.t - b.t).map((f) => ({ ...f, at: at(f.t) })),
  };
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'logs');
  let file = process.argv[2];
  if (!file) {
    const runs = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
    if (!runs.length) return console.log('No run logs yet in web/logs/. Start the server and use the app.');
    file = join(dir, runs.at(-1));
  }
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const r = checkRun(events);
  console.log(`run ${basename(file)}: ${r.durationS.toFixed(0)} s, ${events.length} events`);
  console.log(`  user turns ${r.counts.userTurns}, agent audio ${r.counts.agentAudio}, local audio ${r.counts.localAudio}, tool calls ${r.counts.tools}, scenes ${r.counts.scenes}, feed events ${r.counts.feeds}`);
  if (r.latency) console.log(`  reply latency: median ${r.latency.median} ms, max ${r.latency.max} ms`);
  if (r.lessonAsks.length || r.lessons.length) {
    console.log(`  lessons: ${r.lessonAsks.length} asked (${[...new Set(r.lessonAsks)].join(', ') || 'none'}), ${r.lessons.length} written`);
    for (const l of r.lessons) console.log(`  ${l.at.padStart(8)}  lesson: ${l.text}`);
  }
  if (!r.flags.length) return console.log('  no problems found');
  console.log(`  ${r.flags.length} problem(s):`);
  for (const f of r.flags) console.log(`  ${f.at.padStart(8)}  ${f.kind}: ${f.msg}`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
