import { youtubeSearch } from '../youtube-search.js';

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

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
  const note = h('p', 'video-search-note', 'เปิดผลการค้นหาล่าสุด แล้วเลือกคลิปที่ต้องการ');
  const link = h('a', 'video-search-link', 'เปิดผลการค้นหา');
  link.href = result.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.testid = 'video-search-link';
  const close = h('button', 'video-search-close', 'กลับหน้าหลัก · Home');
  close.type = 'button';
  close.addEventListener('click', () => agent.close());
  el.replaceChildren(heading, query, note, link, close);
  return { state: () => result };
}
