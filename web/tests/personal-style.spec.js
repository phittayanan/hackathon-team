import { test, expect } from '@playwright/test';
import { home } from './helpers.js';

// The user's own design system (public/js/style.js): the block page follows it, the page model gets
// it as one line, and the memory page shows and changes it. /api/page is stubbed: no page model call.
// SHOTS=1 also saves 390 px screenshots to tests/screenshots/ for the pull request.
const LARGE_TEAL = { size: 'large', density: 'airy', accent: 'teal', contrast: 'normal', charts: 'avoid' };
const LARGE_TEAL_TEXT = 'large text, airy spacing, teal accent, avoid charts; base: Q-Bot glass design system';
const SPEC = {
  kind: 'todo', name: 'To-do list', title: 'งานวันนี้', subtitle: 'Today', accent: 'orange',
  blocks: [
    { type: 'progress', label: 'เสร็จแล้ว', value: 'auto' },
    { type: 'checklist', items: [{ text: 'ซื้อนม', done: true }, { text: 'วิ่ง 5 กม.', tag: 'high' }, { text: 'ส่งรายงาน', due: 'ศุกร์' }] },
    { type: 'card', title: 'โน้ต', text: 'อย่าลืมน้ำเปล่า' },
  ],
  proposals: [{ id: 'a', label: 'Add due dates' }],
};

async function seedStyle(page, profile) {
  await page.addInitScript((p) => {
    if (sessionStorage.getItem('styled')) return;
    localStorage.setItem('agentos.style', JSON.stringify(p));
    sessionStorage.setItem('styled', '1');
  }, profile);
}

const storedStyle = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('agentos.style') || 'null'));
const cssVar = (loc, name) => loc.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
const open = (page, design) => page.evaluate(([s, d]) => window.agentOS.openScene('generated', { spec: s, ...(d ? { design: d } : {}) }), [SPEC, design]);

async function stubPage(page) {
  const calls = [];
  await page.route('**/api/page', async (r) => {
    calls.push(r.request().postDataJSON());
    await r.fulfill({ status: 500, body: 'stub' }); // the block page stays
  });
  return calls;
}

for (const [name, profile] of [['default', null], ['large-teal', LARGE_TEAL]]) {
  test(`block page root carries the style vars (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (profile) await seedStyle(page, profile);
    await home(page);
    await open(page);
    const root = page.locator('#stage .scene-generated');
    await expect(root).toHaveAttribute('data-stage', 'review');
    await expect(root).toHaveAttribute('data-style-accent', profile ? 'own' : 'base');
    expect(await cssVar(root, '--st-body')).toBe(profile ? '18px' : '16px');
    expect(await cssVar(root, '--st-accent')).toBe(profile ? '#0f766e' : '#7655aa');
    // Default sizes stay as they were; large text scales by 1.125. A picked accent replaces the page's colour.
    const fontSize = await root.locator('.g-item').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe(profile ? '16.875px' : '15px');
    const accent = await root.locator('.g-bar i').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(accent).toBe(profile ? 'rgb(15, 118, 110)' : 'rgb(118, 85, 170)');
    await page.waitForTimeout(800); // the scene has finished growing
    if (process.env.SHOTS) await page.screenshot({ path: `tests/screenshots/style-page-${name}-390.png` });
  });
}

test('the /api/page request carries the style line', async ({ page }) => {
  await seedStyle(page, LARGE_TEAL);
  const calls = await stubPage(page);
  await home(page);
  await open(page, 'Calm checklist, big ticks.');
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].design).toBe('Calm checklist, big ticks.');
  expect(calls[0].style).toBe(LARGE_TEAL_TEXT);
  await expect(page.locator('#stage .scene-generated')).toHaveAttribute('data-view', 'blocks');
});

test('memory page: change size and accent, see the preview and storage change, then reset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  await page.getByTestId('memory-entry').click();
  const group = page.locator('#stage .scene-memory').getByTestId('mem-style');
  const preview = group.getByTestId('style-preview');
  await expect(group).toContainText('สไตล์ของคุณ');
  await expect(group.getByTestId('style-reset')).toBeDisabled();
  expect(await cssVar(preview, '--st-body')).toBe('16px');

  await group.getByTestId('style-size-large').click();
  await expect(group.getByTestId('style-size-large')).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByTestId('style-size-large')).toBeFocused();
  await expect(group.getByTestId('style-value-size')).toHaveText('ใหญ่ · Large');
  expect(await cssVar(group.getByTestId('style-preview'), '--st-body')).toBe('18px');
  expect((await storedStyle(page)).size).toBe('large');

  await group.getByTestId('style-accent-teal').click();
  await expect(group.getByTestId('style-value-accent')).toHaveText('เขียวอมฟ้า · Teal');
  expect(await cssVar(group.getByTestId('style-preview'), '--st-accent')).toBe('#0f766e');
  const btn = await group.locator('.style-preview-btn').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(btn).toBe('rgb(15, 118, 110)');
  expect(await storedStyle(page)).toMatchObject({ size: 'large', accent: 'teal' });
  await group.scrollIntoViewIfNeeded();
  if (process.env.SHOTS) await group.screenshot({ path: 'tests/screenshots/style-group-390.png' });

  await group.getByTestId('style-reset').click();
  expect(await storedStyle(page)).toBeNull();
  await expect(group.getByTestId('style-value-size')).toHaveText('ปกติ · Normal');
  expect(await cssVar(group.getByTestId('style-preview'), '--st-body')).toBe('16px');
  await expect(group.getByTestId('style-reset')).toBeDisabled();
});

test('memory page: "Forget everything" also resets the style', async ({ page }) => {
  await seedStyle(page, LARGE_TEAL);
  await home(page);
  await page.getByTestId('memory-entry').click();
  const scene = page.locator('#stage .scene-memory');
  await scene.getByTestId('forget-all').click(); // a style alone is something to forget
  await scene.getByTestId('forget-all-yes').click();
  expect(await storedStyle(page)).toBeNull();
  await expect(scene.getByTestId('style-value-accent')).toHaveText('ม่วงลาเวนเดอร์ · Lavender');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`memory page with an extra large, compact style fits at ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedStyle(page, { ...LARGE_TEAL, size: 'xlarge', density: 'compact', contrast: 'high', charts: 'ok' });
    await home(page);
    await page.getByTestId('memory-entry').click();
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'memory');
    await page.waitForTimeout(800);
    const faults = await page.evaluate(() => {
      const sceneEl = document.querySelector('#stage .scene-memory');
      const bounds = sceneEl.getBoundingClientRect();
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      if (sceneEl.scrollWidth > sceneEl.clientWidth) out.push('scene scrolls sideways');
      for (const el of sceneEl.querySelectorAll('[data-testid="mem-style"] :is(button, h2, .mem-value, .mem-label, .style-preview, .style-preview-btn)')) {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const name = el.dataset.testid || el.className || el.textContent.slice(0, 20);
        if (r.width < 1 || r.height < 1) out.push(`${name}: no size`);
        if (r.left < bounds.left - 0.5 || r.right > bounds.right + 0.5) out.push(`${name}: cut off sideways`);
        if (r.top < 0 || r.bottom > innerHeight) out.push(`${name}: out of view`);
        if (el.matches('button') && r.height < 44) out.push(`${name}: under 44 px tall`);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!el.contains(hit)) out.push(`${name}: covered by ${hit?.className || hit?.tagName}`);
      }
      return out;
    });
    expect(faults).toEqual([]);
  });
}
