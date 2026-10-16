// Page model: the page writer, a text-only ElevenLabs agent (agent/config.js, synced by agent-sync), writes
// one self-contained HTML page from a render_ui spec plus the live agent's design brief. The live agent
// itself never writes HTML (that would slow every voice turn). Every page spends ElevenLabs credit.
// One page = one short text conversation, from the server only (chat mode:
// https://elevenlabs.io/docs/eleven-agents/guides/chat-mode; event names and fields from the official
// SDKs, October 2026: @elevenlabs/client 1.28.0 and @elevenlabs/types 0.25.0):
//   GET /v1/convai/conversation/get-signed-url?agent_id=<page writer> (xi-api-key) -> signed wss URL
//   -> { type: 'conversation_initiation_client_data' }, wait for conversation_initiation_metadata
//   -> { type: 'user_message', text }   <- agent_chat_response_part { text_response_part: { type: 'delta', text } }
//   <- agent_response (the whole reply; the conversation is then closed). ping -> pong.
// The key stays on the server. What the agent writes is sanitized in the browser before it is shown
// (public/js/page-sanitize.js), so the answer is passed on as plain text.
import { signedUrl } from './live-session.js';
import { ACCOUNT_BLOCKED } from '../public/js/account-blocked.js';

export const PAGE_TIMEOUT_MS = 12_000;
// Same accounts as the live agent (lib/accounts.js): ready when there is an ElevenLabs key.
export const pageReady = (accounts) => accounts.ready();
// A blocked workspace (account_restricted) counts as out of credit too.
const CREDIT_WORDS = /quota|credit|insufficient|exceeded/i;
const OUT_OF_CREDIT = { test: (text) => CREDIT_WORDS.test(text) || ACCOUNT_BLOCKED.test(text) };

// Pictures in web/public/img the page may use by path.
export const PICTURES = {
  '/img/mascot.svg': 'the app mascot, friendly round character',
  '/img/mascot-run.svg': 'the mascot running',
  '/img/race.svg': 'a running race, finish line',
  '/img/flight.svg': 'an airplane',
  '/img/groceries.svg': 'a bag of groceries',
};

const LAYOUTS = ['hero with one big headline', 'grid of tiles', 'stack of rich cards', 'vertical timeline', 'split screen',
  'one huge number with details under it', 'illustration-led poster', 'magazine spread', 'ticket or receipt', 'dashboard of gauges'];

export const SYSTEM_PROMPT = [
  'You write one full-screen page for Agent OS, a voice assistant app. Answer with ONE complete HTML document',
  '(<!doctype html> ... </html>) and nothing else: no markdown fences, no explanation.',
  '',
  'Rules the app enforces (anything else is removed, so do not write it):',
  '- CSS only in <style> blocks or style attributes. No <script>, no on* attributes, no <form>, no <iframe>, no <link>, no web fonts, no @import.',
  '- Pictures only: the app pictures listed below by path, https images, inline <svg>, emoji, CSS gradients and shapes.',
  '- Interaction without scripts: put data-action="<short-id>" on anything the user can tap to tell the assistant',
  '  (add data-value="<choice>" for a choice); the app sends it to the assistant. Use <button> for those.',
  '  data-toggle on an element flips data-on="true"/"false" when tapped (style it with [data-on="true"]), good for checklists.',
  '  A counter: <span data-count="cups">0</span> with buttons data-count-step="cups" data-step="1" / data-step="-1".',
  '- No links (they are removed). Do not invent facts beyond the content you are given.',
  '',
  'Design:',
  '- Make every page look different. Pick ONE strong layout idea and visual idea that fits the brief, for example:',
  `  ${LAYOUTS.join(', ')}. Avoid a plain column of identical cards.`,
  '- Base: the app colours as CSS variables (already defined, use var()): --cream #f6efe4, --cream-2 #efe3d0, --ink #2b2420,',
  '  --ink-2 #6f645b, --accent #ff7a59, --accent-2 #ffb36b, --ok #23a26d, --bad #d9534f, --card #fffdf9, --sky #dcecff, --radius 22px,',
  '  font: var(--font) (system font with Noto Sans Thai). You may add colours that fit the brief\'s mood.',
  '- Thai text first (the content is usually Thai already); short English only where the content has it.',
  '- Works at phone width (360 px) and desktop (1200 px): fluid widths, CSS grid/flex, a @media query for wide screens.',
  '- Every tap target at least 44 px tall and wide. Text contrast at least WCAG AA (4.5:1, large text 3:1).',
  '- The page sits under the app\'s own header; leave about 72 px free at the bottom for the app\'s mic bar.',
  '- Keep it compact: at most about 9 KB of HTML. No comments.',
  '',
  'App pictures: ' + Object.entries(PICTURES).map(([p, d]) => `${p} (${d})`).join('; ') + '.',
].join('\n');

// The user message: the brief plus the spec's content (title and blocks; the app draws the choice chips itself).
// style: the user's design system as one line (public/js/style.js styleText), after the brief.
export function pagePrompt(spec, design, style) {
  const content = {
    title: spec.title,
    subtitle: spec.subtitle || undefined,
    accent: spec.accent,
    blocks: spec.blocks.filter((b) => b.type !== 'image'),
  };
  return [
    `Design brief: ${String(design || 'A clear, friendly page for this content.').slice(0, 600)}`,
    ...(style ? [`User's design system: ${String(style).slice(0, 200)}`] : []),
    'Content (JSON; show all of it, as real UI, not as JSON). A "button" block becomes a <button data-action>.',
    JSON.stringify(content),
  ].join('\n');
}

export class PageModelError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

// Opens the conversation and sends the page request (out of credit before the first text: err.outOfCredit,
// so the caller tries the next account), then returns an async iterator of text pieces.
// Text before the first "<" (a ```html fence) is dropped. The signal stops it (time limit, visitor left).
// env: ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID (the page writer's id) of one account.
export async function streamPage({ spec, design, style }, env = process.env, { fetchImpl = fetch, WebSocketImpl = globalThis.WebSocket, signal } = {}) {
  if (!WebSocketImpl) throw new PageModelError('no global WebSocket (Node 22 or later)');
  const url = await signedUrl(env, fetchImpl, signal);
  signal?.throwIfAborted();
  const ws = new WebSocketImpl(url);
  const queue = [];
  let wake = () => {};
  let ended = null; // { error } once the conversation is over
  let streamed = false;
  const finish = (error = null) => {
    if (ended) return;
    ended = { error };
    wake();
    try { ws.close(); } catch { /* already closed */ }
  };
  const onAbort = () => finish(signal.reason || new Error('page aborted'));
  signal?.addEventListener('abort', onAbort, { once: true });

  let ready, failed;
  const started = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' })));
  ws.addEventListener('error', () => { failed(new PageModelError('page writer connection failed')); finish(new PageModelError('page writer connection failed')); });
  ws.addEventListener('close', (e) => {
    const err = new PageModelError(`page writer closed ${e.code || ''} ${e.reason || ''}`.trim());
    if (OUT_OF_CREDIT.test(e.reason || '')) err.outOfCredit = true;
    failed(err);
    finish(streamed ? null : err);
  });
  ws.addEventListener('message', (e) => {
    let event;
    try { event = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString()); } catch { return; }
    if (event.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', event_id: event.ping_event?.event_id }));
    if (event.type === 'conversation_initiation_metadata') {
      ws.send(JSON.stringify({ type: 'user_message', text: pagePrompt(spec, design, style) }));
      return ready();
    }
    if (event.type === 'agent_chat_response_part' && event.text_response_part?.type === 'delta' && event.text_response_part.text) {
      streamed = true;
      queue.push(event.text_response_part.text);
      return wake();
    }
    if (event.type === 'agent_response') {
      if (!streamed && event.agent_response_event?.agent_response) queue.push(event.agent_response_event.agent_response);
      streamed = true;
      finish();
    }
  });

  try {
    await Promise.race([started, new Promise((_, reject) => {
      if (signal?.aborted) reject(signal.reason);
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    })]);
  } catch (err) {
    finish(err);
    throw err;
  }
  return pieces(async function* () {
    try {
      for (;;) {
        while (queue.length) yield queue.shift();
        if (ended) {
          if (ended.error) throw ended.error;
          return;
        }
        await new Promise((resolve) => { wake = resolve; });
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      finish();
    }
  }());
}

async function* pieces(texts) {
  let started = false;
  for await (const text of texts) {
    if (!started) {
      const lt = text.indexOf('<');
      if (lt < 0) continue;
      started = true;
      yield text.slice(lt);
    } else yield text;
  }
}
