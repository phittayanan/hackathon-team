import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamPage, pagePrompt, SYSTEM_PROMPT, PAGE_MODEL, PICTURES } from './page-model.js';
import { createHandlers, HttpError } from './handlers.js';
import { createUsage, memoryStore } from './usage.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SPEC = { kind: 'trip', title: 'ทริปหัวหิน', accent: 'blue', blocks: [{ type: 'text', text: 'ทะเลสวย' }, { type: 'button', label: 'จองเลย' }], proposals: [] };
const sse = (...texts) => texts.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\r\n\r\n`).join('');
const answer = (body, status = 200) => ({ ok: status === 200, status, body: (async function* () { for (const c of body) yield new TextEncoder().encode(c); })() });
const collect = async (it) => { let s = ''; for await (const p of it) s += p; return s; };

test('streamPage: calls Gemini with the key in a header, joins the streamed text, drops a ``` fence', async () => {
  let call;
  const fetchImpl = async (url, opts) => {
    call = { url, opts };
    const text = sse('```html\n<!doctype html><html><bo', 'dy><h1>หัวหิน</h1></body></html>\n```');
    return answer([text.slice(0, 40), text.slice(40)]); // an event split across chunks
  };
  const html = await collect(await streamPage({ spec: SPEC, design: 'Postcard from the sea' }, { GEMINI_API_KEY: 'k' }, { fetchImpl }));
  assert.equal(html, '<!doctype html><html><body><h1>หัวหิน</h1></body></html>\n```');
  assert.equal(call.url, `https://generativelanguage.googleapis.com/v1beta/models/${PAGE_MODEL}:streamGenerateContent?alt=sse`);
  assert.equal(call.opts.headers['x-goog-api-key'], 'k');
  assert.ok(!call.url.includes('k&') && !call.url.includes('key='));
  const body = JSON.parse(call.opts.body);
  assert.equal(body.systemInstruction.parts[0].text, SYSTEM_PROMPT);
  assert.match(body.contents[0].parts[0].text, /Postcard from the sea/);
});

test('the prompts: varied layouts, app tokens, Thai first, 44 px, AA, app pictures, data-action', () => {
  for (const want of ['Make every page look different', '--accent', 'Thai text first', '44 px', 'WCAG AA', 'data-action', 'data-toggle', 'data-count', 'No <script>']) {
    assert.ok(SYSTEM_PROMPT.includes(want), want);
  }
  for (const path of Object.keys(PICTURES)) assert.ok(SYSTEM_PROMPT.includes(path));
  const p = pagePrompt({ ...SPEC, blocks: [...SPEC.blocks, { type: 'image', prompt: 'beach' }] }, 'Bold poster');
  assert.match(p, /Bold poster/);
  assert.match(p, /จองเลย/);
  assert.ok(!p.includes('beach'));
});

test('streamPage: an error status throws a short reason', async () => {
  await assert.rejects(streamPage({ spec: SPEC }, { GEMINI_API_KEY: 'k' }, { fetchImpl: async () => answer([], 429) }), /rate limited/);
  await assert.rejects(streamPage({ spec: SPEC }, { GEMINI_API_KEY: 'k' }, { fetchImpl: async () => answer([], 403) }), /key not valid/);
});

const app = (fetchImpl, env = { GEMINI_API_KEY: 'k' }, extra = {}) =>
  createHandlers({ env, fetchImpl, imagesDir: join(tmpdir(), 'agentos-page-test'), usage: createUsage({ env, store: memoryStore() }), ...extra });

test('/api/page: no key 503; urgent spec never sent; bad spec 400', async () => {
  let called = 0;
  const fetchImpl = async () => (called++, answer([sse('<html></html>')]));
  await assert.rejects(app(fetchImpl, {}).page({}, { spec: SPEC }), (e) => e instanceof HttpError && e.status === 503);
  await assert.rejects(app(fetchImpl).page({}, { spec: { ...SPEC, urgency: 'urgent' } }), (e) => e.status === 400);
  await assert.rejects(app(fetchImpl).page({}, { spec: { blocks: [] } }), (e) => e.status === 400);
  assert.equal(called, 0);
});

test('/api/page: counted as a paid call; the daily limit gives 429 offline: limit', async () => {
  const env = { GEMINI_API_KEY: 'k', USAGE_CALLS_PER_VISITOR: '1' };
  const a = app(async () => answer([sse('<html><body>ok</body></html>')]), env);
  assert.equal(await collect(await a.page({ 'x-real-ip': '1.2.3.4' }, { spec: SPEC, design: 'x' })), '<html><body>ok</body></html>');
  await assert.rejects(a.page({ 'x-real-ip': '1.2.3.4' }, { spec: SPEC }), (e) => e.status === 429 && e.extra.offline === 'limit');
});

test('/api/page: the time limit ends the text early (the browser keeps the block page)', async () => {
  const fetchImpl = async (url, { signal }) => ({
    ok: true,
    status: 200,
    body: (async function* () {
      yield new TextEncoder().encode(sse('<html><body><h1>Half'));
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    })(),
  });
  const t0 = Date.now();
  const text = await collect(await app(fetchImpl, undefined, { timeoutMs: 50 }).page({}, { spec: SPEC }));
  assert.equal(text, '<html><body><h1>Half');
  assert.ok(Date.now() - t0 < 1000);
});

test('/api/page: a model that does not answer in time is a 504', async () => {
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(app(fetchImpl, undefined, { timeoutMs: 30 }).page({}, { spec: SPEC }), (e) => e.status === 504 && /timeout/.test(e.message));
});
