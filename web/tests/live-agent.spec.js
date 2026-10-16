import { test, expect } from '@playwright/test';
import { expectHome, revealHome } from './helpers.js';

// The live ElevenLabs agent path, with the SDK and the agent routes stubbed (no network, no key).
// A real smoke test with a real agent is a manual step in README.md.
const FAKE_SDK = `
export const Conversation = {
  async startSession(opts) {
    const conv = { opts, sent: [], context: [], muted: null,
      calls: [],
      setMicMuted(m) { conv.muted = m; conv.calls.push('mic:' + (m ? 'muted' : 'open')); }, sendUserMessage(t) { conv.sent.push(t); },
      setVolume({ volume }) { conv.calls.push('volume:' + volume); }, sendUserActivity() {},
      sendContextualUpdate(t) { conv.context.push(t); }, async endSession() { window.__ends = (window.__ends || 0) + 1; } };
    conv.sendUserMessage = (t) => (t.startsWith('[feed update]') ? conv.context.push(t) : conv.sent.push(t));
    window.__conv = conv;
    window.__starts = (window.__starts || 0) + 1;
    setTimeout(() => opts.onConnect && opts.onConnect({ conversationId: 'fake' }), 0);
    return conv;
  },
};`;

async function liveHome(page) {
  await page.addInitScript(() => {
    const track = { stop() {}, getSettings: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }) };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [track], getAudioTracks: () => [track] });
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await revealHome(page);
  // Hold the mic: the session starts and the mic is unmuted only while held.
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await expect.poll(() => page.evaluate(() => window.__conv?.muted)).toBe(false);
  await page.locator('#mic').dispatchEvent('pointerup');
  await expect.poll(() => page.evaluate(() => window.__conv.muted)).toBe(true);
  // Echo cancellation, noise suppression and auto gain are on, read from the real track settings, and logged.
  const mic = await page.evaluate(() => window.__runlog.find((e) => e.type === 'mic' && e.state === 'settings'));
  expect(mic).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
}

const tool = (page, name, params) => page.evaluate(([n, p]) => window.__conv.opts.clientTools[n](p), [name, params]);

test('live: scene grows while the intro is still speaking', async ({ page }) => {
  await liveHome(page);
  await page.evaluate(() => {
    window.__conv.opts.onModeChange({ mode: 'speaking' });
    window.__opening = window.__conv.opts.clientTools.open_scene({ scene: 'flight' });
  });
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight', { timeout: 1000 });
  await expect(page.locator('body')).toHaveClass(/speaking/);
  await page.evaluate(() => window.__conv.opts.onModeChange({ mode: 'listening' }));
});

test('live: session request and SDK download start together', async ({ page }) => {
  let release;
  const sdkRequested = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/agent/session', async (route) => {
    await sdkRequested;
    await route.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake' } });
  });
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', async (route) => {
    release();
    await route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK });
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  });
  await page.route('**/api/health', (route) => route.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1');
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent', { timeout: 3000 });
  await page.locator('#mic').dispatchEvent('pointerup');
});

test('live: client tools open and act on scenes; payment can never be approved by the agent', async ({ page }) => {
  await liveHome(page);
  // The agent gets the card's facts: merchant, total and each rule, so it can answer "ยอดเท่าไหร่".
  expect(await tool(page, 'open_scene', { scene: 'payment' })).toMatch(/^opened payment: Payment request to FreshMart Online, total ฿849\. Rules: Inside monthly budget passed .*Allow is enabled/);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment');
  expect(await tool(page, 'scene_action', { action: 'confirm' })).toMatch(/^refused/);
  await expect(page.locator('[data-testid=allow]')).toHaveClass(/nudge/);
  await expect(page.locator('[data-testid=pay-success]')).toBeHidden();
  expect(await tool(page, 'scene_action', { action: 'close' })).toBe('closed');
  await expectHome(page);

  expect(await tool(page, 'open_scene', { scene: 'flight' })).toMatch(/^opened flight: TG 102 BKK→CNX is delayed 2 h .*Offer: FD 3433 DMK 08:40 → CNX 09:55/);
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'flight');
  await tool(page, 'scene_action', { action: 'confirm' });
  await expect(page.locator('[data-testid=flight-done]')).toBeVisible();
  await expectHome(page);
});

test('live: the agent cannot loosen the payment rules through open_scene data', async ({ page }) => {
  await liveHome(page);
  const evil = { merchant: 'Evil Shop', total: 45000, items: [{ name: 'Gadget', qty: 1, price: 45000 }], rules: { monthlyBudgetLeft: 100000, perPaymentCap: 99999, allowedShops: ['Evil Shop'] } };
  // The agent hears which rules failed, so it can say why Allow cannot be tapped.
  expect(await tool(page, 'open_scene', { scene: 'payment', data_json: JSON.stringify(evil) })).toMatch(/^opened payment: Payment request to Evil Shop, total ฿45,000\. Rules: Inside monthly budget FAILED .*Under cap per payment FAILED .*Shop on allowed list FAILED .*Allow is disabled/);
  await expect(page.locator('[data-testid=pay-total]')).toHaveText('฿45,000');
  await expect(page.locator('.pay-rules .bad')).toHaveCount(3);
  await expect(page.locator('[data-testid=allow]')).toBeDisabled();
  await expect(page.locator('.pay-note')).toHaveText('ไม่ผ่านเงื่อนไขการชำระเงิน');
});

test('live: render, revise, mark urgent and keep generated pages', async ({ page }) => {
  await liveHome(page);
  const spec = { kind: 'packing', name: 'Packing list', title: 'Packing list', blocks: [{ type: 'checklist', items: [{ text: 'Passport' }] }, { type: 'evil' }], proposals: [{ id: 'a', label: 'Add weather' }] };
  expect(await tool(page, 'render_ui', { spec_json: JSON.stringify(spec) })).toMatch(/ask if the user likes it/);
  await expect(page.locator('[data-testid=g-title]')).toHaveText('Packing list');
  await tool(page, 'revise_ui', { spec_json: JSON.stringify({ ...spec, blocks: [{ type: 'checklist', items: [{ text: 'Passport' }, { text: 'Charger' }] }] }) });
  await expect(page.locator('.g-checklist li')).toHaveCount(2);
  expect(await tool(page, 'keep_scene', {})).toMatch(/^kept/);
  await expectHome(page);
  expect(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('agentos.savedScenes'))))).toEqual(['packing']);

  await tool(page, 'render_ui', { spec_json: JSON.stringify({ title: 'Cut finger', blocks: [{ type: 'steps', items: ['Press the cut'] }] }) });
  expect(await tool(page, 'mark_urgent', { level: 'serious' })).toBe('marked serious');
  await expect(page.locator('[data-testid=g-call]')).toHaveAttribute('href', 'tel:1669');
  await expect(page.locator('[data-testid=g-chips]')).toHaveCount(0);
  expect(await tool(page, 'keep_scene', {})).toMatch(/^refused/);
});

test('live: kept pages are told to the agent at session start and when kept, and reopen by reference', async ({ page }) => {
  await liveHome(page);
  expect(await page.evaluate(() => window.__conv.context.filter((t) => t.includes('kept earlier')))).toEqual([]);
  const spec = { kind: 'packing', name: 'Packing list', match: ['packing', 'pack'], title: 'Packing list', blocks: [{ type: 'checklist', items: [{ text: 'Passport', done: true }] }] };
  await tool(page, 'render_ui', { spec_json: JSON.stringify(spec) });
  expect(await tool(page, 'keep_scene', {})).toMatch(/^kept/);
  await expect.poll(() => page.evaluate(() => window.__conv.context.join(' '))).toContain('"Packing list" (reference: {"saved":"packing"}; words: packing, packing list, pack)');
  await expectHome(page);

  // A new visit: the session starts with the kept pages in its context.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
  await expect.poll(() => page.evaluate(() => window.__conv.context[0] || '')).toMatch(/^\[screen\] Pages the user kept earlier: "Packing list"/);

  // "Open my packing list": the agent calls render_ui with the reference; the kept page opens as saved.
  expect(await tool(page, 'render_ui', { spec_json: '{"saved":"packing"}' })).toMatch(/^reopened the kept page "Packing list"/);
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('หน้าที่บันทึกไว้');
  await expect(page.locator('[data-testid=g-title]')).toHaveText('Packing list');
  expect(await tool(page, 'render_ui', { spec_json: '{"saved":"nope"}' })).toMatch(/^error/);
});

test('live: a new session after the old one ended hears which page is open and what it shows', async ({ page }) => {
  await liveHome(page);
  const spec = { kind: 'packing', title: 'Packing list', blocks: [{ type: 'checklist', items: [{ text: 'Passport' }] }] };
  await tool(page, 'render_ui', { spec_json: JSON.stringify(spec) });
  await expect(page.locator('[data-testid=g-title]')).toHaveText('Packing list');
  // The session ends (20 s idle or the agent hangs up); the page stays open.
  await page.evaluate(() => window.__conv.opts.onDisconnect({ reason: 'agent' }));
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'asleep');
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
  await expect.poll(() => page.evaluate(() => window.__conv.context.join('\n'))).toMatch(/\[screen\] The generated page is open: "Packing list"\. .*Passport/);

  // Same for a prebuilt scene: the payment card's total and rules.
  await tool(page, 'open_scene', { scene: 'payment' });
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment');
  await page.evaluate(() => window.__conv.opts.onDisconnect({ reason: 'agent' }));
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
  await expect.poll(() => page.evaluate(() => window.__conv.context.join('\n'))).toMatch(/\[screen\] The payment page is open: Payment request to FreshMart Online, total ฿849\. Rules:/);
});

test('live: catalog results, the search error and the choose tap reach the agent', async ({ page }) => {
  const item = (id, title, seller, amount) => ({ id, title, seller, amount, currency: 'THB', description: 'Wireless', url: `https://merchant.example/${id}`, image: null });
  let calls = 0;
  await page.route('**/api/catalog', (r) => r.fulfill({ json: ++calls === 1
    ? { products: [item('a', 'Buds A', 'Shop One', 129000), item('b', 'Buds B', 'Shop Two', 99000)] }
    : { error: 'Shopify rate limited' } }));
  await liveHome(page);
  expect(await tool(page, 'open_scene', { scene: 'shopping', data_json: JSON.stringify({ catalog: true, query: 'หูฟัง', budget: 1500 }) }))
    .toBe('opened shopping: Shopify product search for "หูฟัง", budget ฿1500: searching.');
  await expect(page.locator('.catalog-product')).toHaveCount(2);
  // Results arrive as silent context, so "อันไหนถูกสุด" has an answer.
  await expect.poll(() => page.evaluate(() => window.__conv.context.find((t) => t.startsWith('[screen] Catalog results')) || ''))
    .toBe('[screen] Catalog results: Shopify product search for "หูฟัง", budget ฿1500: 2 results: 1. Buds A (Shop One) ฿1,290.00; 2. Buds B (Shop Two) ฿990.00. Choosing is not buying.');
  expect(await page.evaluate(() => window.__conv.sent.some((t) => t.includes('Catalog results')))).toBe(false);

  // The choose tap is an event the agent hears.
  await page.getByRole('button', { name: 'เลือกรายการนี้' }).nth(1).click();
  await expect.poll(() => page.evaluate(() => window.__conv.sent.find((t) => t.startsWith('[scene event]')) || ''))
    .toBe('[scene event] The user chose "Buds B" from Shop Two at ฿990.00 on the catalog page. Choosing is not buying; nothing was ordered.');

  // A failed search is told too.
  await page.getByRole('button', { name: 'ค้นสินค้า', exact: true }).click();
  await expect(page.locator('.scene-shopping [role=status]')).toContainText('Shopify rate limited');
  await expect.poll(() => page.evaluate(() => window.__conv.context.find((t) => t.startsWith('[screen] Catalog search failed')) || ''))
    .toBe('[screen] Catalog search failed: Shopify product search for "หูฟัง", budget ฿1500: the search failed: Shopify rate limited.');
});

test('live: typed text goes to the agent, and feed changes arrive as contextual updates', async ({ page }) => {
  await liveHome(page);
  await page.fill('#fallbackInput', 'this week is hectic');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__conv.sent)).toEqual(['this week is hectic']);
  // The health facts arrive once, silently, at session start, so a sleep ask gets its own page.
  expect(await page.evaluate(() => window.__conv.context.filter((t) => t.startsWith("[screen] The user's health feed")))).toEqual([
    expect.stringMatching(/sleep score 86, 7 h 40 m asleep, resting heart rate 54 bpm\. Run plan this week: Today Easy 5 km/),
  ]);
  // The offline router must not open anything by itself in live mode.
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'home');
  // The agent answers (this ends the thinking state; feed updates wait while the agent thinks).
  await page.evaluate(() => window.__conv.opts.onMessage({ source: 'ai', message: 'ok' }));

  // Finish the fake reply before checking feeds: thinking deliberately blocks interruptions.
  await page.evaluate(() => window.__conv.opts.onMessage({ source: 'ai', message: 'Ready.' }));
  await page.evaluate(() => window.agentOS.fireFeed('flight-delayed'));
  await expect.poll(() => page.evaluate(() => window.__conv.context.join(' ')), { timeout: 5000 }).toContain('delayed 120 minutes');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'home');
});

test('live: a feed update waits while the user is typing, then says why and what the user is doing', async ({ page }) => {
  await liveHome(page);
  await page.locator('#fallbackInput').click();
  await page.fill('#fallbackInput', 'half a sent');
  await expect.poll(() => page.evaluate(() => document.getElementById('fallbackInput')?.value.trim() !== '')).toBe(true);
  await page.evaluate(() => window.agentOS.fireFeed('flight-delayed'));
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__conv.context.filter((t) => t.startsWith('[feed update]')))).toEqual([]);
  await page.fill('#fallbackInput', '');
  await page.locator('#fallbackInput').blur();
  await expect.poll(() => page.evaluate(() => window.__conv.context.find((t) => t.startsWith('[feed update]')) || ''), { timeout: 5000 })
    .toMatch(/clashes.*Urgency: high\. User now: on the agent home, no page open; not typing; not speaking; last interaction \d+ s ago\./);
});

test('live: one voice - app lines go through the agent; pressing the mic silences the agent before the mic opens', async ({ page }) => {
  await liveHome(page);
  // A scene line while live: sent to the agent to say, never played locally.
  await tool(page, 'open_scene', { scene: 'payment' });
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'payment');
  await page.click('[data-testid=deny]');
  await expect.poll(() => page.evaluate(() => window.__conv.sent.join(' '))).toContain('[scene event: pay_denied]');
  const local = await page.evaluate(() => window.__runlog.filter((e) => e.type === 'audio_start' && e.source !== 'agent').length);
  expect(local).toBe(0);
  await page.evaluate(() => window.__conv.opts.onModeChange({ mode: 'listening' })); // the agent said it
  await expectHome(page);

  // The agent is talking; the user presses the mic: volume 0 first, then the mic opens.
  await page.evaluate(() => { window.__conv.calls = []; window.__conv.opts.onModeChange({ mode: 'speaking' }); });
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect.poll(() => page.evaluate(() => window.__conv.calls)).toEqual(['volume:0', 'mic:open']);
  await page.evaluate(() => window.__conv.opts.onModeChange({ mode: 'listening' })); // the server cut the turn
  await expect.poll(() => page.evaluate(() => window.__conv.calls.at(-1))).toBe('volume:1');
  await page.locator('#mic').dispatchEvent('pointerup');
});

test('live speed: the SDK loads at boot, the signed URL is fetched on the first touch and reused by the first turn', async ({ page }) => {
  let sessions = 0;
  let sdkLoaded = false;
  await page.addInitScript(() => {
    const track = { stop() {}, getSettings: () => ({}) };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [track], getAudioTracks: () => [track] });
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => { sessions += 1; r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake' } }); });
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => { sdkLoaded = true; r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }); });
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await expect.poll(() => sdkLoaded).toBe(true);
  expect(sessions).toBe(0); // page load alone spends no session
  await revealHome(page);
  await page.locator('#fallbackInput').focus();
  await expect.poll(() => sessions).toBe(1);
  await page.fill('#fallbackInput', 'this week is hectic');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await expect.poll(() => page.evaluate(() => window.__conv.sent)).toEqual(['this week is hectic']);
  expect(sessions).toBe(1);
});

test('live: a blocked mic says offline mode in one line; a typed request still opens a page', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await revealHome(page);
  await page.locator('#fallbackInput').fill('นิ้วโดนมีดบาด เลือดไหลไม่หยุด');
  await page.locator('#fallbackInput').press('Enter');
  await expect(page.locator('[data-testid=notice]')).toBeVisible();
  await expect(page.locator('[data-testid=notice]')).toContainText('ไมค์');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'keywords');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated');
  // Home stays reachable below the notice.
  const [notice, home] = await Promise.all(['#notice', '#homeBtn'].map((s) => page.locator(s).boundingBox()));
  expect(home.y).toBeGreaterThanOrEqual(notice.y + notice.height);
});

test('live: a mic prompt nobody answers does not swallow typed text; the offline brain answers', async ({ page }) => {
  // Typing starts the live agent, which asks for the mic. A judge who only types may never answer.
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await page.locator('#fallbackInput').fill('ช่วยทำ to-do list ให้หน่อย');
  await page.locator('#fallbackInput').press('Enter');
  // The typed words show at once, while the live agent is still starting.
  await expect(page.locator('#subtitle')).toContainText('to-do list', { timeout: 1000 });
  await expect(page.locator('body')).toHaveClass(/thinking/);
  // The page does not wait for the mic forever: the offline brain answers.
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated', { timeout: 10_000 });
});

test('live: the mascot thinks from a typed request until the agent answers', async ({ page }) => {
  await liveHome(page);
  await page.locator('#fallbackInput').fill('หางานวิ่ง 10K');
  await page.locator('#fallbackInput').press('Enter');
  await expect(page.locator('body')).toHaveClass(/thinking/);
  await page.evaluate(() => window.__conv.opts.onMessage({ source: 'ai', message: 'ขอหาให้แป๊บนะ' }));
  await expect(page.locator('body')).not.toHaveClass(/thinking/);
});

// Credit saver (web/public/js/session-limits.js): 20 s without the user or 3 minutes ends the session.
test('live: 20 s without the user ends the session; the page sleeps; feeds do not wake it; the mic wakes it', async ({ page }) => {
  await page.clock.install();
  await liveHome(page);
  // A feed update is not the user: it does not keep the session alive.
  await page.evaluate(() => window.__conv.opts.onMessage({ source: 'ai', message: 'Ready.' }));
  await page.clock.fastForward(12000);
  await page.evaluate(() => window.agentOS.fireFeed('flight-delayed'));
  await page.clock.fastForward(9000);
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'asleep');
  expect(await page.evaluate(() => window.__ends)).toBe(1);
  expect(await page.evaluate(() => window.__runlog.find((e) => e.type === 'live_end'))).toMatchObject({ why: 'idle' });
  await expect(page.locator('#micHint')).toContainText('หลับอยู่');

  // Asleep: another feed update never starts a session by itself.
  await page.evaluate(() => window.agentOS.fireFeed('sleep-synced'));
  await page.clock.fastForward(30000);
  expect(await page.evaluate(() => window.__starts)).toBe(1);
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'asleep');

  // The user calls: holding the mic starts a new session.
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  expect(await page.evaluate(() => window.__starts)).toBe(2);
  await expect(page.locator('#micHint')).not.toContainText('หลับอยู่');
  await page.locator('#mic').dispatchEvent('pointerup');
});

test('live: a session ends at 3 minutes even while the user keeps talking; a mascot tap wakes it', async ({ page }) => {
  await page.clock.install();
  await liveHome(page);
  // Speech every 15 s up to 165 s keeps the idle timer reset; the 3 minute cap still ends it.
  for (let s = 0; s < 165; s += 15) {
    await page.evaluate(() => window.__conv.opts.onMessage({ source: 'user', message: 'still here' }));
    await page.clock.fastForward(15000);
    await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  }
  await page.evaluate(() => window.__conv.opts.onMessage({ source: 'user', message: 'still here' }));
  await page.clock.fastForward(16000);
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'asleep');
  expect(await page.evaluate(() => window.__runlog.find((e) => e.type === 'live_end'))).toMatchObject({ why: 'time' });

  await page.locator('#mascotWrap').click();
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  expect(await page.evaluate(() => window.__starts)).toBe(2);
});

test('live: the agent hanging up (silence or max duration) also leaves the page asleep, not offline', async ({ page }) => {
  await liveHome(page);
  await page.evaluate(() => window.__conv.opts.onDisconnect({ reason: 'agent' }));
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'asleep');
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
});
