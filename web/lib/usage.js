// Daily usage limit, checked before every call that spends provider credit.
// Two counters per UTC day: live sessions (joining the ElevenLabs agent) and calls (TTS,
// catalog search). Each has a limit for the whole site and one per visitor.
// A visitor is a hash of the client IP (never stored as the IP itself).
//
// Store: Vercel functions keep no memory between calls, so the limit needs a shared store.
// - Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
//   set (or KV_REST_API_URL / KV_REST_API_TOKEN, the names the Vercel Marketplace sets). The free
//   tier is enough; no SDK, one fetch per check.
// - Otherwise memory: exact for the local server, best effort on Vercel (counts per warm instance).
import { createHash } from 'node:crypto';

export const LIMIT_DEFAULTS = {
  USAGE_SESSIONS_PER_DAY: 200,
  USAGE_SESSIONS_PER_VISITOR: 12,
  USAGE_CALLS_PER_DAY: 1500,
  USAGE_CALLS_PER_VISITOR: 120,
};

export class LimitError extends Error {
  constructor(scope) {
    super(`daily ${scope} limit reached`);
    this.scope = scope; // 'site' | 'visitor'
  }
}

const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);

export function limits(env = process.env) {
  return Object.fromEntries(Object.entries(LIMIT_DEFAULTS).map(([k, d]) => [k, num(env[k], d)]));
}

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

// First address in x-forwarded-for (set by Vercel), else x-real-ip, else the socket's.
export function visitorId(headers = {}, fallback = '') {
  const ip = String(headers['x-forwarded-for'] || '').split(',')[0].trim() || String(headers['x-real-ip'] || '').trim() || fallback || 'unknown';
  return createHash('sha256').update(`agentos:${ip}`).digest('hex').slice(0, 16);
}

export function memoryStore() {
  const counts = new Map();
  const texts = new Map();
  return {
    kind: 'memory',
    async incr(keys) {
      return keys.map((k) => {
        const n = (counts.get(k) || 0) + 1;
        counts.set(k, n);
        return n;
      });
    },
    async get(keys) {
      return keys.map((k) => counts.get(k) || 0);
    },
    // Plain text values with an expiry (lib/accounts.js caches each key's agent id).
    async getText(key) {
      const v = texts.get(key);
      return v && v.until > Date.now() ? v.value : null;
    },
    async setText(key, value, secs) {
      texts.set(key, { value, until: Date.now() + secs * 1000 });
    },
  };
}

// Upstash REST: POST {url}/pipeline with [["INCR", key], ["EXPIRE", key, secs], ...] -> [{ result }, ...]
export function upstashStore({ url, token, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, '');
  async function pipeline(commands) {
    const res = await fetchImpl(`${base}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`usage store ${res.status}`);
    const out = await res.json();
    return out.map((r) => {
      if (r.error) throw new Error(`usage store: ${r.error}`);
      return r.result;
    });
  }
  return {
    kind: 'upstash',
    async incr(keys) {
      const out = await pipeline(keys.flatMap((k) => [['INCR', k], ['EXPIRE', k, 172800]]));
      return keys.map((_, i) => Number(out[i * 2]));
    },
    async get(keys) {
      return (await pipeline(keys.map((k) => ['GET', k]))).map((v) => Number(v) || 0);
    },
    async getText(key) {
      return (await pipeline([['GET', key]]))[0] ?? null;
    },
    async setText(key, value, secs) {
      await pipeline([['SET', key, value, 'EX', secs]]);
    },
  };
}

export function storeFor(env = process.env, fetchImpl = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? upstashStore({ url, token, fetchImpl }) : memoryStore();
}

// usage.take('sessions' | 'calls', headers) counts one use, or throws LimitError when over.
// usage.siteFull() says, without counting, whether today's site-wide session limit is used up.
// If the store itself fails, the call is allowed (a store outage must not break the demo).
export function createUsage({ env = process.env, store = storeFor(env), now = () => new Date() } = {}) {
  const max = limits(env);
  const keysFor = (kind, visitor) => {
    const day = today(now());
    return [`agentos:${day}:${kind}:site`, `agentos:${day}:${kind}:v:${visitor}`];
  };
  const caps = {
    sessions: [max.USAGE_SESSIONS_PER_DAY, max.USAGE_SESSIONS_PER_VISITOR],
    calls: [max.USAGE_CALLS_PER_DAY, max.USAGE_CALLS_PER_VISITOR],
  };
  return {
    store: store.kind,
    limits: max,
    async take(kind, headers = {}) {
      const [siteMax, visitorMax] = caps[kind];
      let site;
      let visitor;
      try {
        [site, visitor] = await store.incr(keysFor(kind, visitorId(headers)));
      } catch (err) {
        console.warn(`[usage] ${err.message}; allowing this call`);
        return;
      }
      if (site > siteMax) throw new LimitError('site');
      if (visitor > visitorMax) throw new LimitError('visitor');
    },
    async siteFull() {
      try {
        const [site] = await store.get([keysFor('sessions', 'none')[0]]);
        return site >= caps.sessions[0];
      } catch {
        return false;
      }
    },
  };
}
