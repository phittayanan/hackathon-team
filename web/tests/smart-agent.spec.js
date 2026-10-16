import { test, expect } from '@playwright/test';
import { expectHome, revealHome } from './helpers.js';

// Memory across visits, the returning greeting and the plan line, on the live path with the SDK
// and the agent routes stubbed (no network, no key).
const FAKE_SDK = `
export const Conversation = {
  async startSession(opts) {
    const conv = { opts, sent: [], context: [],
      setMicMuted() {}, setVolume() {}, sendUserActivity() {}, async endSession() {},
      sendUserMessage(t) { (t.startsWith('[feed update]') ? conv.context : conv.sent).push(t); },
      sendContextualUpdate(t) { conv.context.push(t); } };
    window.__conv = conv;
    setTimeout(() => opts.onConnect && opts.onConnect({ conversationId: 'fake' }), 0);
    return conv;
  },
};`;

async function stubLive(page, memory) {
  await page.addInitScript((facts) => {
    const track = { stop() {}, getSettings: () => ({}) };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [track], getAudioTracks: () => [track] });
    if (facts && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('agentos.memory', JSON.stringify(facts));
      sessionStorage.setItem('seeded', '1');
    }
  }, memory || null);
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake', today: 'Friday 16 October 2026 (2026-10-16)' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
}

async function connect(page) {
  await revealHome(page);
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
}

const tool = (page, name, params) => page.evaluate(([n, p]) => window.__conv.opts.clientTools[n](p), [name, params]);
const memory = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('agentos.memory') || '{}'));

test('memory: a first visit sends "nothing yet"; remember and a finished task are kept for the next visit', async ({ page }) => {
  await stubLive(page);
  await connect(page);
  const vars = await page.evaluate(() => window.__conv.opts.dynamicVariables);
  expect(vars).toEqual({ today: 'Friday 16 October 2026 (2026-10-16)', memory: 'nothing yet (first visit)', learned: 'nothing yet' });

  expect(await tool(page, 'remember', { key: 'name', value: 'Ploy' })).toMatch(/^remembered name/);
  expect(await tool(page, 'remember', { key: 'likes', value: 'running' })).toMatch(/^remembered likes/);
  expect(await tool(page, 'open_scene', { scene: 'training' })).toMatch(/^opened training: Sleep score 86/);
  expect(await memory(page)).toEqual({ name: 'Ploy', likes: 'running', last_task: '10K training plan and race sign-up' });

  // Next visit: the agent gets what it learned at session start.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await connect(page);
  expect(await page.evaluate(() => window.__conv.opts.dynamicVariables.memory)).toBe('name: Ploy; likes: running; last task: 10K training plan and race sign-up');
});

test('memory: a returning visitor is greeted by the live agent with what it remembers, not the saved line', async ({ page }) => {
  await stubLive(page, { name: 'Ploy', last_task: '10K training plan and race sign-up' });
  await page.locator('.mascot').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await expect.poll(() => page.evaluate(() => window.__conv.sent)).toEqual([expect.stringMatching(/^\[session start\]/)]);
  expect(await page.evaluate(() => window.__conv.opts.dynamicVariables.memory)).toContain('name: Ploy');
  const greet = await page.evaluate(() => window.__runlog.filter((e) => e.type === 'greet'));
  expect(greet).toEqual([expect.objectContaining({ via: 'agent' })]);
});

test('memory: a first visit is greeted by the saved line, with no live session', async ({ page }) => {
  await stubLive(page);
  await page.locator('.mascot').dispatchEvent('pointerdown');
  await expect.poll(() => page.evaluate(() => window.__runlog.filter((e) => e.type === 'greet').map((e) => e.via))).toEqual(['local']);
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
});

test('plan line: shown with the first tool call, ticks as tools finish, fades when the task folds home', async ({ page }) => {
  await stubLive(page);
  await connect(page);
  const plan = page.locator('[data-testid=plan]');
  const states = () => plan.locator('li').evaluateAll((lis) => lis.map((li) => li.dataset.state));

  expect(await tool(page, 'open_scene', { scene: 'shopping', plan: 'อ่านอีเมล|ทำลิสต์|รอคุณกด Allow' })).toMatch(/^opened shopping: Shopping list at FreshMart Online/);
  await expect(plan).toHaveClass(/show/);
  await expect(plan.locator('li')).toHaveText(['✓ อ่านอีเมล', '2 ทำลิสต์', '3 รอคุณกด Allow']);
  expect(await states()).toEqual(['done', 'now', 'next']);

  // The list is checked out: the shopping scene becomes the payment card.
  await tool(page, 'scene_action', { action: 'confirm' });
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment');
  expect(await states()).toEqual(['done', 'done', 'now']);
  // Asking the agent to pay does not tick the Allow step.
  expect(await tool(page, 'scene_action', { action: 'confirm' })).toMatch(/^refused/);
  expect(await states()).toEqual(['done', 'done', 'now']);

  await page.click('[data-testid=deny]');
  await page.evaluate(() => window.__conv.opts.onModeChange({ mode: 'speaking' }));
  await page.evaluate(() => window.__conv.opts.onModeChange({ mode: 'listening' }));
  await expectHome(page);
  await expect(plan).not.toHaveClass(/show/, { timeout: 4000 });
});

test('plan line: a one-step task shows no plan; a failed first step drops the plan', async ({ page }) => {
  await stubLive(page);
  await connect(page);
  await tool(page, 'render_ui', { spec_json: JSON.stringify({ title: 'To-do', blocks: [{ type: 'checklist', items: [{ text: 'Run' }] }] }) });
  await expect(page.locator('[data-testid=plan]')).toHaveCount(0);
  expect((await memory(page)).last_task).toBe('made a page: To-do');
  await tool(page, 'scene_action', { action: 'close' });
  await expectHome(page);

  // A rejected scene is not a finished step, and its plan goes away.
  expect(await tool(page, 'open_scene', { scene: 'unknown', plan: 'Open scene|Show result' })).toMatch(/^error/);
  await expect(page.locator('[data-testid=plan]')).not.toHaveClass(/show/);
});

test('learning: a revise in one visit reaches the next session as {{learned}}; ?forget=1 resets it', async ({ page }) => {
  await stubLive(page);
  await connect(page);
  const page1 = { kind: 'todo', name: 'To-do list', title: 'To-do', blocks: [{ type: 'checklist', items: [{ text: 'Run' }] }], proposals: [{ id: 'd', label: 'Add due dates' }] };
  await tool(page, 'render_ui', { spec_json: JSON.stringify(page1) });
  await tool(page, 'revise_ui', { spec_json: JSON.stringify({ ...page1, blocks: [{ type: 'checklist', items: [{ text: 'Run', due: 'Mon' }] }, { type: 'progress', label: 'Done', value: 'auto' }] }) });
  await tool(page, 'scene_action', { action: 'close' });
  await expectHome(page);

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await connect(page);
  const learned = await page.evaluate(() => window.__conv.opts.dynamicVariables.learned);
  expect(learned).toContain('todo pages: give checklist items due dates');
  expect(learned).toContain('todo pages: add a progress bar');

  await page.goto('/?test=1&forget=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  expect(await page.evaluate(() => [localStorage.getItem('agentos.learned'), localStorage.getItem('agentos.memory')])).toEqual([null, null]);
});

test('training: the race form waits for a yes; decline leaves it unsent, scene_action confirm sends it', async ({ page }) => {
  await stubLive(page);
  await connect(page);
  expect(await tool(page, 'open_scene', { scene: 'training' })).toMatch(/waits for the user's yes/);
  await expect(page.locator('[data-testid=race-submit]')).toBeEnabled();
  await tool(page, 'scene_action', { action: 'decline' });
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-testid=race-done]')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'training');
  await tool(page, 'scene_action', { action: 'confirm' });
  await expect(page.locator('[data-testid=race-done]')).toBeVisible();
  await expect(page.locator('.confetti i').first()).toBeAttached();
});
