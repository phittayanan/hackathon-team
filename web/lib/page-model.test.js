import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamPage, pagePrompt, SYSTEM_PROMPT, PICTURES } from './page-model.js';
import { createHandlers, HttpError } from './handlers.js';
import { createAccounts } from './accounts.js';
import { createUsage, memoryStore } from './usage.js';
import { PAGE_AGENT_NAME, AGENT_NAME } from '../agent/config.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SPEC = { kind: 'trip', title: 'ทริปหัวหิน', accent: 'blue', blocks: [{ type: 'text', text: 'ทะเลสวย' }, { type: 'button', label: 'จองเลย' }], proposals: [] };
const QUOTA = '{"detail":{"status":"quota_exceeded","message":"This request exceeds your quota"}}';
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const collect = async (it) => { let s = ''; for await (const p of it) s += p; return s; };
const parts = (...texts) => texts.map((text) => ({ type: 'agent_chat_response_part', text_response_part: { type: 'delta', text } }));
const reply = (text) => ({ type: 'agent_response', agent_response_event: { agent_response: text, event_id: 1 } });

// A stubbed ElevenLabs: signed URLs (keys in `empty` are out of credit) and the agent list. No network.
function fakeFetch({ empty = [], pageAgents = { k: 'page_k' } } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const key = opts.headers?.['xi-api-key'];
    const u = new URL(String(url));
    calls.push({ path: u.pathname, key, agent: u.searchParams.get('agent_id') });
    if (u.pathname === '/v1/convai/agents') {
      const id = pageAgents[key];
      return res(200, { agents: [{ agent_id: 'live', name: AGENT_NAME }, ...(id ? [{ agent_id: id, name: PAGE_AGENT_NAME }] : [])], has_more: false });
    }
    if (empty.includes(key)) return res(401, QUOTA);
    if (u.pathname.endsWith('get-signed-url')) return res(200, { signed_url: `wss://eleven.test/${u.searchParams.get('agent_id')}?token=${key}` });
    return res(404, {});
  };
  return { calls, fetchImpl };
}

// A stubbed conversation WebSocket. script(sock) runs after the user message; `silent` never sends the metadata.
function fakeSocket({ script = (sock) => sock.emit(...parts('<html>'), reply('<html>')), silent = false, closeBefore = null } = {}) {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.closed = false;
      this.listeners = {};
      sockets.push(this);
      setTimeout(() => (closeBefore ? this.fire('close', { code: 1008, reason: closeBefore }) : this.fire('open', {})), 0);
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, e) { for (const fn of this.listeners[type] || []) fn(e); }
    emit(...events) { for (const ev of events) if (!this.closed) this.fire('message', { data: JSON.stringify(ev) }); }
    send(text) {
      const msg = JSON.parse(text);
      this.sent.push(msg);
      if (msg.type === 'conversation_initiation_client_data' && !silent) setTimeout(() => this.emit({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'c1' } }), 0);
      if (msg.type === 'user_message') setTimeout(() => script(this), 0);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.fire('close', { code: 1000, reason: '' });
    }
  }
  return { sockets, WebSocketImpl: FakeWebSocket };
}

const ENV = { ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'page_k' };

test('streamPage: a signed URL from the server, one user message, streamed text parts joined, ``` fence dropped, closed', async () => {
  const fetch = fakeFetch();
  const ws = fakeSocket({
    script: (sock) => sock.emit({ type: 'ping', ping_event: { event_id: 7, ping_ms: 0 } }, ...parts('```html\n<!doctype html><html><bo', 'dy><h1>หัวหิน</h1></body></html>\n```'), reply('ignored, already streamed')),
  });
  const html = await collect(await streamPage({ spec: SPEC, design: 'Postcard from the sea' }, ENV, { fetchImpl: fetch.fetchImpl, WebSocketImpl: ws.WebSocketImpl }));
  assert.equal(html, '<!doctype html><html><body><h1>หัวหิน</h1></body></html>\n```');
  assert.deepEqual(fetch.calls.map((c) => [c.path, c.key, c.agent]), [['/v1/convai/conversation/get-signed-url', 'k', 'page_k']]);
  const [sock] = ws.sockets;
  assert.match(sock.url, /^wss:\/\/eleven\.test\/page_k/);
  assert.deepEqual(sock.sent.map((m) => m.type), ['conversation_initiation_client_data', 'user_message', 'pong']);
  assert.deepEqual(sock.sent.find((m) => m.type === 'pong'), { type: 'pong', event_id: 7 });
  const user = sock.sent.find((m) => m.type === 'user_message');
  assert.match(user.text, /Postcard from the sea/);
  assert.match(user.text, /จองเลย/);
  assert.equal(sock.closed, true);
});

test('streamPage: no text parts -> the whole agent_response is the page', async () => {
  const ws = fakeSocket({ script: (sock) => sock.emit(reply('<html><body>ok</body></html>')) });
  assert.equal(await collect(await streamPage({ spec: SPEC }, ENV, { fetchImpl: fakeFetch().fetchImpl, WebSocketImpl: ws.WebSocketImpl })), '<html><body>ok</body></html>');
});

test('streamPage: out of credit (signed URL or a quota close before the start) is marked outOfCredit', async () => {
  await assert.rejects(streamPage({ spec: SPEC }, ENV, { fetchImpl: fakeFetch({ empty: ['k'] }).fetchImpl, WebSocketImpl: fakeSocket().WebSocketImpl }), (e) => e.outOfCredit === true);
  await assert.rejects(streamPage({ spec: SPEC }, ENV, { fetchImpl: fakeFetch().fetchImpl, WebSocketImpl: fakeSocket({ closeBefore: 'quota exceeded' }).WebSocketImpl }), (e) => e.outOfCredit === true);
  await assert.rejects(streamPage({ spec: SPEC }, ENV, { fetchImpl: fakeFetch().fetchImpl, WebSocketImpl: fakeSocket({ closeBefore: 'bye' }).WebSocketImpl }), (e) => !e.outOfCredit && /closed 1008/.test(e.message));
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

function app({ env = { ELEVENLABS_API_KEY: 'k' }, fetch = fakeFetch(), ws = fakeSocket(), ...extra } = {}) {
  return createHandlers({
    env, fetchImpl: fetch.fetchImpl, WebSocketImpl: ws.WebSocketImpl, imagesDir: join(tmpdir(), 'agentos-page-test'),
    usage: createUsage({ env, store: memoryStore() }), accounts: createAccounts({ env, store: memoryStore(), fetchImpl: fetch.fetchImpl }), ...extra,
  });
}

test('/api/page: no key 503; urgent spec never sent; bad spec 400', async () => {
  const fetch = fakeFetch();
  const ws = fakeSocket();
  await assert.rejects(app({ env: {}, fetch, ws }).page({}, { spec: SPEC }), (e) => e instanceof HttpError && e.status === 503);
  await assert.rejects(app({ fetch, ws }).page({}, { spec: { ...SPEC, urgency: 'urgent' } }), (e) => e.status === 400);
  await assert.rejects(app({ fetch, ws }).page({}, { spec: { blocks: [] } }), (e) => e.status === 400);
  assert.equal(fetch.calls.length + ws.sockets.length, 0);
});

test('/api/page: counted as a paid call; the daily limit gives 429 offline: limit', async () => {
  const env = { ELEVENLABS_API_KEY: 'k', USAGE_CALLS_PER_VISITOR: '1' };
  const a = app({ env, ws: fakeSocket({ script: (sock) => sock.emit(reply('<html><body>ok</body></html>')) }) });
  assert.equal(await collect(await a.page({ 'x-real-ip': '1.2.3.4' }, { spec: SPEC, design: 'x' })), '<html><body>ok</body></html>');
  await assert.rejects(a.page({ 'x-real-ip': '1.2.3.4' }, { spec: SPEC }), (e) => e.status === 429 && e.extra.offline === 'limit');
});

test('/api/page: key rotation like the live agent: an account out of credit is skipped for the next one', async () => {
  const env = { ELEVENLABS_API_KEYS: 'key-anna-1234567,key-ben-7654321' };
  const fetch = fakeFetch({ empty: ['key-anna-1234567'], pageAgents: { 'key-anna-1234567': 'page_a', 'key-ben-7654321': 'page_b' } });
  const ws = fakeSocket();
  assert.equal(await collect(await app({ env, fetch, ws }).page({}, { spec: SPEC })), '<html>');
  assert.deepEqual(ws.sockets.map((s) => new URL(s.url).pathname), ['/page_b']);
  assert.ok(fetch.calls.some((c) => c.path.endsWith('get-signed-url') && c.agent === 'page_a'));
});

test('/api/page: an account without the page writer agent -> 502 (the browser keeps the block page)', async () => {
  await assert.rejects(app({ fetch: fakeFetch({ pageAgents: {} }) }).page({}, { spec: SPEC }), (e) => e.status === 502 && /agent-sync/.test(e.message));
});

test('/api/page: the time limit ends the text early and closes the conversation (the browser keeps the block page)', async () => {
  const ws = fakeSocket({ script: (sock) => sock.emit(...parts('<html><body><h1>Half')) });
  const t0 = Date.now();
  const text = await collect(await app({ ws, timeoutMs: 80 }).page({}, { spec: SPEC }));
  assert.equal(text, '<html><body><h1>Half');
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(ws.sockets[0].closed, true);
});

test('/api/page: a page writer that does not start in time is a 504', async () => {
  const ws = fakeSocket({ silent: true });
  await assert.rejects(app({ ws, timeoutMs: 50 }).page({}, { spec: SPEC }), (e) => e.status === 504 && /timeout/.test(e.message));
  assert.equal(ws.sockets[0].closed, true);
});

test('pagePrompt: the user\'s design system is one line right after the brief, cut to 200 characters', () => {
  const p = pagePrompt(SPEC, 'Bold poster', 'large text, teal accent; base: Q-Bot glass design system').split('\n');
  assert.match(p[0], /^Design brief: Bold poster/);
  assert.equal(p[1], "User's design system: large text, teal accent; base: Q-Bot glass design system");
  assert.equal(pagePrompt(SPEC, 'x', 'y'.repeat(500)).split('\n')[1].length, "User's design system: ".length + 200);
  assert.ok(!pagePrompt(SPEC, 'Bold poster').includes("User's design system"));
});

test('/api/page: the style line reaches the page writer; only a string, cut to 200 characters', async () => {
  const userText = async (style) => {
    const ws = fakeSocket();
    await collect(await app({ ws }).page({}, { spec: SPEC, design: 'x', style }));
    return ws.sockets[0].sent.find((m) => m.type === 'user_message').text;
  };
  assert.match(await userText('airy spacing, rose accent; base: Q-Bot glass design system'), /\nUser's design system: airy spacing, rose accent; base: Q-Bot glass design system\n/);
  assert.match(await userText('z'.repeat(400)), new RegExp(`User's design system: z{200}\\n`));
  assert.ok(!(await userText({ size: 'large' })).includes("User's design system"));
  assert.ok(!(await userText(undefined)).includes("User's design system"));
});
