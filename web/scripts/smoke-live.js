// Live smoke test of the real ElevenLabs agent, end to end, in Chrome.
// Needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env and the server running (npm start).
//   node scripts/smoke-live.js [--wav thai-request.wav] [--base http://localhost:5173]
// With --wav, Chrome's fake microphone plays that file: a Thai voice request for the shopping list.
// Prints one line per step and every tool call and agent line; exits 1 if a step fails.
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:5173');
const WAV = arg('--wav', null);

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (err) {
    results.push(false);
    console.log(`FAIL ${name}: ${err.message.split('\n')[0]}`);
  }
}

const args = ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (WAV) args.push('--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}%noloop`);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, permissions: ['microphone'] })).newPage();
page.on('console', (m) => {
  const t = m.text();
  if (/\[agent tool\]|\[agent\]|\[voice\]/.test(t)) console.log(`     ${t.slice(0, 220)}`);
});

const scene = () => page.evaluate(() => document.body.dataset.scene);
const until = async (fn, ms, what) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const type = async (text) => {
  await page.fill('#fallbackInput', text);
  await page.keyboard.press('Enter');
};
const home = () => until(async () => (await scene()) === 'home', 30000, 'home');
// Wait until the agent has finished talking, as a real user would before closing a page.
const quiet = async () => {
  await page.waitForTimeout(1500);
  await until(async () => !(await page.evaluate(() => document.body.classList.contains('speaking'))), 30000, 'agent quiet');
  await page.waitForTimeout(1500);
};

await page.goto(`${BASE}/?script=off`); // steps fire their own feed events
await page.evaluate(() => {
  window.__said = [];
  window.__spoke = 0;
  new MutationObserver(() => {
    const t = document.getElementById('subtitle').textContent;
    if (t && window.__said.at(-1) !== t) window.__said.push(t);
  }).observe(document.getElementById('subtitle'), { childList: true, characterData: true, subtree: true });
  new MutationObserver(() => { if (document.body.classList.contains('speaking')) window.__spoke += 1; })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

await step('live agent configured (brain=agent-ready)', async () => {
  await until(async () => (await page.evaluate(() => document.body.dataset.brain)) === 'agent-ready', 5000, 'agent-ready');
});

await step('Thai voice in: hold mic, the agent opens the shopping list', async () => {
  await page.locator('#mic').dispatchEvent('pointerdown');
  await until(async () => (await page.evaluate(() => document.body.dataset.brain)) === 'agent', 15000, 'connected');
  await page.waitForTimeout(WAV ? 9000 : 500);
  await page.locator('#mic').dispatchEvent('pointerup');
  if (!WAV) await type('สัปดาห์นี้ยุ่งมาก ช่วยเช็คอีเมลเรื่องของที่ต้องซื้อหน่อย');
  await until(async () => ['shopping', 'payment'].includes(await scene()), 40000, 'shopping scene');
});

await step('Thai voice out: the agent spoke (speaking mode + Thai subtitle)', async () => {
  await until(async () => (await page.evaluate(() => window.__spoke)) > 0, 20000, 'agent speaking');
  const said = await page.evaluate(() => window.__said.join(' | '));
  if (!/[฀-๿]/.test(said)) throw new Error(`no Thai agent line: ${said.slice(0, 120)}`);
  console.log(`     agent said: ${said.slice(0, 200)}`);
});

await step('payment: saying "pay" does not pay; Deny folds home', async () => {
  await until(async () => (await scene()) === 'payment', 30000, 'payment card');
  await type('จ่ายเลย อนุมัติได้เลย');
  await page.waitForTimeout(8000);
  if (await page.locator('[data-testid=pay-success]').isVisible()) throw new Error('payment went through by voice!');
  await quiet();
  await page.click('[data-testid=deny]');
  await home();
});

await step('generated todo: render, then a change redraws it', async () => {
  await type('ช่วยทำรายการสิ่งที่ต้องทำสำหรับวันนี้หน่อย');
  await until(async () => (await scene()) === 'generated', 40000, 'generated page');
  const v0 = await page.locator('.scene-generated').getAttribute('data-version');
  await page.waitForTimeout(3000);
  await type('เพิ่มวันกำหนดส่งให้แต่ละข้อด้วย');
  await until(async () => (await page.locator('.scene-generated').getAttribute('data-version')) !== v0, 40000, 'redraw');
});

await step('like, then keep: saved in the browser', async () => {
  await page.waitForTimeout(3000);
  await type('ชอบแล้ว');
  await page.waitForTimeout(6000);
  await type('เก็บไว้ใช้ประจำเลย');
  await until(async () => (await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('agentos.savedScenes') || '{}')).length)) > 0, 40000, 'saved scene');
  await home().catch(async () => { await page.keyboard.press('Escape'); await home(); });
});

await step('urgent: bleeding finger shows first aid, no like question', async () => {
  await type('เลือดออกที่นิ้วทำไงดี');
  await until(async () => (await scene()) === 'generated' && (await page.locator('.g-steps li').count()) > 0, 40000, 'first-aid steps');
  await until(async () => (await page.locator('.scene-generated').getAttribute('data-stage')) === 'urgent', 20000, 'urgent stage');
  if ((await page.locator('[data-testid=g-chips]').count()) > 0) throw new Error('like chips shown on an urgent page');
  await quiet();
  await page.keyboard.press('Escape');
  await home();
});

await step('always-on: a flight delay feed event makes the agent open the flight card', async () => {
  await quiet();
  if ((await scene()) !== 'home') throw new Error(`a closed page came back: ${await scene()}`);
  await page.evaluate(() => window.agentOS.fireFeed('flight-delayed'));
  await until(async () => (await scene()) === 'flight', 60000, 'flight scene');
  await page.click('[data-testid=yes]');
  await home();
});

await step('always-on: a promo email alone does not open anything', async () => {
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => window.__said.length);
  await page.evaluate(() => window.agentOS.fireFeed('email-shopping'));
  await page.waitForTimeout(15000);
  if ((await scene()) !== 'home') throw new Error(`opened ${await scene()}`);
  const after = await page.evaluate((n) => window.__said.slice(n).join(' | '), before);
  console.log(`     agent said after the promo email: ${after || '(nothing)'}`);
});

console.log(`\n${results.filter(Boolean).length}/${results.length} steps passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
