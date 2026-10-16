// Video list for the video-search scene: YouTube Data API v3 search (YOUTUBE_API_KEY, about 100 searches a
// day on the free quota). Only the video id, title, channel, date and length leave this file; the page builds
// the thumbnail, embed and watch URLs from the id itself, so no URL from the API reaches the page.
const SEARCH = 'https://www.googleapis.com/youtube/v3/search';
const DETAILS = 'https://www.googleapis.com/youtube/v3/videos';
const ID = /^[A-Za-z0-9_-]{11}$/;
const THAI = /[\u0E00-\u0E7F]/;
// A Short is at most 3 minutes. The API has no "is a Short" flag, so Shorts mode searches with
// "#shorts" and videoDuration=short (under 4 minutes), then keeps clips of 3 minutes or less.
const SHORT_MAX_SECONDS = 180;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
// The API escapes HTML in titles ("Rubik&#39;s"); the page draws text with textContent, so unescape once.
const text = (value, length) => String(value ?? '')
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ENTITIES[name])
  .replace(/\s+/g, ' ').trim().slice(0, length);

export const videosReady = (env = process.env) => Boolean(env.YOUTUBE_API_KEY);

// ISO 8601 duration from the API ("PT1M5S") -> seconds; null when it is not one.
export function seconds(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso || ''));
  if (!m || /^PT?$/.test(iso)) return null;
  const [d, h, min, sec] = m.slice(1).map((v) => Number(v || 0));
  return d * 86400 + h * 3600 + min * 60 + sec;
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
  // 403 is the daily quota or a key without the YouTube Data API enabled; never echo the key or the API's text.
  if (!res.ok) throw new Error(res.status === 403 ? 'YouTube quota or key problem' : `YouTube request failed (${res.status})`);
  return res.json();
}

export async function searchYouTubeVideos({ query, shorts = false } = {}, env = process.env, fetchImpl = fetch) {
  const clean = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : '';
  if (clean.length < 2 || clean.length > 160) throw new Error('คำค้นวิดีโอต้องยาว 2 ถึง 160 ตัวอักษร');
  if (!videosReady(env)) throw new Error('no YOUTUBE_API_KEY');
  shorts = shorts === true;
  const url = new URL(SEARCH);
  for (const [key, value] of Object.entries({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'strict', maxResults: shorts ? '15' : '8',
    regionCode: 'TH', relevanceLanguage: THAI.test(clean) ? 'th' : 'en', q: shorts ? `${clean} #shorts` : clean,
    ...(shorts ? { videoDuration: 'short' } : {}), key: env.YOUTUBE_API_KEY,
  })) url.searchParams.set(key, value);
  const body = await getJson(url.href, fetchImpl);
  if (!Array.isArray(body?.items)) throw new Error('YouTube search returned no list');
  const videos = body.items.flatMap((item) => {
    const id = item?.id?.videoId;
    if (item?.id?.kind !== 'youtube#video' || typeof id !== 'string' || !ID.test(id)) return [];
    const title = text(item.snippet?.title, 160);
    if (!title) return [];
    return [{ id, title, channel: text(item.snippet?.channelTitle, 80), published: text(item.snippet?.publishedAt, 10) }];
  });
  if (!shorts || !videos.length) return { provider: 'youtube', query: clean, shorts, videos };

  // Shorts: one more call (1 quota unit) for the lengths; a clip whose length is unknown is dropped.
  const details = new URL(DETAILS);
  details.searchParams.set('part', 'contentDetails');
  details.searchParams.set('id', videos.map((v) => v.id).join(','));
  details.searchParams.set('key', env.YOUTUBE_API_KEY);
  const more = await getJson(details.href, fetchImpl);
  const lengths = new Map((Array.isArray(more?.items) ? more.items : []).map((item) => [item?.id, seconds(item?.contentDetails?.duration)]));
  const short = videos.flatMap((v) => {
    const length = lengths.get(v.id);
    return Number.isFinite(length) && length > 0 && length <= SHORT_MAX_SECONDS ? [{ ...v, seconds: length }] : [];
  });
  return { provider: 'youtube', query: clean, shorts, videos: short.slice(0, 10) };
}
