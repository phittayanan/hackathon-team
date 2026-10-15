// Create or update the ElevenLabs agents from agent/config.js in every account: the live agent
// (with its tools and fact sheet) and the text-only page writer.
// Usage: npm run agent:sync              (every key in ELEVENLABS_API_KEYS, else ELEVENLABS_API_KEY;
//                                          each key needs the Agents write permission)
//        npm run agent:sync -- --dry-run (prints what it would send; no API call)
//        npm run agent:sync -- --auto    (the Vercel build: syncs only when VERCEL_ENV=production;
//                                          a failing account is a masked warning, never a failed deploy)
//        npm run agent:sync -- --env ../.env.test-agent
//            A test agent of your own, named "... [test: <file>]", in the first account. Its id is
//            written to that file, so the shared agent, which judges use, is never touched.
//            Run the app on it: ELEVENLABS_AGENT_ID=<test id> npm start
// Each account's agents are found by their names (no ids in env); the live agent's tools by the agent that uses them;
// its fact sheet (knowledge base) by name plus a hash of the text.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { agentConfig, toolConfigs, AGENT_NAME, knowledgeText, KNOWLEDGE_NAME, pageAgentConfig, PAGE_AGENT_NAME } from '../agent/config.js';
import { parseKeys, findAgentId, maskKey } from '../lib/accounts.js';

const here = dirname(fileURLToPath(import.meta.url));
const envArg = process.argv.indexOf('--env');
const TEST_ENV = envArg > 0 ? resolve(process.argv[envArg + 1]) : null;
const API = 'https://api.elevenlabs.io/v1/convai';
loadEnv(join(here, '..', '..', '.env'));

// Tool ids as name:id,name:id (shell-safe, unlike JSON).
export const parseToolIds = (text = '') =>
  Object.fromEntries(String(text).split(',').map((pair) => pair.trim().split(':')).filter(([n, id]) => n && id));
export const formatToolIds = (ids) => Object.entries(ids).map(([n, id]) => `${n}:${id}`).join(',');

// Set or replace KEY=value lines in .env, keeping every other line as it is.
export function setEnvLines(text, values) {
  const lines = text ? text.replace(/\n$/, '').split('\n') : [];
  for (const [key, value] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function client(apiKey, fetchImpl) {
  return async function call(method, path, body) {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'xi-api-key': apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${method} ${path.split('?')[0]} -> ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  };
}

// The client tools the agent uses now, by name, so they are updated rather than duplicated.
async function knownTools(call, agentId) {
  if (!agentId) return {};
  const out = {};
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ used_by_agent_id: agentId, page_size: '100', ...(cursor ? { cursor } : {}) });
    const body = await call('GET', `/tools?${q}`);
    for (const t of body.tools || []) if (t.tool_config?.name) out[t.tool_config.name] ??= t.id;
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return out;
}

async function syncTools(call, known, log) {
  const ids = {};
  const search = Boolean(process.env.TAVILY_API_KEY);
  for (const tool of toolConfigs({ search })) {
    const id = known[tool.name];
    if (id) {
      try {
        await call('PATCH', `/tools/${id}`, { tool_config: tool });
        ids[tool.name] = id;
        log(`tool  updated ${tool.name}`);
        continue;
      } catch (err) {
        if (![404, 405].includes(err.status)) throw err;
      }
    }
    const created = await call('POST', '/tools', { tool_config: tool });
    ids[tool.name] = created.id;
    log(`tool  created ${tool.name}`);
  }
  return ids;
}

// The fact sheet in this account's knowledge base, named "<KNOWLEDGE_NAME> <hash of the text>".
// Same text: the document is reused. Changed text: a new one is uploaded; the older ones are
// deleted after the agent points at the new one (ElevenLabs keeps one another agent still uses).
export const knowledgeHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

async function syncKnowledge(call, log) {
  const text = knowledgeText();
  const name = `${KNOWLEDGE_NAME} ${knowledgeHash(text)}`;
  const docs = [];
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ search: KNOWLEDGE_NAME, page_size: '100', ...(cursor ? { cursor } : {}) });
    const body = await call('GET', `/knowledge-base?${q}`);
    docs.push(...(body.documents || []));
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  const current = docs.find((d) => d.name === name);
  const stale = docs.filter((d) => d.name !== name && /^[0-9a-f]{12}$/.test(d.name.slice(KNOWLEDGE_NAME.length + 1))).map((d) => d.id);
  if (current) {
    log(`knowledge unchanged ${current.id}`);
    return { id: current.id, stale };
  }
  const { id } = await call('POST', '/knowledge-base/text', { text, name });
  log(`knowledge created ${id}`);
  return { id, stale };
}

// Find the agent named `name` in this account; create it with its tools and fact sheet, or update all to match code.
export async function syncAccount({ apiKey, name = AGENT_NAME, fetchImpl = fetch, log = console.log }) {
  const call = client(apiKey, fetchImpl);
  let agentId = await findAgentId(apiKey, name, fetchImpl);
  const toolIds = await syncTools(call, await knownTools(call, agentId), log);
  const knowledge = await syncKnowledge(call, log);
  const body = agentConfig({ toolIds: Object.values(toolIds), voiceId: process.env.ELEVENLABS_VOICE_ID || undefined, name, knowledgeId: knowledge.id });
  if (agentId) {
    await call('PATCH', `/agents/${agentId}`, body);
    log(`agent updated ${agentId}`);
  } else {
    agentId = (await call('POST', '/agents/create', body)).agent_id;
    log(`agent created ${agentId}`);
  }
  for (const old of knowledge.stale) {
    await call('DELETE', `/knowledge-base/${old}`).then(
      () => log(`knowledge deleted old ${old}`),
      (err) => log(`knowledge kept old ${old} (${err.status || err.message})`),
    );
  }
  return { agentId, toolIds: formatToolIds(toolIds) };
}

// The page writer agent named `name` in this account: created, or updated to match code. No tools, no fact sheet.
export async function syncPageAgent({ apiKey, name = PAGE_AGENT_NAME, fetchImpl = fetch, log = console.log }) {
  const call = client(apiKey, fetchImpl);
  let agentId = await findAgentId(apiKey, name, fetchImpl);
  const body = pageAgentConfig({ name });
  if (agentId) {
    await call('PATCH', `/agents/${agentId}`, body);
    log(`page writer updated ${agentId}`);
  } else {
    agentId = (await call('POST', '/agents/create', body)).agent_id;
    log(`page writer created ${agentId}`);
  }
  return agentId;
}

// Every key, one after the other. strict: false logs a masked warning for a failing account and goes on.
export async function syncAll(keys, { strict = true, fetchImpl = fetch, log = console.log, warn = console.warn } = {}) {
  const results = [];
  for (const apiKey of keys) {
    log(`account ${maskKey(apiKey)}`);
    try {
      const live = await syncAccount({ apiKey, fetchImpl, log });
      results.push({ key: maskKey(apiKey), ok: true, ...live, pageAgentId: await syncPageAgent({ apiKey, fetchImpl, log }) });
    } catch (err) {
      const message = String(err.message).split(apiKey).join(maskKey(apiKey));
      if (strict) throw new Error(`account ${maskKey(apiKey)}: ${message}`);
      warn(`[agent-sync] account ${maskKey(apiKey)} skipped: ${message}`);
      results.push({ key: maskKey(apiKey), ok: false, error: message });
    }
  }
  return results;
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ tools: toolConfigs({ search: Boolean(process.env.TAVILY_API_KEY) }), agent: agentConfig({ toolIds: ['<tool ids>'], knowledgeId: '<knowledge id>' }), pageAgent: pageAgentConfig() }, null, 2));
    return;
  }
  const keys = parseKeys(process.env);
  if (process.argv.includes('--auto')) {
    // The Vercel build. Preview and local builds never touch the agents.
    if (process.env.VERCEL_ENV !== 'production') return console.log(`agent-sync: skipped (VERCEL_ENV=${process.env.VERCEL_ENV || 'unset'}, only production syncs)`);
    if (!keys.length) return console.log('agent-sync: no ElevenLabs keys, nothing to sync');
    const results = await syncAll(keys, { strict: false });
    console.log(`agent-sync: ${results.filter((r) => r.ok).length} of ${results.length} accounts synced`);
    return;
  }
  if (!keys.length) {
    console.error('ELEVENLABS_API_KEYS (or ELEVENLABS_API_KEY) is not set in .env.');
    process.exit(1);
  }
  if (TEST_ENV) {
    const name = `${AGENT_NAME} [test: ${basename(TEST_ENV)}]`;
    const { agentId, toolIds } = await syncAccount({ apiKey: keys[0], name });
    const current = existsSync(TEST_ENV) ? readFileSync(TEST_ENV, 'utf8') : '';
    writeFileSync(TEST_ENV, setEnvLines(current, { ELEVENLABS_AGENT_ID: agentId, ELEVENLABS_TOOL_IDS: toolIds }));
    console.log(`wrote ELEVENLABS_AGENT_ID to ${basename(TEST_ENV)}`);
    return;
  }
  for (const r of await syncAll(keys)) console.log(`${r.key}: agent ${r.agentId}, page writer ${r.pageAgentId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (/convai_write|permission|401|403/i.test(err.message)) {
      console.error('The ElevenLabs key needs the Agents permission (scope convai_write). Add it in Settings > API keys.');
    }
    console.error(err.message);
    // --auto must never fail the deploy.
    process.exit(process.argv.includes('--auto') ? 0 : 1);
  });
}
