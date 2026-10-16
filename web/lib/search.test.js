import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tavilySearch, searchReady, reasonFor } from './search.js';
import { createHandlers } from './handlers.js';
import { createUsage, memoryStore } from './usage.js';
import { createToolHandlers } from '../public/js/agent-tools.js';
import { validateSpec } from '../public/js/genui.js';

const ok = (body) => async (url, opts) => ({ ok: true, status: 200, json: async () => body, url, opts });

test('search needs TAVILY_API_KEY: the old keyless switch does nothing', async () => {
  assert.equal(searchReady({ TAVILY_KEYLESS: 'true' }), false);
  await assert.rejects(tavilySearch('headphones', { TAVILY_KEYLESS: 'true' }, () => assert.fail('must not call')), /not configured/);
});

test('tavilySearch: fast depth, bearer key, 5 results, http(s) links only, trimmed text', async () => {
  let sent;
  const fetchImpl = async (url, opts) => {
    sent = { url, opts, body: JSON.parse(opts.body) };
    return {
      ok: true,
      json: async () => ({
        answer: 'There is a 10K on 9 Nov.',
        results: [
          { title: 'Bangkok 10K', url: 'https://run.example/bkk', content: 'Race   on 9 Nov', score: 0.9 },
          { title: 'Bad', url: 'javascript:alert(1)', content: 'x' },
          { title: '', url: 'http://b.example/x', content: 'y' },
        ],
      }),
    };
  };
  const out = await tavilySearch('  10K Bangkok  ', { TAVILY_API_KEY: 'tvly-x' }, fetchImpl);
  assert.equal(sent.url, 'https://api.tavily.com/search');
  assert.equal(sent.opts.headers.authorization, 'Bearer tvly-x');
  assert.deepEqual(sent.body, { query: '10K Bangkok', search_depth: 'fast', max_results: 5, include_answer: 'basic', topic: 'general' });
  assert.equal(out.answer, 'There is a 10K on 9 Nov.');
  assert.deepEqual(out.results, [
    { title: 'Bangkok 10K', url: 'https://run.example/bkk', content: 'Race on 9 Nov' },
    { title: 'http://b.example/x', url: 'http://b.example/x', content: 'y' },
  ]);
});

test('tavilySearch errors: usage limits and bad key have short reasons; empty query never calls', async () => {
  assert.equal(reasonFor(432), 'search credit ran out');
  assert.equal(reasonFor(433), 'search credit ran out');
  assert.equal(reasonFor(401), 'search key not valid');
  await assert.rejects(tavilySearch('x', { TAVILY_API_KEY: 'k' }, async () => ({ ok: false, status: 432 })), /credit ran out/);
  await assert.rejects(tavilySearch('  ', { TAVILY_API_KEY: 'k' }, () => assert.fail('called')), /empty query/);
  assert.equal(searchReady({}), false);
  assert.equal(searchReady({ TAVILY_API_KEY: 'k' }), true);
});

test('search route: 503 without a key, limit before any call, errors come back as { error }', async () => {
  const none = createHandlers({ env: {}, inlineImages: true, usage: createUsage({ env: {}, store: memoryStore() }) });
  await assert.rejects(none.search({}, { query: 'x' }), (e) => e.status === 503);
  assert.equal((await none.health()).search, false);

  const env = { TAVILY_API_KEY: 'k', USAGE_CALLS_PER_VISITOR: '1' };
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 432 }; };
  const app = createHandlers({ env, inlineImages: true, usage: createUsage({ env, store: memoryStore() }), fetchImpl });
  assert.equal((await app.health()).search, true);
  assert.deepEqual(await app.search({}, { query: 'x' }), { error: 'search credit ran out' });
  await assert.rejects(app.search({}, { query: 'x' }), (e) => e.status === 429 && e.extra.offline === 'limit');
  assert.equal(calls, 1);
});

function fakeUi(search) {
  const state = { open: null, opened: [] };
  return {
    state,
    ui: {
      current: () => state.open,
      openScene: async (name, data) => { state.open = { name, ctl: { state: () => ({ spec: data.spec }) } }; state.opened.push({ name, data }); },
      closeScene: () => { state.open = null; },
      action: (name, extra) => { if (name === 'revise') state.open.ctl.state = () => ({ spec: extra.spec }); },
      nudgeAllow: () => {},
      search,
    },
  };
}

test('web_search tool: results go to the agent, the next page lists the sources, a revise keeps them', async () => {
  const { ui, state } = fakeUi(async () => ({ answer: 'A race on 9 Nov', results: [{ title: 'Bangkok 10K', url: 'https://run.example/bkk', content: 'Race on 9 Nov' }] }));
  const tools = createToolHandlers(ui);
  const said = await tools.web_search({ query: '10K Bangkok' });
  assert.match(said, /A race on 9 Nov/);
  assert.match(said, /Bangkok 10K: Race on 9 Nov/);
  await tools.render_ui({ spec_json: JSON.stringify({ title: 'Runs', blocks: [{ type: 'card', title: 'Bangkok 10K', text: '9 Nov' }] }) });
  const spec = state.opened[0].data.spec;
  assert.deepEqual(spec.blocks.at(-1), { type: 'sources', items: [{ title: 'Bangkok 10K', url: 'https://run.example/bkk' }] });
  await tools.revise_ui({ spec_json: JSON.stringify({ title: 'Runs', accent: 'dark', blocks: [{ type: 'text', text: 'x' }] }) });
  assert.equal(state.open.ctl.state().spec.blocks.at(-1).type, 'sources');
  // Sources are used once: a later page without a search has none.
  await tools.render_ui({ spec_json: JSON.stringify({ title: 'Other', blocks: [{ type: 'text', text: 'y' }] }) });
  assert.equal(state.opened[1].data.spec.blocks.some((b) => b.type === 'sources'), false);
});

test('web_search tool without search, or failing: a plain text answer, nothing breaks', async () => {
  assert.match(await createToolHandlers(fakeUi(undefined).ui).web_search({ query: 'x' }), /not available/);
  assert.match(await createToolHandlers(fakeUi(async () => ({ error: 'search timeout' })).ui).web_search({ query: 'x' }), /failed \(search timeout\)/);
});

test('sources block: only http(s) links survive validation', () => {
  const spec = validateSpec({ blocks: [{ type: 'sources', items: [{ title: 'ok', url: 'https://a.example' }, { title: 'bad', url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }] }] });
  assert.deepEqual(spec.blocks[0].items, [{ title: 'ok', url: 'https://a.example/' }]);
  assert.equal(validateSpec({ blocks: [{ type: 'sources', items: [{ url: 'ftp://x' }] }] }), null);
});
