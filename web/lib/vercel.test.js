import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers } from './handlers.js';
import { createUsage, memoryStore } from './usage.js';
import { isOutOfCredit } from './tts.js';
import health from '../api/health.js';
import routeFn from '../api/route.js';
import tts from '../api/tts.js';
import session from '../api/agent/session.js';

function call(fn, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      statusCode: 0,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { resolve({ status: this.statusCode, type: this.headers['content-type'], json: data && this.headers['content-type'] === 'application/json' ? JSON.parse(data) : null }); },
    };
    const req = { method, headers, url: '/api/x', body, async *[Symbol.asyncIterator]() {} };
    fn(req, res);
  });
}

test('handlers check the daily limit before any ElevenLabs call, and say offline', async () => {
  let called = false;
  const env = { ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'a', USAGE_SESSIONS_PER_DAY: '0', USAGE_CALLS_PER_DAY: '0' };
  const app = createHandlers({ env, inlineImages: true, usage: createUsage({ env, store: memoryStore() }) });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw new Error('no network in tests'); };
  try {
    assert.deepEqual(await app.session({}), { live: false, reason: 'daily site limit reached', offline: 'limit' });
    await assert.rejects(() => app.tts({}, { text: 'x' }), (err) => err.status === 429 && err.extra.offline === 'limit');
    // Pictures are made ahead of time (no ElevenLabs call), so the limit does not stop them.
    assert.deepEqual(await app.image({}, { prompt: 'x' }), { url: '/pics/default.png' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(called, false);
  assert.deepEqual(await app.health(), { brain: 'elevenlabs-agent', tts: true, search: false, page: true, offline: 'limit' });
});

test('ElevenLabs out of credit -> offline: credit', async () => {
  const env = { ELEVENLABS_API_KEY: 'k', ELEVENLABS_AGENT_ID: 'a' };
  const app = createHandlers({ env, inlineImages: true, usage: createUsage({ env, store: memoryStore() }) });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '{"detail":{"status":"quota_exceeded","message":"This request exceeds your quota"}}' });
  try {
    assert.deepEqual(await app.session({}), { live: false, reason: 'ElevenLabs credit ran out', offline: 'credit' });
    await assert.rejects(app.tts({}, { text: 'x' }), (err) => err.status === 429 && err.extra.offline === 'credit');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(isOutOfCredit(401, 'invalid api key'), false);
});

test('Vercel functions: health, route with a parsed body, method check', async () => {
  const h = await call(health);
  assert.equal(h.status, 200);
  assert.equal(h.json.brain === 'keywords' || h.json.brain === 'elevenlabs-agent', true);

  const r = await call(routeFn, { method: 'POST', body: { text: 'this week is hectic' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.scene, 'shopping');
  assert.equal((await call(routeFn, { method: 'GET' })).status, 405);

  // The shared handlers read process.env when first made; without a key, TTS is 503 and the session is offline.
  assert.equal((await call(tts, { method: 'POST', body: { text: 'x' } })).status, process.env.ELEVENLABS_API_KEY ? 200 : 503);
  const s = await call(session, { headers: {} });
  assert.equal(s.status, 200);
  assert.equal(typeof s.json.live, 'boolean');
});
