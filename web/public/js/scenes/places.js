// Nearby places from Google Maps: asks the browser for the position, searches through our server
// (/api/places, key on the server) and shows one card per place. Results reach the live agent as a
// [scene event], which starts its turn (a [screen] note would not), so it names the places found
// even after it finished its "looking now" line. Nothing here opens another app
// unless the user taps "ดูใน Google Maps" on a card.
import { apiFetch } from '../api.js';
import { currentPosition } from '../geo.js';
import { placesSummary } from '../scene-summary.js';

const h = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
export const distanceText = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m / 10) * 10} ม.` : `${(m / 1000).toFixed(1)} กม.`);
const openText = (open) => (open === true ? 'เปิดอยู่' : open === false ? 'ปิดแล้ว' : '');

export default function mountPlaces(el, data, agent) {
  const query = typeof data?.query === 'string' ? data.query.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  const status = h('p', 'กำลังหาตำแหน่งของคุณ…', 'secretary-note');
  status.setAttribute('role', 'status');
  const results = h('div');
  results.dataset.testid = 'places-results';
  // Google Maps attribution, required when Places data is shown without a Google map.
  const credit = h('p', 'Google Maps', 'places-credit');
  credit.setAttribute('translate', 'no');
  const close = h('button', 'กลับหน้าหลัก · Home', 'secretary-button');
  close.type = 'button';
  close.addEventListener('click', () => agent.close());
  const title = h('h1', query || 'สถานที่ใกล้คุณ', 'secretary-title');
  title.dataset.testid = 'places-query';
  el.replaceChildren(h('p', 'ใกล้ฉัน', 'secretary-badge'), title, status, results, credit, close);

  let facts = { query, near: null, results: null, error: null, searching: true };
  const controller = new AbortController();
  // Live only (no label: offline the router already spoke). Nothing is sent once the page is closed.
  const report = (prefix) => agent.event?.(`${prefix}: ${placesSummary(facts)} Tell the user now in one or two short sentences.`);

  (async () => {
    if (query.length < 2) throw new Error('ไม่ได้บอกว่าอยากหาอะไร');
    const at = await currentPosition();
    if (!agent.alive()) return;
    facts.near = Boolean(at);
    status.textContent = at ? 'กำลังค้นใน Google Maps…' : 'ไม่ได้รับตำแหน่ง · ค้นจากทั้งประเทศแทน…';
    const res = await apiFetch('/api/places', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ query, ...(at || {}) }),
    });
    const out = await res.json();
    if (!agent.alive()) return;
    if (!res.ok || out.error) throw new Error(out.error || 'Google Maps ไม่พร้อมใช้งาน');
    const found = [];
    for (const place of out.places || []) {
      const card = h('article', null, 'secretary-card places-card');
      const meta = [distanceText(place.distanceM), place.rating ? `★ ${place.rating.toFixed(1)}${place.ratings ? ` (${place.ratings.toLocaleString('th-TH')})` : ''}` : '', openText(place.openNow)]
        .filter(Boolean).join(' · ');
      card.append(h('h2', place.name), h('p', meta, 'places-meta'), h('p', place.address, 'secretary-note'));
      if (place.url) {
        const url = new URL(place.url);
        if (url.protocol === 'https:') {
          const link = h('a', 'ดูใน Google Maps', 'catalog-store-link');
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          card.append(link);
        }
      }
      results.append(card);
      found.push({ name: place.name, distance: distanceText(place.distanceM), rating: place.rating ? place.rating.toFixed(1) : '', open: openText(place.openNow) });
    }
    facts = { ...facts, results: found, searching: false };
    status.textContent = found.length ? `พบ ${found.length} แห่ง` : 'ไม่พบสถานที่ที่ตรงกับคำค้น ลองพูดใหม่อีกครั้ง';
    report('Places results');
  })().catch((err) => {
    if (err.name === 'AbortError' || !agent.alive()) return;
    facts = { ...facts, error: err.message, searching: false };
    status.textContent = `ค้นหาไม่สำเร็จ: ${err.message}`;
    report('Places search failed');
  });

  return {
    destroy: () => controller.abort(),
    onAction: () => {},
    summary: () => placesSummary(facts),
    state: () => ({ query: facts.query, near: facts.near, results: facts.results || [], error: facts.error }),
  };
}
