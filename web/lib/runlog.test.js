import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_TYPES, createConsoleLog } from './runlog.js';

// The server drops browser events of unknown types, so every type the browser logs must be listed.
test('every event type the browser logs is a known run log type', () => {
  const dir = new URL('../public/js/', import.meta.url).pathname;
  const files = [...readdirSync(dir).map((f) => join(dir, f)), ...readdirSync(join(dir, 'scenes')).map((f) => join(dir, 'scenes', f))]
    .filter((f) => f.endsWith('.js'));
  const used = new Set(files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/logEvent\('([a-z_]+)'/g)].map((m) => m[1])));
  assert.ok(used.has('live_start') && used.has('page_check'));
  assert.deepEqual([...used].filter((t) => !LOG_TYPES.includes(t)), []);
});

test('live session start and end reach the run log', () => {
  const lines = [];
  const log = createConsoleLog({ now: () => 5, out: (l) => lines.push(l) });
  assert.equal(log.browser([{ type: 'live_start', t: 1 }, { type: 'live_end', t: 2, why: 'idle' }, { type: 'made_up', t: 3 }]), 2);
  assert.match(lines[1], /"type":"live_end".*"why":"idle"/);
});
