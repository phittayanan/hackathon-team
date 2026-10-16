// Video search: a list of YouTube videos (POST /api/videos), tap one to play it here in an embedded player.
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
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

export function videoSummary({ query, videos, error, playing }) {
  if (error) return `Video search for "${query}" failed: ${error}. Only the link to YouTube results is on screen.`;
  if (!videos) return `Searching YouTube videos for "${query}".`;
  if (!videos.length) return `No video list for "${query}"; only the link to YouTube results is on screen.`;
  const list = videos.slice(0, 5).map((v, i) => `${i + 1}. ${v.title}${v.channel ? ` (${v.channel})` : ''}`).join('; ');
  return `YouTube results for "${query}" listed on screen (titles from YouTube search; nobody watched them): ${list}.` +
    (playing ? ` Now playing: ${playing.title}.` : '');
}

export default function mountVideoSearch(el, data, agent) {
  const result = youtubeSearch(data?.query);
  if (!result) {
    agent.close();
    return {};
  }

  el.className = 'scene scene-video-search';
  el.dataset.scene = 'video-search';
  el.dataset.testid = 'video-search';
  const heading = h('h1', 'video-search-title', 'ค้นหาวิดีโอบน YouTube');
  const query = h('p', 'video-search-query', result.query);
  query.dataset.testid = 'video-search-query';
  const status = h('p', 'video-search-note', 'กำลังหาคลิป…');
  status.setAttribute('role', 'status');
  const list = h('ul', 'video-list');
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

  let facts = { query: result.query, videos: null, error: null, playing: null };
  const controller = new AbortController();

  let lastPlayed = null;
  const showList = () => {
    player.replaceChildren();
    player.hidden = true;
    list.hidden = false;
    actions.hidden = false;
    facts = { ...facts, playing: null };
    list.querySelector(`[data-id="${lastPlayed}"]`)?.focus();
  };

  const play = (video) => {
    lastPlayed = video.id;
    const frame = h('iframe', 'video-frame');
    frame.src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`;
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
    out.href = watchUrl(video.id);
    out.target = '_blank';
    out.rel = 'noopener noreferrer';
    const row = h('div', 'video-search-actions');
    row.append(back, out);
    player.replaceChildren(frame, h('h2', 'video-player-title', video.title), row);
    player.hidden = false;
    list.hidden = true;
    // While a clip plays only two buttons show: back to the list, or the same clip on YouTube.
    actions.hidden = true;
    facts = { ...facts, playing: video };
    back.focus();
    agent.tell?.(`[screen] The user is playing "${video.title}"${video.channel ? ` by ${video.channel}` : ''} from the YouTube list.`);
  };

  const render = (videos) => {
    list.replaceChildren(...videos.map((video) => {
      const item = h('li');
      const button = h('button', 'video-card');
      button.type = 'button';
      button.dataset.id = video.id;
      const thumb = h('img', 'video-thumb');
      thumb.src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      const text = h('span', 'video-card-text');
      text.append(h('span', 'video-card-title', video.title), h('span', 'video-card-meta', video.channel || 'YouTube'));
      button.append(thumb, text);
      button.addEventListener('click', () => play(video));
      item.append(button);
      return item;
    }));
  };

  (async () => {
    try {
      const res = await apiFetch('/api/videos', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: result.query }), signal: controller.signal });
      const out = await res.json().catch(() => ({}));
      if (agent.alive && !agent.alive()) return;
      const videos = (Array.isArray(out.videos) ? out.videos : []).filter((v) => typeof v?.id === 'string' && ID.test(v.id) && typeof v.title === 'string');
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
