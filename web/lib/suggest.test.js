import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUGGESTION_POOL, pickSuggestions } from '../public/js/suggest.js';
import { keywordRoute } from './router.js';

// The scene a tap opens offline; catalog searches are the shopping scene too.
const sceneOf = { shopping: 'shopping', training: 'training', flight: 'flight', generated: 'generated', secretary: 'secretary', memory: 'memory' };

test('suggestions: every line in the pool routes offline to its kind', () => {
  assert.ok(SUGGESTION_POOL.length >= 10);
  for (const s of SUGGESTION_POOL) assert.equal(keywordRoute(s.say).scene, sceneOf[s.kind], s.say);
});

test('suggestions: three lines, at least one demo use case, no kind twice, at any hour', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const pick = pickSuggestions({ hour, random: () => 0.5 });
    assert.equal(pick.length, 3, `hour ${hour}`);
    assert.ok(pick.some((s) => s.demo), `hour ${hour}`);
    assert.equal(new Set(pick.map((s) => s.kind)).size, 3, `hour ${hour}`);
  }
});

test('suggestions: never exactly the set shown last time', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let last = [];
  for (let visit = 0; visit < 200; visit += 1) {
    const pick = pickSuggestions({ hour: visit % 24, last, random }).map((s) => s.say);
    assert.notDeepEqual([...pick].sort(), [...last].sort(), `visit ${visit}`);
    last = pick;
  }
});

test('suggestions: time of day and memory decide what is offered', () => {
  const morning = pickSuggestions({ hour: 7, random: () => 0 }).map((s) => s.say);
  assert.ok(morning.includes('สรุปวันนี้') || morning.includes('วันนี้ซ้อมวิ่งดีไหม'));
  const all = (opts) => new Set(Array.from({ length: 50 }, () => pickSuggestions(opts).map((s) => s.say)).flat());
  assert.ok(!all({ hour: 22 }).has('สรุปวันนี้'), 'no morning brief at night');
  assert.ok(!all({ hour: 9 }).has('จำอะไรไว้บ้าง'), 'nothing remembered: no memory line');
  const runner = pickSuggestions({ hour: 14, facts: { name: 'พลอย', likes: 'วิ่ง' }, random: () => 0 });
  assert.ok(runner.some((s) => s.kind === 'training'), 'a runner is offered training');
});
