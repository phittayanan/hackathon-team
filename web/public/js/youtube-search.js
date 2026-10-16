// Build a YouTube results URL without an API key or trusting a URL from the agent.
export function youtubeSearch(query) {
  const clean = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  if (clean.length < 2) return null;
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', clean);
  return { query: clean, url: url.href };
}

export function videoQueryFromRequest(request) {
  let query = typeof request === 'string' ? request.replace(/\s+/g, ' ').trim() : '';
  query = query
    .replace(/^(?:please\s+)?(?:help\s+me\s+)?(?:find|search\s+for|recommend)\s+/i, '')
    .replace(/^(?:ช่วย\s*)?(?:หา|ค้นหา|แนะนำ)\s*/i, '')
    .replace(/^(?:a\s+)?(?:video|videos|clip|youtube|ยูทูบ|วิดีโอ|คลิป)\s*/i, '')
    .replace(/^(?:สอน|เกี่ยวกับ|เรื่อง|tutorial\s+(?:for|on)?)\s*/i, '')
    .replace(/\s*(?:ให้หน่อย|หน่อย|ให้ที|ได้ไหม|please|for me)$/i, '')
    .replace(/\brubric\b/ig, "Rubik's Cube")
    .trim();
  return youtubeSearch(query);
}
