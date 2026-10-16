// Video search: a list of YouTube videos (POST /api/videos), tap one to play it here in an embedded player.
// Shorts mode (data.shorts): a 2-column grid of vertical clips; the player is 9:16, loops, and has a
// "next" button (and arrow keys) to move through the clips like the Shorts feed.
// Without YOUTUBE_API_KEY, over the quota or on an error, the scene keeps only the link to YouTube's
// own results page. Thumbnail, embed and watch URLs are built from the 11-character video id only.
import { apiFetch } from '../api.js';
import { youtubeSearch } from '../youtube-search.js';

const ID = /^[A-Za-z0-9_-]{11}$/;
const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const watchUrl = (id, shorts) => (shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);
const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export function videoSummary({ query, shorts, videos, error, playing }) {
  if (error) return `Video search for "${query}" failed: ${error}. Only the link to YouTube results is on screen.`;
  if (!videos) return `Searching YouTube videos for "${query}".`;
  if (!videos.length) return `No video list for "${query}"; only the link to YouTube results is on screen.`;
  const list = videos.slice(0, 5).map((v, i) => `${i + 1}. ${v.title}${v.channel ? ` (${v.channel})` : ''}`).join('; ');
  return `YouTube ${shorts ? 'Shorts' : 'results'} for "${query}" listed on screen (titles from YouTube search; nobody watched them): ${list}.` +
    (playing ? ` Now playing: ${playing.title}.` : '');
}

export default function mountVideoSearch(el, data, agent) {
  const result = youtubeSearch(data?.query, data?.shorts === true);
  if (!result) {
    agent.close();
    return {};
  }

  const shorts = result.shorts;
  el.className = `scene scene-video-search${shorts ? ' is-shorts' : ''}`;
  el.dataset.scene = 'video-search';
  el.dataset.testid = 'video-search';
  const heading = h('h1', 'video-search-title', shorts ? 'YouTube Shorts' : 'ค้นหาวิดีโอบน YouTube');
  const query = h('p', 'video-search-query', result.query);
  query.dataset.testid = 'video-search-query';
  const status = h('p', 'video-search-note', 'กำลังหาคลิป…');
  status.setAttribute('role', 'status');
  const list = h('ul', shorts ? 'video-list shorts-grid' : 'video-list');
  list.dataset.testid = 'video-list';
  const player = h('section', 'video-player');
  player.dataset.testid = 'video-player';
  player.hidden = true;
  const link = h('a', 'video-search-link', 'เปิดผลการค้นหาใน YouTube');
  link.href = result.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.testid = 'video-search-link';
  const close = h('button', 'video-search-close', 'กลับหน้าหลัก · Home');
  close.type = 'button';
  close.addEventListener('click', () => agent.close());
  const actions = h('div', 'video-search-actions');
  actions.append(link, close);
  el.replaceChildren(heading, query, status, player, list, actions);

  let facts = { query: result.query, shorts, videos: null, error: null, playing: null };
  const controller = new AbortController();

  let lastPlayed = null;
  const showList = () => {
    player.replaceChildren();
    player.hidden = true;
    list.hidden = false;
    actions.hidden = false;
    for (const part of [heading, query, status]) part.hidden = false;
    facts = { ...facts, playing: null };
    list.querySelector(`[data-id="${lastPlayed}"]`)?.focus();
  };

  const play = (video) => {
    lastPlayed = video.id;
    const frame = h('iframe', shorts ? 'video-frame short-frame' : 'video-frame');
    // A Short loops, as in the YouTube app (loop needs playlist=<the same id>).
    frame.src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1${shorts ? `&loop=1&playlist=${video.id}` : ''}`;
    frame.title = video.title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.dataset.testid = 'video-frame';
    const back = h('button', 'video-search-close', '← กลับไปที่รายการ');
    back.type = 'button';
    back.dataset.testid = 'video-back';
    back.addEventListener('click', showList);
    // Some owners turn embedding off; the watch page always works.
    const out = h('a', 'video-search-close', 'เปิดใน YouTube');
    out.href = watchUrl(video.id, shorts);
    out.target = '_blank';
    out.rel = 'noopener noreferrer';
    const row = h('div', 'video-search-actions');
    const videos = facts.videos || [];
    if (shorts && videos.length > 1) {
      const next = h('button', 'video-search-link', 'คลิปถัดไป ↓');
      next.type = 'button';
      next.dataset.testid = 'video-next';
      next.addEventListener('click', () => step(1));
      row.append(back, next, out);
    } else row.append(back, out);
    player.replaceChildren(frame, h('h2', 'video-player-title', video.title), row);
    player.hidden = false;
    list.hidden = true;
    // While a clip plays only two buttons show: back to the list, or the same clip on YouTube.
    actions.hidden = true;
    // The clip gets the screen: the header comes back with the list.
    for (const part of [heading, query, status]) part.hidden = true;
    facts = { ...facts, playing: video };
    back.focus();
    agent.tell?.(`[screen] The user is playing "${video.title}"${video.channel ? ` by ${video.channel}` : ''} from the YouTube ${shorts ? 'Shorts' : 'list'}.`);
  };
  // Shorts feed: the next (or previous) clip, wrapping at the end.
  const step = (by) => {
    const videos = facts.videos || [];
    const at = videos.findIndex((v) => v.id === facts.playing?.id);
    if (at < 0 || videos.length < 2) return;
    play(videos[(at + by + videos.length) % videos.length]);
    player.querySelector('[data-testid="video-next"]')?.focus();
  };
  const onKey = (event) => {
    if (!shorts || player.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); step(-1); }
  };
  el.addEventListener('keydown', onKey);

  const render = (videos) => {
    list.replaceChildren(...videos.map((video) => {
      const item = h('li');
      const button = h('button', 'video-card');
      button.type = 'button';
      button.dataset.id = video.id;
      const thumb = h('img', 'video-thumb');
      thumb.src = `https://i.ytimg.com/vi/${video.id}/${shorts ? 'hqdefault' : 'mqdefault'}.jpg`;
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      const text = h('span', 'video-card-text');
      text.append(h('span', 'video-card-title', video.title), h('span', 'video-card-meta', video.channel || 'YouTube'));
      if (shorts && Number.isFinite(video.seconds)) {
        const badge = h('span', 'video-length', clock(video.seconds));
        button.append(badge);
      }
      button.append(thumb, text);
      button.addEventListener('click', () => play(video));
      item.append(button);
      return item;
    }));
  };

  (async () => {
    try {
      const res = await apiFetch('/api/videos', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: result.query, ...(shorts ? { shorts: true } : {}) }), signal: controller.signal });
      const out = await res.json().catch(() => ({}));
      if (agent.alive && !agent.alive()) return;
      const videos = (Array.isArray(out.videos) ? out.videos : [])
        .filter((v) => typeof v?.id === 'string' && ID.test(v.id) && typeof v.title === 'string')
        .map((v) => ({ ...v, seconds: Number.isInteger(v.seconds) && v.seconds > 0 ? v.seconds : null }));
      if (!res.ok || out.error || out.unavailable) {
        facts = { ...facts, videos: [], error: out.error || (out.unavailable ? 'no video list on this site' : `HTTP ${res.status}`) };
        status.textContent = 'ดึงรายการคลิปไม่ได้ตอนนี้ · กดเปิดผลการค้นหาใน YouTube แทนได้';
      } else {
        facts = { ...facts, videos };
        render(videos);
        status.textContent = videos.length ? `พบ ${videos.length} คลิป · แตะเพื่อดู` : 'ไม่พบคลิป · ลองเปิดผลการค้นหาใน YouTube';
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      facts = { ...facts, videos: [], error: err.message };
      status.textContent = 'ดึงรายการคลิปไม่ได้ตอนนี้ · กดเปิดผลการค้นหาใน YouTube แทนได้';
    }
    agent.tell?.(`[screen] ${videoSummary(facts)}`);
  })();

  return {
    destroy: () => controller.abort(),
    onAction: () => {},
    summary: () => videoSummary(facts),
    state: () => ({ ...result, videos: facts.videos || [], error: facts.error, playing: facts.playing?.title || null }),
  };
}
