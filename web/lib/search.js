// Web search for the live agent, through Tavily (free tier; docs checked October 2026):
//   POST https://api.tavily.com/search, Authorization: Bearer <TAVILY_API_KEY>
//   { query, search_depth: 'fast' (1 credit, about 1 s; 'basic' took about 2.8 s), max_results, include_answer }
//   -> { query, answer?, results: [{ title, url, content, score }], response_time }
//   432 = plan usage limit, 433 = pay-as-you-go limit, 429 = rate limit, 401 = bad key.
// The key stays on the server; without it there is no web_search tool.
export const searchReady = (env = process.env) => Boolean(env.TAVILY_API_KEY);
export const MAX_RESULTS = 5;

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const httpUrl = (u) => {
  try {
    const url = new URL(String(u));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export function reasonFor(status) {
  if (status === 432 || status === 433) return 'search credit ran out';
  if (status === 429) return 'search rate limited';
  if (status === 401) return 'search key not valid';
  return `search http ${status}`;
}

// -> { query, answer, results: [{ title, url, content }] } or throws with a short reason.
export async function tavilySearch(query, env = process.env, fetchImpl = fetch) {
  const q = clip(query, 300);
  if (!q) throw new Error('empty query');
  if (!searchReady(env)) throw new Error('search is not configured');
  const res = await fetchImpl('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: q, search_depth: 'fast', max_results: MAX_RESULTS, include_answer: 'basic', topic: 'general' }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(reasonFor(res.status));
  const body = await res.json();
  const results = (Array.isArray(body.results) ? body.results : [])
    .map((r) => ({ title: clip(r.title, 120) || clip(r.url, 80), url: httpUrl(r.url), content: clip(r.content, 400) }))
    .filter((r) => r.url)
    .slice(0, MAX_RESULTS);
  return { query: q, answer: clip(body.answer, 600), results };
}
