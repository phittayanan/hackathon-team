import { test, expect } from '@playwright/test';
import { home, say, expectHome } from './helpers.js';

const scene = (page) => page.locator('.scene-generated');

test('todo request opens a generated page; a spoken change redraws it; folds home', async ({ page }) => {
  await home(page);
  await say(page, 'help me make a todo list');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'generated');
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('สร้างให้คุณ');
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
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('หน้าที่บันทึกไว้');
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
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('ปฐมพยาบาล');
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
    .num{font-size:88px;font-weight:900;line-height:1;color:#7a2f9a;margin:0}.num small{font-size:20px;font-weight:400;color:#6f645b;display:block}
    .ring{width:180px;margin:0 auto}.rows{background:#fffdf9;border-radius:22px;padding:6px 16px}.rows p{display:flex;justify-content:space-between;margin:12px 0}
    </style></head><body><div class="split"><h1 class="num">62%<small>ของเป้าเที่ยวญี่ปุ่น ฿40,000</small></h1>
    <svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="#efe3d0" stroke-width="4"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="#7a2f9a" stroke-width="4" stroke-dasharray="62 38"/></svg>
    <div class="rows"><p><span>เก็บแล้ว</span><b>฿24,800</b></p><p><span>ต่อเดือน</span><b>฿3,800</b></p><p><span>ถึงเป้า</span><b>ก.พ. 2027</b></p></div></div></body></html>`,
};

// The spec each sample page was written for: the layout check wants the page to show its title.
const TITLES = { beach: 'หัวหินริมทะเล', water: 'ดื่มน้ำวันนี้', savings: 'เป้าเที่ยวญี่ปุ่น' };
const SPEC = { kind: 'trip', name: 'Trip', title: TITLES.beach, accent: 'blue', blocks: [{ type: 'text', text: 'ทะเลสวย' }, { type: 'button', label: 'จองที่พักเลย' }], proposals: [{ id: 'a', label: 'Add weather' }] };
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
    await openWithBrief(page, { ...SPEC, title: TITLES[name] });
    await expect(scene(page)).toHaveAttribute('data-view', 'blocks');
    await expect(page.locator('[data-testid=g-title]')).toHaveText(TITLES[name]);
    await expect(scene(page)).toHaveAttribute('data-view', 'html');
    await expect(page.locator('[data-testid=g-title]')).toHaveCount(0);
    await expect(page.locator('[data-testid=g-chips] .g-chip')).toHaveCount(2); // the app's own like question stays
    expect(calls[0].design).toMatch(/beach-postcard/);
    expect(calls[0].spec.title).toBe(TITLES[name]);
    if (SHOTS) {
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${SHOTS}/page-${name}.png` });
    }
  }
  await expect(page.locator('[data-testid=g-html] .num')).toContainText('62%');
});

test('web search sources: the page model never gets them; the app draws the links under the model page', async ({ page }) => {
  const calls = await stubPage(page, PAGES.beach);
  await home(page);
  // The spec as render_ui passes it: validated, so only http(s) links are left (see lib/search.test.js).
  const sources = { type: 'sources', items: [{ title: 'Bangkok 10K', url: 'https://run.example/bkk' }, { title: 'Race news', url: 'http://news.example/10k' }] };
  await openWithBrief(page, { ...SPEC, blocks: [...SPEC.blocks, sources] });
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  expect(calls[0].spec.blocks.some((b) => b.type === 'sources')).toBe(false);
  const links = page.locator('[data-testid=g-sources] a');
  await expect(links).toHaveCount(2);
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['https://run.example/bkk', 'http://news.example/10k']);
});

test('model page: a <script> and an onclick are removed; the page still shows and nothing runs', async ({ page }) => {
  const evil = PAGES.beach
    .replace('</head>', '<script>window.__pwned = 1</script></head>')
    .replace('data-action="book"', 'data-action="book" onclick="window.__pwned = 2"')
    .replace('<ol', '<img src="x" onerror="window.__pwned = 3"><a href="javascript:window.__pwned=4" style="display:block;padding:12px">อ่านต่อ</a><ol');
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
  await expect(page.locator('[data-testid=g-title]')).toHaveText(TITLES.beach);

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
  await openWithBrief(page, { ...SPEC, title: TITLES.water });
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
  await tool(page, 'revise_ui', { spec_json: JSON.stringify({ ...SPEC, subtitle: '2 วัน' }) });
  await expect(scene(page)).toHaveAttribute('data-version', '1');
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  expect(calls).toHaveLength(2);
  expect(calls[1].design).toBe('Beach postcard, huge date');

  expect(await tool(page, 'keep_scene', {})).toMatch(/^kept/);
  await expectHome(page);
  expect(await tool(page, 'render_ui', { spec_json: '{"saved":"trip"}' })).toMatch(/^reopened/);
  await expect(page.locator('[data-testid=g-badge]')).toHaveText('หน้าที่บันทึกไว้');
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  await expect(page.locator('[data-testid=g-html] h1')).toContainText('หัวหิน');
  expect(calls).toHaveLength(2);
});

test('live: ticking an item or a toggle sends a silent [screen] update with the page now, never a user message', async ({ page }) => {
  const calls = await stubPage(page, PAGES.water);
  await liveHome(page);
  const list = { kind: 'water', title: 'ดื่มน้ำ', blocks: [{ type: 'checklist', items: ['ตื่นนอน 1 แก้ว', 'หลังมื้อเที่ยง'] }] };
  expect(await tool(page, 'render_ui', { spec_json: JSON.stringify(list) })).toContain('Page now shows: "ดื่มน้ำ". Checklist: 1. ตื่นนอน 1 แก้ว (not done)');
  await page.locator('.g-checklist li').nth(1).click();
  const context = () => page.evaluate(() => window.__conv.context.join('\n'));
  await expect.poll(context).toContain('[screen] The user changed the page: ticked "หลังมื้อเที่ยง". Page now shows: "ดื่มน้ำ". Checklist: 1. ตื่นนอน 1 แก้ว (not done); 2. หลังมื้อเที่ยง (done)');
  expect(await page.evaluate(() => window.__conv.sent.join('\n'))).not.toContain('หลังมื้อเที่ยง');

  // A model page: the toggle ticks the matching item in the spec; the counter is reported as is.
  await tool(page, 'revise_ui', { spec_json: JSON.stringify(list), design: 'Water tiles' });
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  expect(calls).toHaveLength(1);
  const host = page.locator('[data-testid=g-html]');
  await host.locator('[data-toggle=morning]').click();
  await expect.poll(context).toContain('ticked "ตื่นนอน 1 แก้ว". Page now shows: "ดื่มน้ำ". Checklist: 1. ตื่นนอน 1 แก้ว (done); 2. หลังมื้อเที่ยง (not done)');
  await host.locator('[aria-label=เพิ่ม]').click();
  await expect.poll(context).toContain('[screen] The user changed the page: set "cups" to 4.');
  expect(await page.evaluate(() => window.__conv.context.filter((t) => t.startsWith('[screen] The user changed')).length)).toBe(3);
});

// ---------- Lessons from mistakes (lessons.js) ----------

test('live: a tool error asks the agent for a lesson; note_lesson keeps it on the phone; the next session gets {{lessons}}', async ({ page }) => {
  await liveHome(page);
  expect(await page.evaluate(() => window.__conv.opts.dynamicVariables.lessons)).toBe('nothing yet');
  expect(await tool(page, 'render_ui', { spec_json: '{"kind":"todo",' })).toMatch(/^error: spec_json is not valid JSON/);
  const context = () => page.evaluate(() => window.__conv.context.join('\n'));
  await expect.poll(context).toContain('[lesson] A mistake just happened: the render_ui tool answered "error: spec_json is not valid JSON');
  expect(await context()).toContain('call note_lesson once');
  // Silent: a contextual update, never a user message.
  expect(await page.evaluate(() => window.__conv.sent.join('\n'))).not.toContain('[lesson]');

  const rule = 'Write spec_json as one complete JSON object and check every bracket is closed.';
  expect(await tool(page, 'note_lesson', { lesson: rule })).toBe('noted; do not mention it to the user');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentos.lessons')).map((l) => l.text))).toEqual([rule]);
  const lessonLog = await page.evaluate(() => window.__runlog.filter((e) => e.type === 'lesson').map(({ state, signal, text }) => ({ state, signal, text })));
  expect(lessonLog).toEqual([{ state: 'asked', signal: 'tool error', text: undefined }, { state: 'noted', signal: undefined, text: rule }]);

  // A new visit on the same phone: the agent starts with the lesson.
  await liveHome(page);
  expect(await page.evaluate(() => window.__conv.opts.dynamicVariables.lessons)).toBe(`1) ${rule}`);
});

// ---------- Layout check on the painted model page (page-check.js) ----------

const PACK = { kind: 'pack', name: 'Pack', title: 'จัดกระเป๋าไปทะเล', accent: 'blue', proposals: [], blocks: [{ type: 'checklist', items: [{ text: 'ครีมกันแดด' }, { text: 'ชุดว่ายน้ำ' }, { text: 'แว่นกันแดด' }] }] };
const packPage = (items, extraCss = '') => `<!doctype html><html><head><style>
  body{margin:0;padding:20px 16px 90px;background:#e8f4ff;color:#14273a}h1{font-size:32px;margin:0 0 16px}
  ul{list-style:none;padding:0;margin:0}li{min-height:48px;padding:12px;margin:0 0 8px;background:#fff;border-radius:14px}
  ${extraCss}</style></head><body><h1>จัดกระเป๋าไปทะเล</h1><p>ของที่ต้องเอาไปเที่ยวทะเลวันเสาร์นี้</p>
  <ul>${items.map((t) => `<li data-toggle="${t}">${t}</li>`).join('')}</ul></body></html>`;
const pageChecks = (page) => page.evaluate(() => window.__runlog.filter((e) => e.type === 'page_check'));

test('layout check: a model page that overlaps and drops an item goes back to the block page; log line and a silent note', async ({ page }) => {
  // The title sits on top of the first item, and "แว่นกันแดด" is missing.
  const calls = await stubPage(page, packPage(['ครีมกันแดด', 'ชุดว่ายน้ำ'], 'h1{position:absolute;top:96px;left:16px}'));
  await liveHome(page);
  await tool(page, 'render_ui', { spec_json: JSON.stringify(PACK), design: 'Beach packing list' });
  await expect.poll(() => pageChecks(page).then((x) => x.length)).toBe(1);
  await expect(scene(page)).toHaveAttribute('data-view', 'blocks');
  await expect(page.locator('[data-testid=g-title]')).toHaveText('จัดกระเป๋าไปทะเล');
  await expect(page.locator('.g-checklist li')).toHaveCount(3);
  const [line] = await pageChecks(page);
  expect(line.text).toMatch(/^\[page check\] block page kept: .*overlap: "จัดกระเป๋าไปทะเล" and "ครีมกันแดด".*missing: item "แว่นกันแดด"/);
  const context = await page.evaluate(() => window.__conv.context.join('\n'));
  expect(context).toContain('[screen] The designed page was replaced by the simple page because: overlap: ');
  expect(context).toContain('missing: item "แว่นกันแดด"');
  expect(context).not.toContain('looks like');
  expect(await tool(page, 'inspect_page', {})).toMatch(/^the simple block page is showing: .*layout check failed: overlap: .*missing: item "แว่นกันแดด"/);
  expect(await page.evaluate(() => window.__conv.sent.join('\n'))).not.toContain('replaced');
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(1); // no retry
});

test('layout check: a clean model page stays, and a kept page reopens as the model page', async ({ page }) => {
  const calls = await stubPage(page, packPage(PACK.blocks[0].items.map((i) => i.text)));
  await home(page);
  await openWithBrief(page, PACK, 'Beach packing list');
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  await page.waitForTimeout(300);
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  await say(page, 'I like it');
  await say(page, 'yes keep it');
  await expectHome(page);
  await page.evaluate(() => window.agentOS.openScene('generated', { savedKind: 'pack' }));
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  await page.waitForTimeout(300);
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  expect(await pageChecks(page)).toEqual([]);
  expect(calls).toHaveLength(1);
});

test('live: a clean model page sends a silent note of how it looks; inspect_page measures it again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubPage(page, packPage(PACK.blocks[0].items.map((i) => i.text)));
  await liveHome(page);
  expect(await tool(page, 'inspect_page', {})).toBe('error: no generated page is open');
  await tool(page, 'render_ui', { spec_json: JSON.stringify(PACK), design: 'Beach packing list' });
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  const context = () => page.evaluate(() => window.__conv.context.join('\n'));
  await expect.poll(context).toContain('[screen] The designed page (v1) looks like: Top to bottom: heading "จัดกระเป๋าไปทะเล"');
  const look = await tool(page, 'inspect_page', {});
  expect(look).toMatch(/^Phone screen, page area \d+x\d+ px, portrait\. Top to bottom: heading "จัดกระเป๋าไปทะเล", text "ของที่ต้องเอาไปเที่ยวทะเลวันเ…", list of 3 items\./);
  expect(look).toMatch(/Background white/);
  expect(look).toMatch(/Text \d+ to 32 px\./);
  expect(look).toMatch(/Layout check: passed$/);
  expect(await page.evaluate(() => window.__conv.sent.join('\n'))).not.toContain('looks like');
});

test('live: a revise lists the earlier versions; the page writer gets the phone page area, the current look and the version named', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await stubPage(page, packPage(PACK.blocks[0].items.map((i) => i.text)));
  await liveHome(page);
  await tool(page, 'render_ui', { spec_json: JSON.stringify(PACK), design: 'Blue beach packing list' });
  await expect(scene(page)).toHaveAttribute('data-view', 'html');
  await expect.poll(() => page.evaluate(() => window.__conv.context.join('\n'))).toContain('[screen] The designed page (v1) looks like');
  // On a laptop the app is a phone frame: the page area is phone sized, not the 1280 px window.
  expect(calls[0].screen.width).toBeLessThan(400);
  expect(calls[0].screen.height).toBeGreaterThan(calls[0].screen.width);
  expect(calls[0].base).toBeNull();

  const second = await tool(page, 'revise_ui', { spec_json: JSON.stringify({ ...PACK, accent: 'orange' }), design: 'Orange poster, same list' });
  expect(second).toMatch(/Versions of this page: v1 from "Blue beach packing list": heading "จัดกระเป๋าไปทะเล".*; background white, accent none, colours #e8f4ff .*; v2 \(on screen now\) from "Orange poster, same list": designed page still being written\.$/);
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1].base).toMatchObject({ v: 1, brief: 'Blue beach packing list' });
  expect(calls[1].base.palette).toContain('#e8f4ff');
  expect(calls[1].reference).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__conv.context.join('\n'))).toContain('[screen] The designed page (v2) looks like');

  // "Use the colours from the first one": the page writer gets v1 as the reference, v2 as the page being changed.
  const third = await tool(page, 'revise_ui', { spec_json: JSON.stringify(PACK), design: 'The colours of v1, this layout', like_version: '1' });
  expect(third).toMatch(/v3 \(on screen now\)/);
  await expect.poll(() => calls.length).toBe(3);
  expect(calls[2].base).toMatchObject({ v: 2 });
  expect(calls[2].reference).toMatchObject({ v: 1, brief: 'Blue beach packing list' });
  expect(calls[2].reference.look).toMatch(/colours #e8f4ff/);
});

test('live: the palette of a version is the painted colours, so named and hsl() colours reach the page writer', async ({ page }) => {
  const html = packPage(PACK.blocks[0].items.map((i) => i.text)).replace('background:#e8f4ff;color:#14273a', 'background:ivory;color:hsl(270 50% 40%)');
  const calls = await stubPage(page, html);
  await liveHome(page);
  await tool(page, 'render_ui', { spec_json: JSON.stringify(PACK), design: 'Ivory packing list' });
  await expect.poll(() => page.evaluate(() => window.__conv.context.join('\n'))).toContain('[screen] The designed page (v1) looks like');
  await tool(page, 'revise_ui', { spec_json: JSON.stringify(PACK), design: 'Bigger items, same colours' });
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1].base.palette).toEqual(expect.arrayContaining(['#fffff0', '#663399']));
});
