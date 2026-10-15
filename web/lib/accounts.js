// Several ElevenLabs accounts, each a teammate's own, so the demo lasts longer than one credit.
// ELEVENLABS_API_KEYS: the keys, comma separated (falls back to the single ELEVENLABS_API_KEY).
// No agent ids in env: each account's agents are found by name (AGENT_NAME, PAGE_AGENT_NAME), which agent-sync
// creates in every account on each production deploy. The id is cached in memory and in the usage
// store (Upstash when configured). So a new teammate key needs only the env list and a redeploy.
// The server uses the first account with credit. When ElevenLabs answers out of credit (or the page
// reports a live call cut for credit), that account is marked empty for the UTC day in the usage
// store and the next one is used, for that call and the later ones.
import { createHash } from 'node:crypto';
import { storeFor, today } from './usage.js';
import { AGENT_NAME, PAGE_AGENT_NAME } from '../agent/config.js';

const API = 'https://api.elevenlabs.io/v1/convai';
const AGENT_CACHE_SECS = 6 * 3600;
const MISS_RETRY_MS = 60_000; // a key with no agent yet is looked up again after a minute

// id: a short hash of the key, safe to send to the page and to log. Never print the key itself.
export const accountId = (apiKey) => createHash('sha256').update(`agentos:${apiKey}`).digest('hex').slice(0, 10);
export const maskKey = (key = '') => (key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-2)}` : '…');

export function parseKeys(env = process.env) {
  const keys = String(env.ELEVENLABS_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
  if (!keys.length && env.ELEVENLABS_API_KEY) keys.push(env.ELEVENLABS_API_KEY);
  return [...new Set(keys)];
}

// The agent in this account with exactly this name (a "[test: ...]" agent never matches).
export async function findAgentId(apiKey, name = AGENT_NAME, fetchImpl = fetch) {
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ search: name, page_size: '100', ...(cursor ? { cursor } : {}) });
    const res = await fetchImpl(`${API}/agents?${q}`, { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`list agents ${res.status}`);
    const body = await res.json();
    const hit = (body.agents || []).find((a) => a.name === name && !a.archived);
    if (hit) return hit.agent_id;
    if (!body.has_more || !body.next_cursor) return null;
    cursor = body.next_cursor;
  }
  return null;
}

// The env for one call: the shared settings (voice, model) with this account's key and agent.
export const envFor = (env, account) => ({ ...env, ELEVENLABS_API_KEY: account.apiKey, ELEVENLABS_AGENT_ID: account.agentId || '' });

export function outOfCreditError() {
  const err = new Error('every ElevenLabs account is out of credit');
  err.outOfCredit = true;
  return err;
}

// need: 'agent' (signed URL: the account's live agent), 'page' (the account's page writer agent)
// or 'key' (TTS: the key only).
export function createAccounts({ env = process.env, store = storeFor(env), now = () => new Date(), fetchImpl = (...a) => fetch(...a) } = {}) {
  const list = parseKeys(env).map((apiKey) => ({ apiKey, id: accountId(apiKey) }));
  // The single-key setup may still pin its agent with ELEVENLABS_AGENT_ID (and test agents need it).
  const pinned = !env.ELEVENLABS_API_KEYS && env.ELEVENLABS_AGENT_ID ? env.ELEVENLABS_AGENT_ID : null;
  const agents = new Map(); // id -> { agentId, until }
  const emptyKey = (a) => `agentos:${today(now())}:empty:${a.id}`;

  async function agentFor(a, need = 'agent') {
    if (pinned && need === 'agent') return pinned;
    const name = need === 'page' ? PAGE_AGENT_NAME : AGENT_NAME;
    const memo = agents.get(`${need}:${a.id}`);
    if (memo && memo.until > Date.now()) return memo.agentId;
    const cacheKey = need === 'page' ? `agentos:page-agent:${a.id}` : `agentos:agent:${a.id}`;
    let agentId = null;
    try {
      agentId = await store.getText?.(cacheKey);
    } catch { /* lookup below */ }
    if (!agentId) {
      try {
        agentId = await findAgentId(a.apiKey, name, fetchImpl);
      } catch (err) {
        console.warn(`[accounts] account ${a.id}: agent lookup failed (${err.message})`);
      }
      if (agentId) await store.setText?.(cacheKey, agentId, AGENT_CACHE_SECS)?.catch?.(() => {});
    }
    agents.set(`${need}:${a.id}`, { agentId, until: Date.now() + (agentId ? AGENT_CACHE_SECS * 1000 : MISS_RETRY_MS) });
    return agentId;
  }

  async function emptyIds() {
    if (!list.length) return new Set();
    try {
      const marks = await store.get(list.map(emptyKey));
      return new Set(list.filter((_, i) => marks[i] > 0).map((a) => a.id));
    } catch {
      return new Set(); // a store outage must not stop the demo
    }
  }

  async function markEmpty(id, where = '') {
    const a = list.find((x) => x.id === id);
    if (!a) return false;
    console.warn(`[accounts] account ${a.id} out of credit${where ? ` (${where})` : ''}; using the next one`);
    try {
      await store.incr([emptyKey(a)]);
    } catch { /* best effort */ }
    return true;
  }

  return {
    ready: () => list.length > 0,
    count: () => list.length,
    markEmpty,
    async allEmpty() {
      const empty = await emptyIds();
      return list.length > 0 && list.every((a) => empty.has(a.id));
    },
    // Runs fn(account) on the first account with credit (and, for 'agent' or 'page', that agent); on out of
    // credit, marks it and tries the next. An account without an agent yet is skipped, not marked.
    async run(need, fn, where = '') {
      const empty = await emptyIds();
      let noAgent = 0;
      for (const a of list) {
        if (empty.has(a.id)) continue;
        const agentId = need === 'key' ? null : await agentFor(a, need);
        if (need !== 'key' && !agentId) { noAgent++; continue; }
        try {
          return await fn({ ...a, agentId });
        } catch (err) {
          if (!err.outOfCredit) throw err;
          await markEmpty(a.id, where);
        }
      }
      if (noAgent) throw new Error('no agent found in the accounts with credit (run agent-sync)');
      throw outOfCreditError();
    },
  };
}
