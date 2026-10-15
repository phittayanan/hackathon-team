// What the server does, shared by the local server (server.js) and the Vercel functions (api/).
// Every route that can spend ElevenLabs or Tavily credit checks the daily usage limit first (lib/usage.js).
// When the limit is reached, or ElevenLabs says the credit ran out, the answer carries
// `offline: 'limit' | 'credit'` and the page switches to its offline brain by itself.
import { route } from './router.js';
import { elevenTts } from './tts.js';
import { signedUrl, today } from './live-session.js';
import { createAccounts, envFor } from './accounts.js';
import { createImageService } from './images.js';
import { createRunLog, createConsoleLog } from './runlog.js';
import { createUsage, LimitError } from './usage.js';
import { searchReady, tavilySearch } from './search.js';
import { pageReady, streamPage, PAGE_TIMEOUT_MS } from './page-model.js';
import { validateSpec } from '../public/js/genui.js';

export class HttpError extends Error {
  // extra: more fields for the JSON error body, e.g. { offline: 'limit' }
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const errorBody = (err) => ({ error: err.message, ...(err.extra || {}) });

// opts: { env, logDir (local JSONL) | console log, imagesDir, inlineImages (Vercel: no disk cache), usage, accounts,
//         fetchImpl, WebSocketImpl and timeoutMs for the page model (tests) }
export function createHandlers({
  env = process.env, logDir = null, imagesDir, inlineImages = false, usage = createUsage({ env }), accounts = createAccounts({ env }),
  fetchImpl = fetch, WebSocketImpl = globalThis.WebSocket, timeoutMs = PAGE_TIMEOUT_MS,
} = {}) {
  const runLog = logDir ? createRunLog(logDir) : createConsoleLog();
  const liveReady = () => accounts.ready();
  const ttsReady = () => accounts.ready();
  const images = createImageService({ env, dir: imagesDir, inline: inlineImages });
  // Counts one use; over the limit -> 429 with offline: 'limit'.
  const take = async (kind, headers) => {
    try {
      await usage.take(kind, headers);
    } catch (err) {
      if (!(err instanceof LimitError)) throw err;
      runLog.server('limit', { kind, scope: err.scope });
      throw new HttpError(429, err.message, { offline: 'limit' });
    }
  };
  const outOfCredit = (err, where) => {
    runLog.server('error', { where, message: err.message, outOfCredit: true });
    return new HttpError(429, 'ElevenLabs credit ran out', { offline: 'credit' });
  };

  return {
    runLog,
    images,
    usage,
    async health() {
      return {
        brain: liveReady() ? 'elevenlabs-agent' : 'keywords',
        tts: ttsReady(),
        search: searchReady(env),
        page: pageReady(accounts),
        offline: !liveReady() ? null : (await usage.siteFull()) ? 'limit' : (await accounts.allEmpty()) ? 'credit' : null,
      };
    },
    // x-agentos-spent: the account id of a live call that ElevenLabs just cut for credit (the page
    // sees that, the server does not); that account is marked empty before the next one is picked.
    async session(headers = {}) {
      if (!liveReady()) return { live: false, reason: 'no ELEVENLABS_API_KEYS or ELEVENLABS_API_KEY' };
      const spent = headers['x-agentos-spent'];
      if (spent && (await accounts.markEmpty(String(spent), 'live call'))) runLog.server('error', { where: 'live call', message: 'account out of credit', account: String(spent), outOfCredit: true });
      try {
        await take('sessions', headers);
      } catch (err) {
        return { live: false, reason: err.message, offline: 'limit' };
      }
      try {
        return await accounts.run('agent', async (a) => ({ live: true, signedUrl: await signedUrl(envFor(env, a)), today: today(), account: a.id }), 'signed url');
      } catch (err) {
        if (err.outOfCredit) {
          outOfCredit(err, 'signed url');
          return { live: false, reason: 'ElevenLabs credit ran out', offline: 'credit' };
        }
        runLog.server('error', { where: 'signed url', message: err.message });
        return { live: false, reason: err.message };
      }
    },
    route: async ({ text, context, spec, stage, saved } = {}) => route(text, context || null, { spec, stage, saved }),
    async tts(headers = {}, { text } = {}) {
      if (!ttsReady()) throw new HttpError(503, 'no ElevenLabs key');
      await take('calls', headers);
      try {
        return await accounts.run('key', (a) => elevenTts(String(text).slice(0, 400), envFor(env, a)), 'tts');
      } catch (err) {
        throw err.outOfCredit ? outOfCredit(err, 'tts') : err;
      }
    },
    // Web search for the live agent's web_search tool. Errors come back as { error } (the agent
    // then answers without it); only the daily limit is a 429 that switches the page offline.
    async search(headers = {}, { query } = {}) {
      if (!searchReady(env)) throw new HttpError(503, 'no TAVILY_API_KEY');
      await take('calls', headers);
      try {
        return await tavilySearch(query, env);
      } catch (err) {
        const message = err.name === 'TimeoutError' ? 'search timeout' : err.message;
        runLog.server('error', { where: 'search', message });
        return { error: message };
      }
    },
    // A picture made ahead of time (lib/images.js): no paid call, so no daily-limit count.
    async image(headers = {}, { prompt, scene } = {}) {
      const out = await images.get(prompt, String(scene || 'default'));
      if (out.error && !out.quiet) runLog.server('error', { where: 'image', message: out.error });
      return out;
    },
    // A free HTML page for a generated scene, written by the page model from { spec, design }.
    // -> async iterator of raw HTML text (the browser sanitizes it) or an HttpError before it starts.
    // The time limit ends the text early; the browser then keeps the block page.
    async page(headers = {}, { spec, design } = {}, { signal } = {}) {
      if (!pageReady(accounts)) throw new HttpError(503, 'no ElevenLabs key');
      const clean = validateSpec(spec);
      if (!clean) throw new HttpError(400, 'spec has no usable blocks');
      if (clean.urgency !== 'none') throw new HttpError(400, 'urgent pages are never sent to the page model');
      await take('calls', headers);
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(new Error('page timeout')), timeoutMs);
      signal?.addEventListener('abort', () => stop.abort(signal.reason));
      try {
        // The page writer in the first account with credit; out of credit before the first text -> the next account.
        const request = { spec: clean, design: String(design || '').slice(0, 600) };
        const text = await accounts.run('page', (a) => streamPage(request, envFor(env, a), { fetchImpl, WebSocketImpl, signal: stop.signal }), 'page');
        return (async function* () {
          try {
            yield* text;
          } catch (err) {
            runLog.server('error', { where: 'page', message: stop.signal.aborted ? 'page timeout' : err.message });
          } finally {
            clearTimeout(timer);
          }
        })();
      } catch (err) {
        clearTimeout(timer);
        const message = stop.signal.aborted ? 'page timeout' : err.message;
        runLog.server('error', { where: 'page', message });
        throw new HttpError(stop.signal.aborted ? 504 : 502, message);
      }
    },
    async log(headers, { events } = {}) {
      return { written: runLog.browser(events) };
    },
  };
}
