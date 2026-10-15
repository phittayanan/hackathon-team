import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';
import { checkRun } from '../scripts/log-check.js';

const runlog = (page) => page.evaluate(() => window.__runlog);
const first = (events, pred) => events.find(pred);

test('interrupting while TTS is loading prevents late audio from playing', async ({ page }) => {
  let release;
  await page.route('**/api/health', (route) => route.fulfill({ json: { brain: 'keywords', tts: true } }));
  await page.route('**/api/tts', async (route) => {
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ contentType: 'audio/mpeg', body: Buffer.from('test') });
  });
  await page.addInitScript(() => {
    window.__plays = 0;
    window.Audio = class { play() { window.__plays++; return Promise.reject(new Error('unexpected late audio')); } };
  });
  await page.goto('/?script=off');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await page.evaluate(async () => { const { speak } = await import('/js/voice.js'); window.__pendingSpeech = speak({ text: 'Test delayed notification' }); });
  await expect.poll(() => typeof release).toBe('function');
  await page.evaluate(async () => { const { interruptAll } = await import('/js/voice.js'); interruptAll(); });
  release();
  await page.evaluate(() => window.__pendingSpeech);
  expect(await page.evaluate(() => window.__plays)).toBe(0);
  await expect(page.locator('body')).not.toHaveClass(/speaking/);
});

test('scene opens promptly after speech starts at normal demo speed', async ({ page }) => {
  await page.goto('/?mute=1&script=off');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  const ms = await page.evaluate(() => new Promise((resolve) => {
    const started = performance.now();
    const watch = new MutationObserver(() => {
      if (document.body.dataset.scene !== 'shopping') return;
      watch.disconnect();
      resolve(performance.now() - started);
    });
    watch.observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
    window.agentOS.handleUserText('this week is hectic');
  }));
  expect(ms).toBeLessThan(700);
});

test('speak first, then act: the intro starts before the scene grows; one voice at a time', async ({ page }) => {
  await home(page, { presenter: true });
  await say(page, 'this week is hectic');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment', { timeout: 10_000 });
  await page.click('[data-testid=allow]');
  await expectHome(page);
  const events = await runlog(page);
  const intro = first(events, (e) => e.type === 'audio_start' && e.id === 'shop_intro');
  const opened = first(events, (e) => e.type === 'scene_open' && e.name === 'shopping');
  expect(intro.t).toBeLessThan(opened.t);
  const r = checkRun(events);
  expect(r.flags.filter((f) => ['overlap', 'scene before speech'].includes(f.kind))).toEqual([]);
});

test('speak first offline for every scene: proactive, generated and urgent', async ({ page }) => {
  await home(page, { presenter: true });
  await page.keyboard.press('f');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight');
  await page.keyboard.press('Escape');
  await expectHome(page);
  await say(page, 'help me make a todo list');
  await expect(page.locator('.g-checklist li')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await say(page, 'my finger is bleeding');
  await expect(page.locator('.g-steps li')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expectHome(page);
  const r = checkRun(await runlog(page));
  expect(r.flags.filter((f) => ['overlap', 'scene before speech'].includes(f.kind))).toEqual([]);
  // The todo asks its question only after it has grown, after the intro.
  const events = await runlog(page);
  const ask = first(events, (e) => e.type === 'audio_start' && e.id === 'gen_ask');
  const grown = first(events, (e) => e.type === 'scene_open' && e.name === 'generated');
  expect(ask.t).toBeGreaterThan(grown.t);
});

test('greeting: the first tap greets once, never again; the tap hint goes away', async ({ page }) => {
  await home(page, { presenter: true });
  await expect(page.locator('[data-testid=tap-hint]')).toBeVisible();
  await page.mouse.click(200, 200);
  await expect(page.locator('[data-testid=tap-hint]')).toBeHidden();
  await expect(page.locator('#subtitle')).toContainText('วันนี้มีอะไรให้ช่วยไหม');
  await page.mouse.click(200, 220);
  await page.mouse.click(200, 240);
  await page.waitForTimeout(600);
  const greets = (await runlog(page)).filter((e) => e.type === 'audio_start' && e.id === 'greet');
  expect(greets).toHaveLength(1);
});

test('pressing the mic stops the agent voice at once', async ({ page }) => {
  await home(page, { presenter: true });
  await page.keyboard.press('f'); // the agent starts its flight line
  await expect(page.locator('body')).toHaveClass(/speaking/);
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).not.toHaveClass(/speaking/);
  await page.locator('#mic').dispatchEvent('pointerup');
  const events = await runlog(page);
  const down = first(events, (e) => e.type === 'mic' && e.state === 'down');
  const end = first(events, (e) => e.type === 'audio_end' && e.id === 'flight_intro');
  expect(end.t - down.t).toBeLessThan(150);
});
