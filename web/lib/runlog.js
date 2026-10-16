// Run log. Locally: one JSONL file per server run under web/logs/ (gitignored: it holds what testers
// said; never commit or upload it). On Vercel: one JSON line per event in the function log (console).
// Every event: { t: ms timestamp, src: 'server' | 'browser', type, ... }.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const LOG_TYPES = [
  'run_start', 'page_open', 'mic', 'stt', 'user_text', 'agent_reply', 'tool', 'audio_start', 'audio_end',
  'scene_open', 'scene_close', 'feed', 'feed_event', 'decision', 'push', 'route', 'error', 'greet',
  'offline', 'limit', 'suggestion', 'search', 'live_start', 'live_end', 'page_check', 'page_tap', 'lesson',
];

function browserEvents(events, now, write) {
  let n = 0;
  for (const e of Array.isArray(events) ? events.slice(0, 200) : []) {
    if (!e || !LOG_TYPES.includes(e.type)) continue;
    const line = { ...e, t: Number(e.t) || now(), src: 'browser' };
    if (JSON.stringify(line).length > 4000) continue;
    write(line);
    n += 1;
  }
  return n;
}

export function createConsoleLog({ now = Date.now, out = console.log } = {}) {
  const write = (event) => out(`[runlog] ${JSON.stringify(event)}`);
  return {
    file: null,
    server: (type, data = {}) => write({ t: now(), src: 'server', type, ...data }),
    browser: (events) => browserEvents(events, now, write),
  };
}

export function createRunLog(dir, { now = Date.now } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `run-${new Date(now()).toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const write = (event) => appendFileSync(file, `${JSON.stringify(event)}\n`);
  write({ t: now(), src: 'server', type: 'run_start' });
  return {
    file,
    server: (type, data = {}) => write({ t: now(), src: 'server', type, ...data }),
    // Browser events: known types only, bounded size, browser time kept (same machine clock).
    browser: (events) => browserEvents(events, now, write),
  };
}
