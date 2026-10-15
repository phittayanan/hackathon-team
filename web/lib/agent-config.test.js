import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentConfig, toolConfigs, knowledgeText } from '../agent/config.js';
import { today } from '../lib/live-session.js';
import { setEnvLines, parseToolIds, formatToolIds, knowledgeHash } from '../scripts/agent-sync.js';
import { TOOL_DEFS, toolDefs } from '../public/js/agent-tools.js';

test('agent config: Claude Sonnet 5.5, Thai, v3 conversational voice, private', () => {
  const c = agentConfig({ toolIds: ['t1'] });
  assert.equal(c.conversation_config.agent.prompt.llm, 'claude-sonnet-5-5');
  assert.equal(c.conversation_config.agent.language, 'th');
  assert.equal(c.conversation_config.tts.model_id, 'eleven_v3_conversational');
  assert.deepEqual(c.conversation_config.agent.prompt.tool_ids, ['t1']);
  assert.equal(c.platform_settings.auth.enable_auth, true);
  assert.match(c.conversation_config.agent.prompt.prompt, /never approve a payment/);
});

test('client tools match the browser handlers and are JSON-schema objects', () => {
  const tools = toolConfigs({ search: true });
  assert.deepEqual(tools.map((t) => t.name), TOOL_DEFS.map((t) => t.name));
  // Without a search key the web_search tool is not offered.
  assert.deepEqual(toolConfigs().map((t) => t.name), toolDefs().map((t) => t.name));
  assert.equal(toolConfigs().some((t) => t.name === 'web_search'), false);
  for (const t of tools) {
    assert.equal(t.type, 'client');
    assert.equal(t.expects_response, true);
    assert.equal(t.parameters.type, 'object');
  }
  assert.deepEqual(tools.find((t) => t.name === 'scene_action').parameters.properties.action.enum, ['confirm', 'decline', 'close']);
});

test('idle silence skips the turn while important notifications remain enabled', () => {
  const { prompt } = agentConfig().conversation_config.agent;
  assert.equal(prompt.built_in_tools.skip_turn.params.system_tool_type, 'skip_turn');
  assert.match(prompt.built_in_tools.skip_turn.description, /every silence timeout/);
  assert.match(prompt.prompt, /Never ask "are you still there\?"/);
  assert.match(prompt.prompt, /every later timeout/);
  assert.match(prompt.prompt, /important feed update should still get a normal response/);
  assert.match(prompt.prompt, /Return silently to waiting with `skip_turn`/);
});

test('setEnvLines replaces or appends and keeps other lines', () => {
  const out = setEnvLines('ELEVENLABS_API_KEY=abc\nELEVENLABS_AGENT_ID=old\n', { ELEVENLABS_AGENT_ID: 'new', ELEVENLABS_TOOL_IDS: '{}' });
  assert.equal(out, 'ELEVENLABS_API_KEY=abc\nELEVENLABS_AGENT_ID=new\nELEVENLABS_TOOL_IDS={}\n');
});

test('tool ids round-trip as name:id pairs', () => {
  const ids = { open_scene: 'tool_a', keep_scene: 'tool_b' };
  assert.equal(formatToolIds(ids), 'open_scene:tool_a,keep_scene:tool_b');
  assert.deepEqual(parseToolIds(formatToolIds(ids)), ids);
  assert.deepEqual(parseToolIds(''), {});
});

test('the prompt takes {{today}}, with a placeholder; today() is the Bangkok date', () => {
  const agent = agentConfig().conversation_config.agent;
  assert.match(agent.prompt.prompt, /\{\{today\}\}/);
  assert.ok(agent.dynamic_variables.dynamic_variable_placeholders.today);
  // 20:00 UTC on 15 Oct is already Friday 16 Oct in Bangkok (UTC+7).
  assert.equal(today(new Date('2026-10-15T20:00:00Z')), 'Friday 16 October 2026 (2026-10-16)');
});

test('turn latency: speculative turn on, no filler line (it fired after tool calls)', () => {
  const turn = agentConfig().conversation_config.turn;
  assert.equal(turn.speculative_turn, true);
  assert.equal(turn.soft_timeout_config.timeout_seconds, -1);
  assert.equal(agentConfig({ name: 'x [test]' }).name, 'x [test]');
});

test('the prompt takes {{memory}} with a placeholder, and teaches remember, plan, feed policy and why', () => {
  const agent = agentConfig().conversation_config.agent;
  const prompt = agent.prompt.prompt;
  assert.match(prompt, /\{\{memory\}\}/);
  assert.equal(agent.dynamic_variables.dynamic_variable_placeholders.memory, 'nothing yet (first visit)');
  assert.match(prompt, /`remember`/);
  assert.match(prompt, /\[session start\]/);
  assert.match(prompt, /pass `plan`/);
  assert.match(prompt, /say why in one clause/);
  assert.match(prompt, /When in doubt, call `skip_turn`/);
  assert.match(prompt, /Never repeat/);
  // remember is quiet (no forced sentence first); the page tools take a plan.
  const tools = toolConfigs({ search: true });
  assert.equal(tools.find((t) => t.name === 'remember').pre_tool_speech, undefined);
  assert.deepEqual(tools.find((t) => t.name === 'remember').parameters.properties.key.enum, ['name', 'likes', 'note', 'forget_all']);
  // What it learned comes back as {{learned}}, and it says when it applies it.
  assert.match(prompt, /\{\{learned\}\}/);
  assert.equal(agent.dynamic_variables.dynamic_variable_placeholders.learned, 'nothing yet');
  assert.match(prompt, /When you apply something you learned, say so/);
  for (const name of ['open_scene', 'render_ui', 'web_search']) {
    const plan = tools.find((t) => t.name === name).parameters;
    assert.ok(plan.properties.plan && !plan.required.includes('plan'), name);
  }
});

test('knowledge base: the fact sheet is attached only with an id; prompt mode by default, rag on request', () => {
  assert.equal(agentConfig().conversation_config.agent.prompt.knowledge_base, undefined);
  const p = agentConfig({ knowledgeId: 'kb1' }).conversation_config.agent.prompt;
  assert.deepEqual(p.knowledge_base, [{ type: 'text', name: 'Agent OS fact sheet', id: 'kb1', usage_mode: 'prompt' }]);
  assert.equal(p.rag, undefined);
  const r = agentConfig({ knowledgeId: 'kb1', knowledgeMode: 'rag' }).conversation_config.agent.prompt;
  assert.equal(r.knowledge_base[0].usage_mode, 'auto');
  assert.equal(r.rag.enabled, true);
  // Big enough to index (500 bytes), small enough for one page; the money rules are in it.
  const text = knowledgeText();
  assert.ok(text.length > 500 && text.length < 6000);
  assert.match(text, /only the owner can, by tapping the Allow button/i);
  assert.match(knowledgeHash(text), /^[0-9a-f]{12}$/);
  assert.notEqual(knowledgeHash(text), knowledgeHash(`${text} `));
});

test('session limits: at most 3 minutes, and the call ends after 20 s without the user', () => {
  const c = agentConfig().conversation_config;
  assert.equal(c.conversation.max_duration_seconds, 180);
  assert.equal(c.turn.silence_end_call_timeout, 20);
});
