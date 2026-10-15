// Page model: a fast Gemini model writes one self-contained HTML page from a render_ui spec plus the
// live agent's design brief. The live agent itself never writes HTML (that would slow every voice turn).
// Gemini API (docs checked October 2026: https://ai.google.dev/gemini-api/docs/models,
// https://ai.google.dev/gemini-api/docs/deprecations - gemini-2.5-flash shuts down 2026-10-16):
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse
//   header x-goog-api-key: <GEMINI_API_KEY>
//   { systemInstruction: { parts: [{ text }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig }
//   -> server-sent events, each `data: { candidates: [{ content: { parts: [{ text }] } }] }`
// The key stays on the server. What the model writes is sanitized in the browser before it is shown
// (public/js/page-sanitize.js), so the answer is passed on as plain text.
export const PAGE_MODEL = 'gemini-3.5-flash';
export const PAGE_TIMEOUT_MS = 12_000;
export const pageReady = (env = process.env) => Boolean(env.GEMINI_API_KEY);
const modelFor = (env) => (/^[\w.-]+$/.test(env.GEMINI_PAGE_MODEL || '') ? env.GEMINI_PAGE_MODEL : PAGE_MODEL);

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
export function pagePrompt(spec, design) {
  const content = {
    title: spec.title,
    subtitle: spec.subtitle || undefined,
    accent: spec.accent,
    blocks: spec.blocks.filter((b) => b.type !== 'image'),
  };
  return [
    `Design brief: ${String(design || 'A clear, friendly page for this content.').slice(0, 600)}`,
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

// Starts the request and checks the answer status, then returns an async iterator of text pieces.
// Text before the first "<" (a ```html fence) is dropped. The signal stops it (time limit, visitor left).
export async function streamPage({ spec, design }, env = process.env, { fetchImpl = fetch, signal } = {}) {
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${modelFor(env)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: pagePrompt(spec, design) }] }],
      generationConfig: { temperature: 1, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'minimal' } },
    }),
    signal,
  });
  if (!res.ok) {
    const reason = res.status === 429 ? 'page model rate limited' : res.status === 403 || res.status === 401 ? 'page model key not valid' : `page model http ${res.status}`;
    throw new PageModelError(reason);
  }
  return pieces(res.body);
}

async function* pieces(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let started = false;
  const textOf = (line) => {
    if (!line.startsWith('data:')) return '';
    try {
      const event = JSON.parse(line.slice(5));
      return (event.candidates?.[0]?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join('');
    } catch {
      return '';
    }
  };
  const emit = (text) => {
    if (!started) {
      const lt = text.indexOf('<');
      if (lt < 0) return '';
      started = true;
      return text.slice(lt);
    }
    return text;
  };
  for await (const chunk of body) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      const out = emit(textOf(line.trim()));
      if (out) yield out;
    }
  }
  const out = emit(textOf(buffer.trim()));
  if (out) yield out;
}
