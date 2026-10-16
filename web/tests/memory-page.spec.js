import { test, expect } from '@playwright/test';
import { home, expectHome, say } from './helpers.js';

// The memory page: the user sees and controls what the agent remembers on this phone.
// SHOTS=1 also saves the seeded page to tests/screenshots/ for the pull request.
const FACTS = { name: 'Ploy', likes: 'running', last_task: '10K training plan' };
const LEARNED = [
  { key: 'todo:due', text: 'todo pages: give checklist items due dates', n: 2, at: 2 },
  { key: 'todo:progress', text: 'todo pages: add a progress bar', n: 1, at: 1 },
];
const LESSONS = [{ text: 'When asked to make a page prettier, change only its look and keep its content.', at: 3 }];
const page1 = (kind, name) => ({ kind, name, match: [kind], spec: { kind, name, title: name, blocks: [{ type: 'text', text: 'hi' }] }, savedAt: '2026-10-15T09:00:00.000Z' });
const SAVED = { todo: page1('todo', 'To-do list'), packing: page1('packing', 'Packing list') };

async function seed(page) {
  await page.addInitScript(([facts, lines, saved, rules]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('agentos.memory', JSON.stringify(facts));
    localStorage.setItem('agentos.learned', JSON.stringify(lines));
    localStorage.setItem('agentos.lessons', JSON.stringify(rules));
    localStorage.setItem('agentos.savedScenes', JSON.stringify(saved));
    sessionStorage.setItem('seeded', '1');
  }, [FACTS, LEARNED, SAVED, LESSONS]);
}

const stored = (page) => page.evaluate(() => ({
  memory: JSON.parse(localStorage.getItem('agentos.memory') || '{}'),
  learned: JSON.parse(localStorage.getItem('agentos.learned') || '[]').map((l) => l.key),
  saved: Object.keys(JSON.parse(localStorage.getItem('agentos.savedScenes') || '{}')),
  lessons: JSON.parse(localStorage.getItem('agentos.lessons') || '[]').length,
}));

// No button on the home screen: the user asks the agent for it.
async function openFromHome(page) {
  await say(page, 'agent จำอะไรไว้');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'memory');
  return page.locator('#stage .scene-memory');
}

test('memory page: edit a fact, forget a learned line, remove a kept page, then forget everything', async ({ page }) => {
  await seed(page);
  await home(page);
  await expect(page.getByTestId('memory-entry')).toHaveCount(0);
  const scene = await openFromHome(page);

  const facts = scene.getByTestId('mem-facts');
  await expect(facts.locator('.mem-row')).toHaveCount(3);
  await expect(facts).toContainText('Ploy');
  await expect(scene.getByTestId('mem-learned').locator('.mem-row')).toHaveCount(2);
  await expect(scene.getByTestId('mem-lessons')).toContainText('change only its look');
  await expect(scene.getByTestId('mem-kept').locator('.mem-row')).toHaveCount(2);
  await expect(scene.getByTestId('mem-kept')).toContainText('Packing list');

  // Edit one fact: an inline field, at most 80 characters, saved with remember().
  await scene.getByTestId('edit-btn-likes').click();
  const input = scene.getByTestId('edit-likes');
  await expect(input).toHaveValue('running');
  await expect(input).toHaveAttribute('maxlength', '80');
  await input.fill('swimming and coffee');
  await scene.getByTestId('save-likes').click();
  await expect(scene.getByTestId('edit-likes')).toHaveCount(0);
  await expect(facts.locator('[data-key=likes] .mem-value')).toHaveText('swimming and coffee');
  expect((await stored(page)).memory).toEqual({ ...FACTS, likes: 'swimming and coffee' });

  // Forget the lesson.
  await scene.getByTestId('forget-lesson-0').click();
  await expect(scene.getByTestId('mem-lessons').locator('.mem-empty')).toHaveText('ยังไม่มี');
  expect((await stored(page)).lessons).toBe(0);

  // Forget one fact.
  await scene.getByTestId('forget-last_task').click();
  await expect(facts.locator('.mem-row')).toHaveCount(2);
  expect((await stored(page)).memory).toEqual({ name: 'Ploy', likes: 'swimming and coffee' });

  // Forget one learned line.
  await scene.getByTestId('forget-learned-todo:due').click();
  await expect(scene.getByTestId('mem-learned').locator('.mem-row')).toHaveCount(1);
  await expect(scene.getByTestId('mem-learned')).not.toContainText('due dates');
  expect((await stored(page)).learned).toEqual(['todo:progress']);

  // Remove one kept page.
  await scene.getByTestId('remove-kept-packing').click();
  await expect(scene.getByTestId('mem-kept').locator('.mem-row')).toHaveCount(1);
  expect((await stored(page)).saved).toEqual(['todo']);

  // Forget everything: one confirm step on the page, no browser dialog; cancel keeps it all.
  page.on('dialog', () => { throw new Error('no browser dialog expected'); });
  await scene.getByTestId('forget-all').click();
  await expect(scene.getByTestId('forget-all-confirm')).toBeVisible();
  await scene.getByTestId('forget-all-cancel').click();
  await expect(scene.getByTestId('forget-all-confirm')).toHaveCount(0);
  expect((await stored(page)).saved).toEqual(['todo']);
  await scene.getByTestId('forget-all').click();
  await scene.getByTestId('forget-all-yes').click();
  for (const id of ['mem-facts', 'mem-learned', 'mem-lessons', 'mem-kept']) await expect(scene.getByTestId(id).locator('.mem-empty')).toHaveText('ยังไม่มี');
  await expect(scene.getByTestId('forget-all')).toHaveCount(0);
  expect(await stored(page)).toEqual({ memory: {}, learned: [], saved: [], lessons: 0 });

  // Closing folds back home like other scenes.
  await page.getByTestId('home-btn').click();
  await expectHome(page);
});

test('memory page: with the live agent connected, each change is sent as one contextual update', async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => {
    const track = { stop() {}, getSettings: () => ({}) };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [track], getAudioTracks: () => [track] });
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake', today: 'Friday 16 October 2026 (2026-10-16)' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: `
export const Conversation = { async startSession(opts) {
  const conv = { opts, sent: [], context: [], setMicMuted() {}, setVolume() {}, sendUserActivity() {}, async endSession() {},
    sendUserMessage(t) { conv.sent.push(t); }, sendContextualUpdate(t) { conv.context.push(t); } };
  window.__conv = conv;
  setTimeout(() => opts.onConnect && opts.onConnect({ conversationId: 'fake' }), 0);
  return conv;
} };` }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');

  // The live agent has no tool for the memory page yet: open it the way the presenter hotkey m does.
  await page.evaluate(() => window.agentOS.openScene('memory'));
  const scene = page.locator('#stage .scene-memory');
  const context = () => page.evaluate(() => window.__conv.context.filter((t) => t.includes('changed what you remember')));
  await scene.getByTestId('forget-likes').click();
  await expect.poll(context).toEqual(['[screen] The user changed what you remember: forgot likes.']);
  await scene.getByTestId('remove-kept-todo').click();
  await expect.poll(context).toHaveLength(2);
  expect((await context())[1]).toBe('[screen] The user changed what you remember: removed the kept page "To-do list".');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`memory page fits at ${viewport.width} px: nothing cut off, covered or out of view`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seed(page);
    await home(page);
    const scene = await openFromHome(page);
    await scene.getByTestId('edit-btn-name').click(); // the widest row: an open edit field
    await page.waitForTimeout(800); // the scene has finished growing
    if (process.env.SHOTS) await page.screenshot({ path: `tests/screenshots/memory-${viewport.width}.png` });

    const faults = await page.evaluate(() => {
      const sceneEl = document.querySelector('#stage .scene-memory');
      const bounds = sceneEl.getBoundingClientRect();
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      if (sceneEl.scrollWidth > sceneEl.clientWidth) out.push('scene scrolls sideways');
      for (const el of sceneEl.querySelectorAll('button, input, h1, h2, .mem-value, .mem-label')) {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const name = el.dataset.testid || el.textContent.slice(0, 20);
        if (r.width < 1 || r.height < 1) out.push(`${name}: no size`);
        if (r.left < bounds.left - 0.5 || r.right > bounds.right + 0.5) out.push(`${name}: cut off sideways`);
        if (r.top < 0 || r.bottom > innerHeight) out.push(`${name}: out of view`);
        if ((el.matches('button, input')) && r.height < 44) out.push(`${name}: under 44 px tall`);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!el.contains(hit)) out.push(`${name}: covered by ${hit?.className || hit?.tagName}`);
      }
      return out;
    });
    expect(faults).toEqual([]);
  });
}
