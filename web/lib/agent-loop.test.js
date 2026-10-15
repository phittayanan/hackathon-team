import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeeds } from '../public/js/feeds.js';
import { createAgentLoop, describeChanges, flightReason, topUrgency } from '../public/js/agent-loop.js';
import { decideByRules, feedUrgency } from '../public/js/brain.js';

function setup(opts = {}) {
  const pushed = [];
  const loop = createAgentLoop({ feeds: createFeeds(), tickMs: 1e9, log: () => {}, emit: (event, data) => { if (event === 'proactive') pushed.push(data); }, ...opts });
  return { loop, pushed };
}

test('flight delay pushes the flight scene once', async () => {
  const { loop, pushed } = setup();
  await loop.tick();
  assert.equal(pushed.length, 0);
  loop.fire('flight-delayed');
  await loop.tick();
  assert.equal(pushed[0].scene, 'flight');
  assert.equal(pushed[0].line, 'flight_intro');
  loop.ack({ id: pushed[0].id, ok: true });
  loop.fire('flight-delayed');
  await loop.tick();
  assert.equal(pushed.length, 1);
  loop.stop();
});

test('never speaks while a scene is open or someone talks', async () => {
  const { loop, pushed } = setup();
  loop.fire('sleep-synced');
  for (const p of [{ scene: 'payment' }, { scene: 'home', talking: true }, { scene: 'home', listening: true }]) {
    loop.setPresence(p);
    await loop.tick();
  }
  assert.equal(pushed.length, 0);
  loop.setPresence({ scene: 'home' });
  await loop.tick();
  assert.equal(pushed[0].scene, 'training');
  loop.stop();
});

test('busy ack makes it try again later', async () => {
  const { loop, pushed } = setup();
  loop.fire('flight-delayed');
  await loop.tick();
  loop.ack({ id: pushed[0].id, ok: false });
  await loop.tick();
  assert.equal(pushed.length, 2);
  loop.stop();
});

test('script: closing payment schedules the sleep event', async () => {
  const feeds = createFeeds();
  const loop = createAgentLoop({ feeds, tickMs: 1e9, log: () => {}, script: [{ afterScene: 'payment', delaySec: 0, event: 'sleep-synced' }] });
  loop.setPresence({ scene: 'payment' });
  loop.setPresence({ scene: 'home' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(feeds.get().health.synced, true);
  loop.stop();
});

test('rules wait on a plain email', () => {
  const feeds = createFeeds();
  feeds.fire('email-shopping');
  assert.equal(decideByRules(feeds.get(), {}).speak, false);
  feeds.fire('flight-delayed');
  assert.equal(decideByRules(feeds.get(), {}).scene, 'flight');
  assert.equal(decideByRules(feeds.get(), { flight: true }).speak, false);
});

test('live mode: feed changes become a contextual update, only when idle', async () => {
  const feeds = createFeeds();
  const msgs = [];
  const loop = createAgentLoop({ feeds, tickMs: 1e9, log: () => {}, emit: (event, data) => { if (event === 'feed') msgs.push(data); } });
  loop.setPresence({ scene: 'payment', live: true });
  loop.fire('flight-delayed');
  await loop.tick();
  assert.equal(msgs.length, 0);
  loop.setPresence({ scene: 'home', live: true });
  await loop.tick();
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /delayed 120 minutes/);
  loop.stop();
});

test('feed updates carry their concrete reason', () => {
  const feeds = createFeeds();
  feeds.fire('flight-delayed');
  const flight = describeChanges(feeds.get(), ['flight']);
  assert.match(flight, /delayed 120 minutes \(ground delay at BKK\)/);
  assert.match(flight, /Why it matters: it now lands at 11:15 instead of 09:15, after the 11:00 Client meeting, Chiang Mai \(it clashes\)/);
  assert.match(flight, /FD 3433, lands at 09:55/);

  feeds.fire('sleep-synced');
  assert.match(describeChanges(feeds.get(), ['health']), /Why it matters: sleep score 86 .* Bangkok City 10K sign-up just opened/);

  feeds.fire('email-shopping');
  assert.match(describeChanges(feeds.get(), ['email']), /Why it matters: it is only a promo email; nothing needs the user now/);
});

test('a short delay with no clash says so and offers no faster flight', () => {
  const feeds = createFeeds();
  feeds.fire('flight-delayed');
  feeds.get().flight.delayMinutes = 30;
  const reason = flightReason(feeds.get());
  assert.deepEqual([reason.lands, reason.clash], ['09:45', false]);
  const text = describeChanges(feeds.get(), ['flight']);
  assert.match(text, /nothing on the calendar clashes/);
  assert.doesNotMatch(text, /faster flight/);
});

test('live mode: no feed update while the user types, thinks or just interacted; then it carries urgency and context', async () => {
  const feeds = createFeeds();
  const msgs = [];
  let t = 100_000;
  const loop = createAgentLoop({ feeds, tickMs: 1e9, quietMs: 8000, clock: () => t, log: () => {}, emit: (event, data) => { if (event === 'feed') msgs.push(data); } });
  loop.fire('flight-delayed');
  for (const p of [{ typing: true }, { thinking: true }, { lastInteractionAt: t - 3000 }]) {
    loop.setPresence({ scene: 'home', live: true, ...p });
    await loop.tick();
  }
  assert.equal(msgs.length, 0);
  t += 39_000; // 42 s after the last interaction
  await loop.tick();
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].urgency, 'high');
  assert.deepEqual(msgs[0].context, { scene: 'home', typing: false, speaking: false, agentTalking: false, idleSeconds: 42 });
  assert.match(msgs[0].text, /Urgency: high\./);
  assert.match(msgs[0].text, /User now: on the agent home, no page open; not typing; not speaking; last interaction 42 s ago\.$/);
  loop.stop();
});

test('offline rules use the same urgency: a delay that clashes with nothing does not interrupt', () => {
  const feeds = createFeeds();
  feeds.fire('flight-delayed');
  feeds.get().flight.delayMinutes = 30;
  assert.equal(feedUrgency(feeds.get(), 'flight'), 'low');
  assert.equal(decideByRules(feeds.get(), {}).speak, false);
  feeds.get().flight.delayMinutes = 120;
  assert.equal(feedUrgency(feeds.get(), 'flight'), 'high');
  assert.match(decideByRules(feeds.get(), {}).reason, /clashes/);
  assert.equal(topUrgency(feeds.get(), ['email', 'flight']), 'high');
});
