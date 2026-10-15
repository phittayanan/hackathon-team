import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSecretary, conflicts } from '../public/js/secretary.js';
import { createAgentLoop } from '../public/js/agent-loop.js';
import { createFeeds } from '../public/js/feeds.js';
import { keywordRoute } from './router.js';

const settle = () => new Promise(setImmediate);

test('calendar checks overlap, adjacency and invalid intervals', () => {
  const events = createSecretary().get().events;
  assert.deepEqual(conflicts(events, '13:30', '14:00', 'client').map((e) => e.id), ['team']);
  assert.deepEqual(conflicts(events, '14:30', '15:00', 'client'), []);
  assert.throws(() => conflicts(events, '24:00', '25:00'));
  assert.throws(() => conflicts(events, '14:30', '14:00'));
});

test('email import and simulated sending are idempotent; draft alone changes no appointment', () => {
  const s = createSecretary();
  assert.equal(s.sendDraft('anything'), false);
  assert.equal(s.importEmail(), true); assert.equal(s.importEmail(), false);
  assert.equal(s.get().tasks.length, 3); assert.equal(s.get().events.length, 3);
  s.draftReply(); assert.equal(s.get().events[1].start, '14:00');
  assert.equal(s.sendDraft(' '), false);
  assert.equal(s.sendDraft('ตกลงเป็น 14:30 ค่ะ'), true);
  assert.equal(s.sendDraft('duplicate'), false);
  assert.equal(s.get().events[1].start, '14:30');
  s.reset(); assert.equal(s.get().events[1].start, '14:00');
  assert.equal(s.get().tasks.length, 1);
});

test('notifications wait for idle, batch, acknowledge once, and ordinary email stays quiet', async () => {
  const batches = [];
  const s = createSecretary({ notify: async (batch) => batches.push(batch) });
  const loop = createAgentLoop({ feeds: createFeeds(), tickMs: 1e9, onIdle: () => s.flush() });
  try {
    s.schedule('meeting'); s.schedule('deadline'); s.schedule('email');
    assert.equal(s.schedule('meeting'), false);
    for (const presence of [{ scene: 'secretary' }, { talking: true }, { listening: true }]) {
      loop.setPresence(presence); await loop.tick();
    }
    assert.equal(batches.length, 0);
    loop.setPresence({ scene: 'home' }); await loop.tick(); await settle();
    assert.deepEqual(batches[0].map((n) => n.type), ['meeting', 'deadline']);
    assert.equal(s.get().quietEmails, 1);
    s.acknowledge(['meeting', 'deadline']); await loop.tick();
    assert.equal(batches.length, 1);
    assert.equal(s.schedule('meeting'), false);
  } finally { loop.stop(); s.stop(); }
});

test('scheduled notifications, snooze, reset and stale delivery cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const batches = [];
  const s = createSecretary({ notify: async (batch) => batches.push(batch) });
  assert.equal(s.schedule('meeting', 7), false);
  s.schedule('meeting', 10); assert.equal(s.flush(), false);
  t.mock.timers.tick(10000); s.flush(); await settle();
  assert.equal(batches.length, 1);
  s.snooze(['meeting'], 1); assert.equal(s.flush(), false);
  t.mock.timers.tick(59999); assert.equal(s.flush(), false);
  t.mock.timers.tick(1); s.flush(); await settle();
  assert.equal(batches.length, 2);
  s.snooze(['meeting'], 5); s.reset(); t.mock.timers.tick(300000);
  assert.equal(s.flush(), false); assert.deepEqual(s.get().notices, []);
  s.schedule('deadline'); s.flush(); s.reset(); await settle();
  assert.equal(batches.length, 2);
  s.stop();
});

test('secretary routing keeps shopping email and payment safety intact', () => {
  assert.equal(keywordRoute('สรุปวันนี้').scene, 'secretary');
  assert.equal(keywordRoute('งานจากอีเมล').data.view, 'email');
  assert.equal(keywordRoute('ช่วยร่างตอบ', 'secretary').action, 'draft');
  assert.equal(keywordRoute('เตือนอีก 5 นาที', 'secretary').minutes, 5);
  assert.equal(keywordRoute('ส่งเลย', 'secretary').action, undefined);
  assert.equal(keywordRoute('email').scene, 'shopping');
  assert.equal(keywordRoute('จ่าย', 'payment').action, 'button-only');
});

test('a notification interrupted before display is retried, without repeating acknowledged ones', async () => {
  let delivered = false;
  const s = createSecretary({ notify: async () => delivered });
  s.schedule('meeting'); s.flush(); await settle();
  assert.equal(s.get().notices[0].status, 'pending');
  delivered = true; s.flush(); await settle();
  assert.equal(s.get().notices[0].status, 'shown');
  s.acknowledge(['meeting']); assert.equal(s.flush(), false);
});
