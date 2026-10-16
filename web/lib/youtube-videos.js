// Video list for the video-search scene: YouTube Data API v3 search (YOUTUBE_API_KEY, about 100 searches a
// day on the free quota). Only the video id, title, channel and date leave this file; the page builds the
// thumbnail, embed and watch URLs from the id itself, so no URL from the API reaches the page.
const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const ID = /^[A-Za-z0-9_-]{11}$/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
// The API escapes HTML in titles ("Rubik&#39;s"); the page draws text with textContent, so unescape once.
const text = (value, length) => String(value ?? '')
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ENTITIES[name])
  .replace(/\s+/g, ' ').trim().slice(0, length);

export const videosReady = (env = process.env) => Boolean(env.YOUTUBE_API_KEY);

export async function searchYouTubeVideos({ query } = {}, env = process.env, fetchImpl = fetch) {
  const clean = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : '';
  if (clean.length < 2 || clean.length > 160) throw new Error('คำค้นวิดีโอต้องยาว 2 ถึง 160 ตัวอักษร');
  if (!videosReady(env)) throw new Error('no YOUTUBE_API_KEY');
  const url = new URL(ENDPOINT);
  for (const [key, value] of Object.entries({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'strict', maxResults: '8',
    regionCode: 'TH', relevanceLanguage: /[฀-๿]/.test(clean) ? 'th' : 'en', q: clean, key: env.YOUTUBE_API_KEY,
  })) url.searchParams.set(key, value);
  const res = await fetchImpl(url.href, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
  // 403 is the daily quota or a key without the YouTube Data API enabled; never echo the key or the API's text.
  if (!res.ok) throw new Error(res.status === 403 ? 'YouTube quota or key problem' : `YouTube search failed (${res.status})`);
  const body = await res.json();
  if (!Array.isArray(body?.items)) throw new Error('YouTube search returned no list');
  const videos = body.items.flatMap((item) => {
    const id = item?.id?.videoId;
    if (item?.id?.kind !== 'youtube#video' || typeof id !== 'string' || !ID.test(id)) return [];
    const title = text(item.snippet?.title, 160);
    if (!title) return [];
    return [{ id, title, channel: text(item.snippet?.channelTitle, 80), published: text(item.snippet?.publishedAt, 10) }];
  });
  return { provider: 'youtube', query: clean, videos };
}
