import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys, createAccounts, accountId, maskKey } from './accounts.js';
import { createHandlers } from './handlers.js';
import { createUsage, memoryStore } from './usage.js';
import { syncAll } from '../scripts/agent-sync.js';
import { AGENT_NAME, KNOWLEDGE_NAME, PAGE_AGENT_NAME } from '../agent/config.js';
import { isOutOfCredit } from './tts.js';
import { ACCOUNT_BLOCKED } from '../public/js/account-blocked.js';

const ANNA = 'key-anna-1234567';
const BEN = 'key-ben-7654321';
const QUOTA = '{"detail":{"status":"quota_exceeded","message":"This request exceeds your quota"}}';
// The exact message of a workspace blocked mid-day (2026-10-16).
const RESTRICTED = '[account_restricted] This workspace is restricted from the free tier. Upgrade your plan to start a new conversation.';
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => new Uint8Array([1]).buffer });

// A stubbed ElevenLabs, one agent per key (by name); keys in `empty` are out of credit. No network.
function fakeEleven({ empty = [], agents = { [ANNA]: 'agent_a', [BEN]: 'agent_b' }, emptyStatus = 401, emptyBody = QUOTA } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const key = opts.headers?.['xi-api-key'];
    const u = new URL(String(url));
    calls.push({ path: u.pathname, key, method: opts.method || 'GET' });
    if (u.pathname === '/v1/convai/agents') {
      const id = agents[key];
      return res(200, { agents: [{ agent_id: 'other', name: `${AGENT_NAME} [test: x]` }, ...(id ? [{ agent_id: id, name: AGENT_NAME }] : [])], has_more: false });
    }
    if (empty.includes(key)) return res(emptyStatus, emptyBody);
    if (u.pathname.endsWith('get-signed-url')) return res(200, { signed_url: `wss://x/${u.searchParams.get('agent_id')}` });
    return res(200, {});
  };
  return { calls, fetchImpl };
}

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake.fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

function app(env, fake) {
  return createHandlers({ env, inlineImages: true, usage: createUsage({ env, store: memoryStore() }), accounts: createAccounts({ env, store: memoryStore(), fetchImpl: fake.fetchImpl }) });
}

test('keys: the comma list wins, else the single ELEVENLABS_API_KEY; ids and masks never show the key', () => {
  assert.deepEqual(parseKeys({ ELEVENLABS_API_KEYS: ` ${ANNA}, ${BEN},,${ANNA}`, ELEVENLABS_API_KEY: 'x' }), [ANNA, BEN]);
  assert.deepEqual(parseKeys({ ELEVENLABS_API_KEY: 'k' }), ['k']);
  assert.deepEqual(parseKeys({}), []);
  assert.match(accountId(ANNA), /^[a-f0-9]{10}$/);
  assert.equal(maskKey('sk_1234567890abcdef'), 'sk_1…ef');
});

test('rotation: each key finds its agent by name; the first runs out, this call and later ones use the next', async () => {
  const env = { ELEVENLABS_API_KEYS: `${ANNA},${BEN}` };
  const fake = fakeEleven({ empty: [ANNA] });
  const a = app(env, fake);
  await withFetch(fake, async () => {
    const s = await a.session({});
    assert.equal(s.live, true);
    assert.equal(s.signedUrl, 'wss://x/agent_b'); // the exact name, never the "[test: ...]" agent
    assert.equal(s.account, accountId(BEN));
    assert.equal(JSON.stringify(s).includes('key-'), false); // the key never reaches the page
    fake.calls.length = 0;
    await a.tts({}, { text: 'สวัสดี' });
    assert.deepEqual(fake.calls.map((c) => c.key), [BEN]); // the empty account is skipped at once
    fake.calls.length = 0;
    await a.session({});
    assert.equal(fake.calls.some((c) => c.path === '/v1/convai/agents'), false); // agent id cached
  });
  assert.equal((await a.health()).offline, null);
});

test('a blocked workspace (account_restricted) counts as out of credit, whatever the status', () => {
  for (const status of [400, 401, 403, 500]) assert.equal(isOutOfCredit(status, RESTRICTED), true);
  assert.equal(isOutOfCredit(403, 'restricted from the free tier'), true);
  assert.equal(isOutOfCredit(401, 'UPGRADE YOUR PLAN'), true);
  assert.equal(isOutOfCredit(403, 'forbidden'), false);
  // The page's live agent (live-agent.js) uses the same pattern on the close reason and on errors.
  assert.equal(ACCOUNT_BLOCKED.test(RESTRICTED), true);
  assert.equal(ACCOUNT_BLOCKED.test('the line dropped'), false);
});

for (const status of [401, 403]) {
  test(`rotation: a blocked workspace (${status} account_restricted) is marked and the next key is used, for the session and TTS`, async () => {
    const env = { ELEVENLABS_API_KEYS: `${ANNA},${BEN}` };
    const fake = fakeEleven({ empty: [ANNA], emptyStatus: status, emptyBody: RESTRICTED });
    const a = app(env, fake);
    await withFetch(fake, async () => {
      const s = await a.session({});
      assert.equal(s.live, true);
      assert.equal(s.account, accountId(BEN));
      fake.calls.length = 0;
      await a.tts({}, { text: 'สวัสดี' });
      assert.deepEqual(fake.calls.map((c) => c.key), [BEN]); // the blocked account is skipped at once
    });
    assert.equal((await a.health()).offline, null);
  });
}

test('rotation: a blocked workspace on TTS first (the 401 seen today) moves TTS to the next key', async () => {
  const env = { ELEVENLABS_API_KEYS: `${ANNA},${BEN}` };
  const fake = fakeEleven({ empty: [ANNA], emptyBody: RESTRICTED });
  const a = app(env, fake);
  await withFetch(fake, async () => {
    await a.tts({}, { text: 'สวัสดี' });
    assert.deepEqual(fake.calls.map((c) => c.key), [ANNA, BEN]);
  });
});

test('rotation: every account empty -> offline credit, in the call and in health', async () => {
  const fake = fakeEleven({ empty: [ANNA, BEN] });
  const a = app({ ELEVENLABS_API_KEYS: `${ANNA},${BEN}` }, fake);
  await withFetch(fake, async () => {
    assert.deepEqual(await a.session({}), { live: false, reason: 'ElevenLabs credit ran out', offline: 'credit' });
    await assert.rejects(a.tts({}, { text: 'x' }), (err) => err.status === 429 && err.extra.offline === 'credit');
  });
  assert.equal((await a.health()).offline, 'credit');
});

test('rotation: a new key without its agent yet is skipped (not marked empty); the page can report a cut call', async () => {
  const fake = fakeEleven({ agents: { [BEN]: 'agent_b' } });
  const a = app({ ELEVENLABS_API_KEYS: `${ANNA},${BEN}` }, fake);
  await withFetch(fake, async () => {
    const first = await a.session({});
    assert.equal(first.signedUrl, 'wss://x/agent_b');
    // Ben's live call is cut for credit: no account with an agent is left.
    const next = await a.session({ 'x-agentos-spent': first.account });
    assert.equal(next.live, false);
    assert.match(next.reason, /no agent found/);
  });
});

test('the single-key setup keeps its pinned ELEVENLABS_AGENT_ID, with no lookup', async () => {
  const fake = fakeEleven();
  const a = app({ ELEVENLABS_API_KEY: ANNA, ELEVENLABS_AGENT_ID: 'pinned' }, fake);
  await withFetch(fake, async () => assert.equal((await a.session({})).signedUrl, 'wss://x/pinned'));
  assert.equal(fake.calls.some((c) => c.path === '/v1/convai/agents'), false);
});

test('the empty mark lasts for the UTC day only', async () => {
  let now = new Date('2026-10-16T10:00:00Z');
  const accounts = createAccounts({ env: { ELEVENLABS_API_KEYS: `${ANNA},${BEN}` }, store: memoryStore(), now: () => now });
  await accounts.markEmpty(accountId(ANNA));
  assert.equal(await accounts.run('key', async (x) => x.apiKey), BEN);
  now = new Date('2026-10-17T00:01:00Z');
  assert.equal(await accounts.run('key', async (x) => x.apiKey), ANNA);
});

test('agent-sync: creates the agents where they are missing, updates it where found; a failing account is skipped, masked', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const key = opts.headers['xi-api-key'];
    const u = new URL(String(url));
    calls.push(`${key.slice(4, 8)} ${opts.method || 'GET'} ${u.pathname}`);
    if (key === 'key-bad-0000000') return res(403, `missing permission for ${key}`);
    if (u.pathname === '/v1/convai/agents') return res(200, { agents: key === ANNA ? [{ agent_id: 'agent_a', name: AGENT_NAME }, { agent_id: 'page_a', name: PAGE_AGENT_NAME }] : [], has_more: false });
    if (u.pathname === '/v1/convai/tools' && opts.method === 'GET') return res(200, { tools: [{ id: 'tool_open', tool_config: { name: 'open_scene' } }], has_more: false });
    if (u.pathname === '/v1/convai/tools') return res(200, { id: 'tool_new' });
    if (u.pathname === '/v1/convai/knowledge-base' && key === ANNA) return res(200, { documents: [{ id: 'kb_old', name: `${KNOWLEDGE_NAME} 0123456789ab` }, { id: 'kb_mine', name: `${KNOWLEDGE_NAME} [notes]` }], has_more: false });
    if (u.pathname === '/v1/convai/knowledge-base') return res(200, { documents: [], has_more: false });
    if (u.pathname === '/v1/convai/knowledge-base/text') return res(200, { id: 'kb_new' });
    if (u.pathname === '/v1/convai/agents/create') return res(200, { agent_id: JSON.parse(opts.body).name === PAGE_AGENT_NAME ? 'page_new' : 'agent_new' });
    return res(200, {});
  };
  const logs = [];
  const warns = [];
  const out = await syncAll([ANNA, 'key-bad-0000000', BEN], { strict: false, fetchImpl, log: (m) => logs.push(m), warn: (m) => warns.push(m) });
  assert.deepEqual(out.map((r) => [r.ok, r.agentId, r.pageAgentId]), [[true, 'agent_a', 'page_a'], [false, undefined, undefined], [true, 'agent_new', 'page_new']]);
  // The page writer: found by its exact name and updated, or created; text only, no tools.
  assert.ok(calls.includes('anna PATCH /v1/convai/agents/page_a'));
  assert.equal(calls.filter((c) => c === 'ben- POST /v1/convai/agents/create').length, 2);
  assert.ok(calls.includes('anna PATCH /v1/convai/agents/agent_a'));
  assert.ok(calls.includes('anna PATCH /v1/convai/tools/tool_open')); // its own tool updated, not duplicated
  assert.ok(calls.includes('ben- POST /v1/convai/agents/create'));
  assert.equal(calls.some((c) => c.startsWith('ben- PATCH /v1/convai/tools')), false);
  // The fact sheet: uploaded per account; only an older fact sheet (name + hash) is deleted, after the agent update.
  assert.ok(calls.includes('ben- POST /v1/convai/knowledge-base/text'));
  assert.ok(calls.indexOf('anna DELETE /v1/convai/knowledge-base/kb_old') > calls.indexOf('anna PATCH /v1/convai/agents/agent_a'));
  assert.equal(calls.includes('anna DELETE /v1/convai/knowledge-base/kb_mine'), false);
  const printed = [...logs, ...warns, JSON.stringify(out)].join('\n');
  assert.equal(/key-(anna|ben|bad)-\d+/.test(printed), false, 'a key was printed');
  assert.match(warns[0], /skipped/);
});
