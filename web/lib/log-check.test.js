import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRun, similarity } from '../scripts/log-check.js';

const kinds = (r) => r.flags.map((f) => f.kind);

test('flags overlapping audio, and is quiet for one voice at a time', () => {
  const two = checkRun([
    { t: 0, type: 'audio_start', source: 'agent', id: 'agent' },
    { t: 500, type: 'audio_start', source: 'mp3', id: 'shop_found' },
    { t: 1500, type: 'audio_end', source: 'agent', id: 'agent' },
    { t: 2500, type: 'audio_end', source: 'mp3', id: 'shop_found' },
  ]);
  assert.deepEqual(kinds(two), ['overlap']);
  const one = checkRun([
    { t: 0, type: 'audio_start', source: 'agent', id: 'agent' },
    { t: 1500, type: 'audio_end', source: 'agent', id: 'agent' },
    { t: 1600, type: 'audio_start', source: 'mp3', id: 'x' },
    { t: 2500, type: 'audio_end', source: 'mp3', id: 'x' },
  ]);
  assert.deepEqual(kinds(one), []);
});

test('flags slow replies, scenes before speech, feed during speech, errors', () => {
  const r = checkRun([
    { t: 0, type: 'mic', state: 'up' },
    { t: 3500, type: 'audio_start', source: 'agent', id: 'agent' },
    { t: 4000, type: 'push', kind: 'feed' },
    { t: 5000, type: 'audio_end', source: 'agent', id: 'agent' },
    { t: 20000, type: 'scene_open', name: 'flight' },
    { t: 21000, type: 'error', where: 'agent', message: 'boom' },
  ]);
  assert.deepEqual(kinds(r), ['slow reply', 'feed during speech', 'scene before speech', 'error']);
  assert.deepEqual(r.latency, { median: 3500, max: 3500 });
});

test('a scene that grows while the agent speaks is fine; swaps are ignored', () => {
  const r = checkRun([
    { t: 0, type: 'audio_start', source: 'mp3', id: 'shop_intro' },
    { t: 900, type: 'scene_open', name: 'shopping' },
    { t: 2000, type: 'audio_end', source: 'mp3', id: 'shop_intro' },
    { t: 9000, type: 'scene_open', name: 'payment', swap: true },
  ]);
  assert.deepEqual(kinds(r), []);
});

test('self-hearing: speech to text that repeats the agent is flagged', () => {
  assert.ok(similarity('ได้เลยค่ะ กำลังเปิดอีเมลให้นะคะ', 'ได้เลยค่ะ กำลังเปิดอีเมล') > 0.6);
  assert.ok(similarity('ช่วยทำรายการสิ่งที่ต้องทำ', 'เที่ยวบินดีเลย์สองชั่วโมง') < 0.3);
  const r = checkRun([
    { t: 0, type: 'agent_reply', text: 'ได้เลยค่ะ กำลังเปิดอีเมลรายการของที่ต้องซื้อให้นะคะ' },
    { t: 3000, type: 'stt', text: 'ได้เลยค่ะ กำลังเปิดอีเมลรายการของ', final: true },
    { t: 30000, type: 'stt', text: 'ช่วยทำรายการสิ่งที่ต้องทำหน่อย', final: true },
  ]);
  assert.deepEqual(kinds(r), ['self-hearing']);
});

test('a long sentence before a scene still counts as speaking first', () => {
  const r = checkRun([
    { t: 0, type: 'user_text', text: 'my finger is bleeding' },
    { t: 2600, type: 'audio_start', source: 'agent', id: 'agent' },
    { t: 8100, type: 'audio_end', source: 'agent', id: 'agent' },
    { t: 8100, type: 'scene_open', name: 'generated' },
  ]);
  assert.deepEqual(r.flags.map((f) => f.kind), []);
});

test('lists the lessons the agent wrote, and which signals asked for one', () => {
  const r = checkRun([
    { t: 0, type: 'tool', name: 'render_ui', result: 'error: spec_json is not valid JSON' },
    { t: 10, type: 'lesson', state: 'asked', signal: 'tool error' },
    { t: 2000, type: 'lesson', state: 'noted', text: 'Write spec_json as one valid JSON object.' },
  ]);
  assert.deepEqual(r.lessonAsks, ['tool error']);
  assert.deepEqual(r.lessons, [{ at: '+2.0s', text: 'Write spec_json as one valid JSON object.' }]);
  assert.deepEqual(kinds(r), []);
});
