// The ElevenLabs agents (ElevenAgents), defined as code: the live voice agent and the page writer.
// scripts/agent-sync.js sends both to every account: POST /v1/convai/agents/create the first time,
// PATCH /v1/convai/agents/{id} after.
// Checked against the ElevenLabs API reference, October 2026:
//   llm enum includes 'claude-sonnet-5-5'; Thai is listed only for the v3 TTS family, so the
//   agent uses 'eleven_v3_conversational'; client tools are separate resources (tool_ids).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolDefs } from '../public/js/agent-tools.js';
import { DEFAULT_VOICE } from '../lib/tts.js';
import { MAX_SESSION_SECONDS, IDLE_END_SECONDS } from '../public/js/session-limits.js';
import { SYSTEM_PROMPT as PAGE_PROMPT } from '../lib/page-model.js';

const here = dirname(fileURLToPath(import.meta.url));

export const AGENT_NAME = 'Q-Bot (U-Hackathon 2026)';
export const AGENT_LLM = 'claude-sonnet-5-5';
export const AGENT_TTS_MODEL = 'eleven_v3_conversational';
export const AGENT_LANGUAGE = 'th';
// Empty: the agent waits for the user. The app greets once on the first tap (greet.mp3, same voice).
export const FIRST_MESSAGE = '';
// Turn latency (field names checked with GET /v1/convai/agents/{id}, October 2026):
// - speculative_turn: start the LLM reply during the silence before the turn is surely over.
//   The shared agent already had it on; now it is in code.
// - soft_timeout_config stays off (-1). Tried on a test agent with a 2.5 s Thai filler: it fired after
//   10 of 11 tool calls (while the LLM writes its line after the tool), so the agent said
//   "อืม แป๊บนึงนะ" right after the page had opened, never before a slow first reply.

// One client tool config per tool, in the ElevenLabs ClientToolConfig shape.
export function toolConfigs() {
  return toolDefs().map((t) => {
    const properties = {};
    const required = [];
    for (const [name, p] of Object.entries(t.params)) {
      properties[name] = { type: p.type, description: p.description, ...(p.enum ? { enum: p.enum } : {}) };
      if (p.required) required.push(name);
    }
    return {
      type: 'client',
      name: t.name,
      description: t.description,
      expects_response: true,
      response_timeout_secs: 10,
      // Say what you are about to do before a scene grows or changes.
      // A page revise takes the model a few seconds: a short sentence first keeps it feeling quick.
      ...(['open_scene', 'render_ui', 'revise_ui', 'secretary_action', 'search_videos'].includes(t.name) ? { pre_tool_speech: 'force' } : {}),
      parameters: { type: 'object', properties, required },
    };
  });
}

// The one-page fact sheet (what Agent OS is, the money rules, the team), sent to the ElevenLabs
// knowledge base by scripts/agent-sync.js. 'prompt' puts the whole page in the prompt on every
// turn; 'rag' retrieves parts of it. Measured 2026-10-16 on a test agent, 5 Thai questions each:
// first audio 1.66 s with 'prompt', 1.95 s with 'rag', same answers. So 'prompt'.
export const KNOWLEDGE_NAME = 'Agent OS fact sheet';
export const KNOWLEDGE_MODE = 'prompt';
export const knowledgeText = () => readFileSync(join(here, 'knowledge.md'), 'utf8');

// name: a test agent gets its own name (agent-sync --env), so it is never mistaken for the shared one.
// knowledgeId: the knowledge base document id of the fact sheet (none: no knowledge base).
export function agentConfig({ toolIds = [], voiceId = DEFAULT_VOICE, name = AGENT_NAME, knowledgeId = null, knowledgeMode = KNOWLEDGE_MODE } = {}) {
  const rag = knowledgeMode === 'rag';
  return {
    name,
    tags: ['agent-os', 'hackathon'],
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: AGENT_LANGUAGE,
        // The page sends {{today}} at session start; the placeholder only covers a session without it.
        // The page sends {{memory}} (a few facts kept on the user's phone) and {{learned}}
        // (preferences learned from how they use the app) too.
        dynamic_variables: {
          dynamic_variable_placeholders: {
            today: 'unknown (ask the user if a date matters)',
            memory: 'nothing yet (first visit)',
            learned: 'nothing yet',
          },
        },
        prompt: {
          prompt: readFileSync(join(here, 'prompt.md'), 'utf8'),
          llm: AGENT_LLM,
          tool_ids: toolIds,
          ...(knowledgeId
            ? { knowledge_base: [{ type: 'text', name: KNOWLEDGE_NAME, id: knowledgeId, usage_mode: rag ? 'auto' : 'prompt' }] }
            : {}),
          ...(knowledgeId && rag ? { rag: { enabled: true, embedding_model: 'multilingual_e5_large_instruct' } } : {}),
          // Silence and unimportant feed updates must not trigger spoken check-ins.
          built_in_tools: {
            skip_turn: {
              type: 'system',
              name: 'skip_turn',
              description: 'Stay silent when the user has not asked anything, including every silence timeout, or after an unimportant [feed update]. Never ask whether the user is still there. Respond normally to a new user request or an important feed update.',
              params: { system_tool_type: 'skip_turn' },
            },
          },
        },
      },
      tts: { voice_id: voiceId, model_id: AGENT_TTS_MODEL },
      // Session limits to save credit (API reference, agents create, October 2026):
      // conversation.max_duration_seconds (default 600) and turn.silence_end_call_timeout
      // ("maximum wait time since the user last spoke before terminating the call", default -1 = off).
      conversation: { max_duration_seconds: MAX_SESSION_SECONDS },
      turn: {
        speculative_turn: true,
        soft_timeout_config: { timeout_seconds: -1 },
        silence_end_call_timeout: IDLE_END_SECONDS,
      },
      asr: { quality: 'high', provider: 'scribe_realtime' },
    },
    // Private agent: the browser can only join with a signed URL from our server.
    platform_settings: { auth: { enable_auth: true } },
  };
}

// The page writer: a second, text-only agent that writes one HTML page per render_ui (lib/page-model.js
// talks to it from the server). Checked October 2026 against https://elevenlabs.io/docs/eleven-agents/guides/chat-mode
// and the API types in the official SDK (@elevenlabs/elevenlabs-js 2.73.0: ConversationConfigInput, Llm, ClientEvent):
// - conversation_config.conversation.text_only: "If enabled audio will not be processed and only text
//   will be used, use to avoid audio pricing." So no voice turn, no speech to text.
// - llm: the enum has no latency figures; gemini-3.5-flash-lite is the newest flash-lite (the fast,
//   cheap Gemini tier, served by ElevenLabs).
// - client_events: agent_chat_response_part streams the reply text as it is written.
export const PAGE_AGENT_NAME = 'Agent OS page writer';
export const PAGE_AGENT_LLM = 'gemini-3.5-flash-lite';
export const PAGE_CLIENT_EVENTS = ['conversation_initiation_metadata', 'ping', 'agent_response', 'agent_chat_response_part'];

export function pageAgentConfig({ name = PAGE_AGENT_NAME } = {}) {
  return {
    name,
    tags: ['agent-os', 'hackathon', 'page-writer'],
    conversation_config: {
      agent: {
        first_message: '',
        prompt: {
          prompt: PAGE_PROMPT,
          llm: PAGE_AGENT_LLM,
          temperature: 1,
          max_tokens: 8192,
          tool_ids: [],
          built_in_tools: {},
        },
      },
      conversation: {
        text_only: true,
        max_duration_seconds: 60,
        client_events: PAGE_CLIENT_EVENTS,
      },
    },
    // Private: only our server joins, with a signed URL.
    platform_settings: { auth: { enable_auth: true } },
  };
}
