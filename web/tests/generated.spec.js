import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';

const scene = (page) => page.locator('.scene-generated');

test('todo request opens a generated page; a spoken change redraws it; folds home', async ({ page }) => {
  await home(page);
  await say(page, 'help me make a todo list');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated');
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('Generated for you');
  await expect(page.locator('.g-checklist li')).toHaveCount(5);
  await expect(page.locator('[data-testid=g-chips] .g-chip')).toHaveCount(3);
  await expect(page.locator('.g-due')).toHaveCount(0);

  await say(page, 'add due dates');
  await expect(scene(page)).toHaveAttribute('data-version', '1');
  await expect(page.locator('.g-due')).toHaveCount(5);

  // Tapping a proposal chip works like saying it.
  await page.click('.g-chip:has-text("Add a progress bar")');
  await expect(page.locator('[data-testid=g-progress]')).toBeVisible();
  await page.locator('.g-checklist li').first().click();
  await expect(page.locator('[data-testid=g-progress] b')).toHaveText('20%');

  await page.keyboard.press('Escape');
  await expectHome(page);
});

test('like it, keep it, then a second todo request opens the saved scene with no generation', async ({ page }) => {
  await home(page);
  await say(page, 'make me a to-do list');
  await expect(page.locator('.g-checklist li')).toHaveCount(5);
  await say(page, 'add due dates');
  await expect(page.locator('.g-due')).toHaveCount(5);
  await say(page, 'I like it');
  await expect(scene(page)).toHaveAttribute('data-stage', 'keep');
  await say(page, 'yes keep it');
  await expectHome(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentos.savedScenes')));
  expect(Object.keys(saved)).toEqual(['todo']);

  const routed = page.waitForResponse('**/api/route');
  await say(page, 'todo list for tomorrow');
  const res = await (await routed).json();
  expect(res.via).toBe('saved');
  expect(res.data).toEqual({ savedKind: 'todo' });
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('Saved scene');
  await expect(page.locator('.g-due')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expectHome(page);
});

test('no thanks on keep closes without saving', async ({ page }) => {
  await home(page);
  await say(page, 'todo list');
  await expect(page.locator('.g-checklist li')).toHaveCount(5);
  await say(page, 'perfect');
  await expect(scene(page)).toHaveAttribute('data-stage', 'keep');
  await say(page, 'no thanks');
  await expectHome(page);
  expect(await page.evaluate(() => localStorage.getItem('agentos.savedScenes'))).toBeNull();
});

test('urgent: bleeding finger shows first-aid steps at once, a 1669 button, no like question', async ({ page }) => {
  await home(page);
  await say(page, 'เลือดผมออกที่นิ้วทำไงดี');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated');
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('First aid');
  await expect(page.locator('.g-steps li')).toHaveCount(4);
  await expect(page.locator('[data-testid=g-call]')).toHaveAttribute('href', 'tel:1669');
  await expect(page.locator('[data-testid=g-chips]')).toHaveCount(0);
  await expect(scene(page)).toHaveAttribute('data-stage', 'urgent');
  await expect(page.locator('#subtitle')).not.toContainText('ชอบ');
  await say(page, 'I like it');
  await expectHome(page);
  expect(await page.evaluate(() => localStorage.getItem('agentos.savedScenes'))).toBeNull();
});

test('image block: grey frame at once; on an error the frame stays with an icon', async ({ page }) => {
  await page.route('**/api/image', (r) => r.fulfill({ json: { error: 'empty prompt' } }));
  await home(page);
  await page.evaluate(() => window.agentOS.openScene('generated', {
    spec: { kind: 'trip', title: 'Trip', accent: 'blue', blocks: [{ type: 'image', prompt: 'beach at sunset', caption: 'Hua Hin' }, { type: 'text', text: 'Pack light' }], proposals: [] },
  }));
  await expect(page.locator('[data-testid=g-image]')).toBeVisible();
  await expect(page.locator('[data-testid=g-image] figcaption')).toHaveText('Hua Hin');
  await expect(page.locator('[data-testid=g-image]')).toHaveClass(/failed/);
});

test('image block: a picture made ahead of time, picked by the prompt, with no key', async ({ page }) => {
  await home(page);
  await page.evaluate(() => window.agentOS.openScene('generated', {
    spec: { kind: 'trip', title: 'Trip', blocks: [{ type: 'image', prompt: 'airplane over the beach' }], proposals: [] },
  }));
  await expect(page.locator('[data-testid=g-image]')).toHaveClass(/loaded/);
  await expect(page.locator('[data-testid=g-image] img')).toHaveAttribute('src', '/pics/travel.png');
});

test('image block: picture fades in when the server returns one', async ({ page }) => {
  await page.route('**/api/image', (r) => r.fulfill({ json: { url: '/img/race.svg' } }));
  await home(page);
  await page.evaluate(() => window.agentOS.openScene('generated', {
    spec: { kind: 'run', title: 'Run', blocks: [{ type: 'image', prompt: 'runner' }], proposals: [] },
  }));
  await expect(page.locator('[data-testid=g-image]')).toHaveClass(/loaded/);
});

// ---------- Free HTML pages from the page model (POST /api/page stubbed; no key, no network) ----------

const SHOTS = process.env.PAGE_SHOTS; // a folder: save phone-width screenshots of the sample pages there

const PAGES = {
  beach: `<!doctype html><html><head><style>
    body{margin:0;background:linear-gradient(180deg,#ffd9a8,#ff9f7a 55%,#3b6fb6 55%);color:#20160f}
    .hero{padding:28px 20px 8px}.hero small{font-weight:700;letter-spacing:.08em;color:#5a2c12}
    .hero h1{font-size:44px;line-height:1.05;margin:6px 0}.date{font-size:64px;font-weight:800;color:#fff;text-shadow:0 2px 0 #b24a2a}
    .day{background:#fffdf9;margin:16px;border-radius:22px;padding:16px}.day li{padding:8px 0;border-left:4px solid #ff7a59;padding-left:12px;list-style:none}
    button{min-height:48px;width:calc(100% - 32px);margin:0 16px 90px;border:0;border-radius:16px;background:#20160f;color:#fff;font-size:18px}
    </style></head><body><section class="hero"><small>ทริปสุดสัปดาห์</small><h1>หัวหิน<br>ริมทะเล</h1><div class="date">24 ต.ค.</div></section>
    <ol class="day"><li>07:00 ออกจากกรุงเทพ</li><li>10:30 คาเฟ่ริมหาด</li><li>16:00 ตลาดโต้รุ่ง</li></ol>
    <button data-action="book" data-value="hua-hin">จองที่พักเลย</button></body></html>`,
  water: `<!doctype html><html><head><style>
    body{margin:0;background:#0f2a3d;color:#e9f6ff}.wrap{padding:22px 16px 90px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
    h1{grid-column:1/-1;margin:0;font-size:30px}.tile{background:#173d57;border-radius:18px;padding:14px;min-height:96px}
    .big{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;font-size:20px}
    .big span{font-size:56px;font-weight:800;color:#7fd3ff}.big button{min-width:56px;min-height:56px;border-radius:50%;border:0;font-size:28px;background:#7fd3ff;color:#0f2a3d}
    .tile[data-on="true"]{background:#23a26d}
    </style></head><body><main class="wrap"><h1>ดื่มน้ำวันนี้ 💧</h1>
    <div class="tile big"><button data-count-step="cups" data-step="-1" aria-label="ลด">−</button><span data-count="cups">3</span><button data-count-step="cups" data-step="1" aria-label="เพิ่ม">+</button></div>
    <div class="tile" data-toggle="morning">ตื่นนอน 1 แก้ว</div><div class="tile" data-toggle="lunch">หลังมื้อเที่ยง</div>
    <div class="tile">เป้าหมาย 8 แก้ว</div><div class="tile">เหลืออีก 5 แก้ว</div></main></body></html>`,
  savings: `<!doctype html><html><head><style>
    body{margin:0;background:#f6efe4;color:#2b2420}.split{display:flex;flex-direction:column;gap:16px;padding:24px 18px 90px}
    .num{font-size:88px;font-weight:900;line-height:1;color:#7a2f9a}.num small{font-size:20px;color:#6f645b;display:block}
    .ring{width:180px;margin:0 auto}.rows{background:#fffdf9;border-radius:22px;padding:6px 16px}.rows p{display:flex;justify-content:space-between;margin:12px 0}
    </style></head><body><div class="split"><div class="num">62%<small>ของเป้าเที่ยวญี่ปุ่น ฿40,000</small></div>
    <svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="#efe3d0" stroke-width="4"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="#7a2f9a" stroke-width="4" stroke-dasharray="62 38"/></svg>
    <div class="rows"><p><span>เก็บแล้ว</span><b>฿24,800</b></p><p><span>ต่อเดือน</span><b>฿3,800</b></p><p><span>ถึงเป้า</span><b>ก.พ. 2027</b></p></div></div></body></html>`,
};

const SPEC = { kind: 'trip', name: 'Trip', title: 'ทริปหัวหิน', accent: 'blue', blocks: [{ type: 'text', text: 'ทะเลสวย' }, { type: 'button', label: 'จองที่พักเลย' }], proposals: [{ id: 'a', label: 'Add weather' }] };
const openWithBrief = (page, spec = SPEC, design = 'Sunny beach-postcard hero, big date, timeline, big Book button.') =>
  page.evaluate(([s, d]) => window.agentOS.openScene('generated', { spec: s, design: d }), [spec, design]);
// Stub the page model: answer with this HTML after `delay` ms. Returns the list of request bodies.
async function stubPage(page, html, { delay = 0, status = 200 } = {}) {
  const calls = [];
  await page.route('**/api/page', async (r) => {
    calls.push(r.request().postDataJSON());
    if (delay) await new Promise((res) => setTimeout(res, delay));
    await r.fulfill({ status, contentType: 'text/plain; charset=utf-8', body: html }).catch(() => {});
  });
  return calls;
}

test('design brief: the block page shows at once, then the model page swaps in (three different pages)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, html] of Object.entries(PAGES)) {
    await page.unrouteAll();
    const calls = await stubPage(page, html, { delay: 250 });
    await home(page);
    await openWithBrief(page);
    await expect(scene(page)).toHaveAttribute('data-view', 'blocks');
    await expect(page.locator('[data-testid=g-title]')).toHaveText('ทริปหัวหิน');
    await expect(scene(page)).toHaveAttribute('data-view', 'html');
    await expect(page.locator('[data-testid=g-title]')).toHaveCount(0);
    await expect(page.locator('[data-testid=g-chips] .g-chip')).toHaveCount(2); // the app's own like question stays
    expect(calls[0].design).toMatch(/beach-postcard/);
    expect(calls[0].spec.title).toBe('ทริปหัวหิน');
    if (SHOTS) {
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${SHOTS}/page-${name}.png` });
    }
  }
  await expect(page.locator('[data-testid=g-html] .num')).toContainText('62%');
});

test('model page: a <script> and an onclick are removed; the page still shows and nothing runs', async ({ page }) => {
  const evil = PAGES.beach
    .replace('</head>', '<script>window.__pwned = 1</script></head>')
    .replace('data-action="book"', 'data-action="book" onclick="window.__pwned = 2"')
    .replace('<ol', '<img src="x" onerror="window.__pwned = 3"><a href="javascript:window.__pwned=4">x</a><ol');
  await stubPage(page, evil);
  await home(page);
  await openWithBrief(page);
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  const host = page.locator('[data-testid=g-html]');
  await expect(host.locator('h1')).toContainText('หัวหิน');
  const inner = await host.evaluate((el) => el.shadowRoot.innerHTML);
  expect(inner).not.toMatch(/<script|onclick|onerror|javascript:|href/);
  await host.locator('button[data-action=book]').click();
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('model page: a timeout, an error, an unfinished page or an urgent spec keep the block page', async ({ page }) => {
  // Timeout: the browser stops waiting (14 s, 20x shorter in test mode).
  await stubPage(page, PAGES.beach, { delay: 3000 });
  await home(page);
  await openWithBrief(page);
  await page.waitForTimeout(1500);
  await expect(scene(page)).toHaveAttribute('data-view', 'blocks');
  await expect(page.locator('[data-testid=g-title]')).toHaveText('ทริปหัวหิน');

  for (const [html, status] of [['{"error":"no ElevenLabs key"}', 503], [PAGES.beach.slice(0, 600), 200]]) {
    await page.unrouteAll();
    await stubPage(page, html, { status });
    await home(page);
    await openWithBrief(page);
    await page.waitForTimeout(500);
    await expect(scene(page)).toHaveAttribute('data-view', 'blocks');
  }

  await page.unrouteAll();
  const calls = await stubPage(page, PAGES.beach);
  await home(page);
  await openWithBrief(page, { ...SPEC, urgency: 'urgent', blocks: [{ type: 'steps', items: ['กดแผลให้แน่น'] }] });
  await page.waitForTimeout(500);
  await expect(scene(page)).toHaveAttribute('data-view', 'blocks');
  expect(calls).toHaveLength(0);
});

test('model page offline (no live agent): data-action works like saying its label; toggles and counters work', async ({ page }) => {
  await stubPage(page, PAGES.water);
  await home(page);
  await openWithBrief(page);
  const host = page.locator('[data-testid=g-html]');
  await host.locator('[aria-label=เพิ่ม]').click();
  await host.locator('[aria-label=เพิ่ม]').click();
  await host.locator('[aria-label=ลด]').click();
  await expect(host.locator('[data-count=cups]')).toHaveText('4');
  await host.locator('[data-toggle=morning]').click();
  await expect(host.locator('[data-toggle=morning]')).toHaveAttribute('data-on', 'true');
});

// The live agent, faked (same shape as tests/live-agent.spec.js).
const FAKE_SDK = `
export const Conversation = {
  async startSession(opts) {
    const conv = { opts, sent: [], context: [], setMicMuted() {}, setVolume() {}, sendUserActivity() {},
      sendUserMessage(t) { conv.sent.push(t); }, sendContextualUpdate(t) { conv.context.push(t); }, async endSession() {} };
    window.__conv = conv;
    setTimeout(() => opts.onConnect && opts.onConnect({ conversationId: 'fake' }), 0);
    return conv;
  },
};`;
async function liveHome(page) {
  await page.addInitScript(() => {
    const track = { stop() {}, getSettings: () => ({}) };
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [track], getAudioTracks: () => [track] });
  });
  await page.route('**/api/health', (r) => r.fulfill({ json: { brain: 'elevenlabs-agent', tts: false } }));
  await page.route('**/api/agent/session', (r) => r.fulfill({ json: { live: true, signedUrl: 'wss://example.invalid/fake' } }));
  await page.route('https://cdn.jsdelivr.net/npm/@elevenlabs/client@*/+esm', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent-ready');
  await page.locator('#mic').dispatchEvent('pointerdown');
  await expect(page.locator('body')).toHaveAttribute('data-brain', 'agent');
  await page.locator('#mic').dispatchEvent('pointerup');
}
const tool = (page, name, params) => page.evaluate(([n, p]) => window.__conv.opts.clientTools[n](p), [name, params]);

test('live: render_ui with a design brief; a data-action tap reaches the agent as a scene event; a kept page reopens with no new call', async ({ page }) => {
  const calls = await stubPage(page, PAGES.beach);
  await liveHome(page);
  await tool(page, 'render_ui', { spec_json: JSON.stringify(SPEC), design: 'Beach postcard, huge date' });
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  expect(calls[0].design).toBe('Beach postcard, huge date');
  await page.locator('[data-testid=g-html] button[data-action=book]').click();
  await expect.poll(() => page.evaluate(() => window.__conv.sent.join('\n'))).toContain(
    '[scene event] The user tapped "จองที่พักเลย" on the page (action: book, value: hua-hin).',
  );

  // A revise draws the block page at once and asks for a new model page with the same brief.
  await tool(page, 'revise_ui', { spec_json: JSON.stringify({ ...SPEC, title: 'ทริปหัวหิน 2 วัน' }) });
  await expect(scene(page)).toHaveAttribute('data-version', '1');
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  expect(calls).toHaveLength(2);
  expect(calls[1].design).toBe('Beach postcard, huge date');

  expect(await tool(page, 'keep_scene', {})).toMatch(/^kept/);
  await expectHome(page);
  expect(await tool(page, 'render_ui', { spec_json: '{"saved":"trip"}' })).toMatch(/^reopened/);
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('Saved scene');
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  await expect(page.locator('[data-testid=g-html] h1')).toContainText('หัวหิน');
  expect(calls).toHaveLength(2);
});
