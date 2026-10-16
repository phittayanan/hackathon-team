// Words that ask for YouTube Shorts (short vertical clips) rather than ordinary videos.
const SHORTS = /\b(?:youtube\s+)?shorts?\b|(?:ชอร์ต|ช็อต)(?:ส์)?|คลิปสั้น/i;
export const wantsShorts = (text) => typeof text === 'string' && SHORTS.test(text);

// Build a YouTube results URL without an API key or trusting a URL from the agent.
// shorts: true adds "#shorts" to the results link only; `query` stays the plain search terms.
export function youtubeSearch(query, shorts = false) {
  const clean = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  if (clean.length < 2) return null;
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', shorts ? `${clean} #shorts` : clean);
  return { query: clean, url: url.href, shorts: Boolean(shorts) };
}

export function videoQueryFromRequest(request, shorts = wantsShorts(request)) {
  let query = typeof request === 'string' ? request.replace(/\s+/g, ' ').trim() : '';
  query = query
    .replace(new RegExp(SHORTS.source, 'gi'), ' ').replace(/#/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:please\s+)?(?:help\s+me\s+)?(?:find|search\s+for|recommend)\s+/i, '')
    .replace(/^(?:ช่วย\s*|ขอ\s*)?(?:หา|ค้นหา|แนะนำ|ดู)?\s*/i, '')
    .replace(/^(?:a\s+)?(?:video|videos|clip|youtube|ยูทูบ|วิดีโอ|คลิป)\s*/i, '')
    .replace(/^(?:สอน|เกี่ยวกับ|เรื่อง|about|tutorial\s+(?:for|on)?)\s*/i, '')
    .replace(/\s*(?:ให้หน่อย|หน่อย|ให้ที|ได้ไหม|please|for me)$/i, '')
    .replace(/\brubric\b/ig, "Rubik's Cube")
    .trim();
  return youtubeSearch(query, shorts);
}
