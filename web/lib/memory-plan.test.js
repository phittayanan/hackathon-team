import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remember, recall, memoryText, sessionVariables, hasMemory } from '../public/js/memory.js';
import { parseSteps, createPlan } from '../public/js/plan.js';
import { createToolHandlers, lastTask } from '../public/js/agent-tools.js';

// A localStorage stand-in for Node.
function fakeStorage() {
  const data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
  return data;
}

test('memory: keeps a few short facts, forgets on empty, and makes the {{memory}} text', () => {
  fakeStorage();
  assert.equal(memoryText(), 'nothing yet (first visit)');
  assert.equal(hasMemory(), false);
  assert.equal(remember('name', '  Ploy  '), true);
  assert.equal(remember('likes', 'running '.repeat(30)), true);
  assert.equal(remember('password', 'x'), false);
  assert.equal(recall().name, 'Ploy');
  assert.ok(recall().likes.length <= 80);
  remember('last_task', '10K training plan and race sign-up');
  assert.match(memoryText(), /^name: Ploy; likes: running .*; last task: 10K training plan and race sign-up$/);
  remember('likes', '');
  assert.equal(recall().likes, undefined);
  assert.deepEqual(sessionVariables({ today: 'Friday 16 October 2026 (2026-10-16)' }), {
    today: 'Friday 16 October 2026 (2026-10-16)',
    memory: 'name: Ploy; last task: 10K training plan and race sign-up',
    learned: 'nothing yet',
  });
  // No date from the server: memory and learned only.
  assert.deepEqual(Object.keys(sessionVariables({})), ['memory', 'learned']);
});

test('memory: blocked or broken storage is an empty memory, never an error', () => {
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(recall(), {});
  assert.equal(remember('name', 'Ploy'), true);
  globalThis.localStorage = { getItem: () => '{not json', setItem() {} };
  assert.equal(memoryText(), 'nothing yet (first visit)');
  delete globalThis.localStorage;
});

test('plan: 2 to 4 short steps from "a|b|c", arrows or an array', () => {
  assert.deepEqual(parseSteps('อ่านอีเมล|ทำลิสต์|รอคุณกด Allow'), ['อ่านอีเมล', 'ทำลิสต์', 'รอคุณกด Allow']);
  assert.deepEqual(parseSteps('1 read email -> 2 build list → 3 ask to pay'), ['read email', 'build list', 'ask to pay']);
  assert.deepEqual(parseSteps(['a', 'b', 'c', 'd', 'e']), ['a', 'b', 'c', 'd']);
  assert.equal(parseSteps('just one step'), null);
  assert.equal(parseSteps(''), null);
});

function testPlan() {
  const frames = [];
  const timers = [];
  const plan = createPlan({ render: (s) => frames.push(s), wait: (fn) => (timers.push(fn), timers.length), cancel: (i) => { timers[i - 1] = null; } });
  return { plan, frames, flush: () => timers.splice(0).forEach((fn) => fn?.()) };
}

test('plan: ticks a step per tick, fades when done', () => {
  const { plan, frames, flush } = testPlan();
  plan.tick(); // no plan: nothing
  assert.equal(frames.length, 0);
  plan.start('search|show page');
  plan.tick();
  assert.deepEqual(plan.state(), { steps: ['search', 'show page'], done: 1, busy: false });
  plan.start('search | show page'); // the agent sends the same plan with the next tool: no reset
  assert.equal(plan.state().done, 1);
  plan.tick();
  assert.equal(plan.state().done, 2);
  flush();
  assert.equal(plan.active(), false);
  assert.deepEqual(frames.at(-1), { steps: [], done: 0 });
});

test('plan: an app-made scene swap ticks; home ends the plan; a tool swapping pages does neither', () => {
  const { plan, flush } = testPlan();
  plan.start('read email|build list|tap Allow');
  plan.tick(); // open_scene shopping finished
  plan.sceneChanged('shopping', 'payment'); // the app moved on by itself
  assert.equal(plan.state().done, 2);
  plan.busy(true);
  plan.sceneChanged('payment', 'home'); // a tool closing one page to open another
  plan.busy(false);
  flush();
  assert.equal(plan.active(), true);
  plan.sceneChanged('payment', 'home');
  flush();
  assert.equal(plan.active(), false);
});

function fakeUi(plan, facts) {
  let current = null;
  return {
    plan,
    remember: (k, v) => (['name', 'likes', 'last_task', 'note'].includes(k) ? ((facts[k] = v), true) : false),
    current: () => current,
    openScene: async (name, data) => { current = { name, ctl: { state: () => ({ spec: data?.spec }) } }; },
    closeScene: () => { current = null; },
    action: () => {},
    nudgeAllow: () => {},
  };
}

test('tools: a plan comes with the first call and each finished tool ticks it; the last task is saved', async () => {
  const { plan } = testPlan();
  const facts = {};
  const h = createToolHandlers(fakeUi(plan, facts));
  assert.equal(await h.open_scene({ scene: 'shopping', plan: 'read email|build list|tap Allow' }), 'opened shopping');
  assert.deepEqual(plan.state(), { steps: ['read email', 'build list', 'tap Allow'], done: 1, busy: true });
  await new Promise((r) => setTimeout(r, 1));
  assert.equal(plan.state().busy, false); // released just after the tool's own scene change
  assert.equal(facts.last_task, 'groceries list from the weekly email');
  // The payment refusal stays synchronous and is not a finished step.
  await h.open_scene({ scene: 'payment' });
  const before = plan.state().done;
  assert.match(h.scene_action({ action: 'confirm' }), /^refused/);
  assert.equal(plan.state().done, before);
});

test('tools: a failed first call drops its plan; remember saves only known keys', async () => {
  const { plan } = testPlan();
  const facts = {};
  const h = createToolHandlers(fakeUi(plan, facts));
  assert.match(await h.open_scene({ scene: 'bank_transfer', plan: 'a|b' }), /^error/);
  assert.equal(plan.active(), false);
  assert.match(h.remember({ key: 'name', value: 'Ploy' }), /^remembered name/);
  assert.equal(facts.name, 'Ploy');
  assert.match(h.remember({ key: 'card_number', value: '4111' }), /^error/);
  assert.equal(facts.card_number, undefined);
});

test('last task: from the scene or the page title', () => {
  assert.equal(lastTask('open_scene', { scene: 'shopping', data_json: '{"catalog":true,"query":"headphones"}' }), 'product discovery through Shopify');
  assert.equal(lastTask('open_scene', { scene: 'flight' }), 'a delayed flight re-route');
  assert.equal(lastTask('render_ui', { spec_json: JSON.stringify({ title: 'To-do list' }) }), 'made a page: To-do list');
  assert.equal(lastTask('scene_action', { action: 'close' }), null);
});
