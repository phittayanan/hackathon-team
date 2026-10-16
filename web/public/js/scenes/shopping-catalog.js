import { apiFetch } from '../api.js';
import { catalogSummary } from '../scene-summary.js';

export function mountCatalog(el, data, agent) {
  const h = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const form = h('form', null, 'product-search-form');
  const queryLabel = h('label', 'อยากได้สินค้าแบบไหน');
  const query = h('input'); query.type = 'search'; query.required = true; query.maxLength = 250;
  query.placeholder = 'เช่น หูฟังไร้สายสำหรับประชุม'; query.value = typeof data.query === 'string' ? data.query.slice(0, 250) : '';
  queryLabel.append(query);
  const budgetLabel = h('label', 'งบสูงสุด (บาท · ไม่ระบุก็ได้)');
  const budget = h('input'); budget.type = 'number'; budget.min = '1'; budget.max = '10000000'; budget.step = '1';
  if (Number.isFinite(data.budget) && data.budget > 0) budget.value = String(data.budget);
  budgetLabel.append(budget);
  const submit = h('button', 'ค้นสินค้า', 'secretary-button'); submit.type = 'submit';
  form.append(queryLabel, budgetLabel, submit);
  const status = h('p', 'บอกประเภท คุณสมบัติ หรือสไตล์ที่ต้องการได้เลย', 'secretary-note'); status.setAttribute('role', 'status');
  const results = h('div'); results.dataset.testid = 'catalog-results';
  el.append(h('p', 'Shopify Global Catalog · ส่งมายังไทย', 'secretary-badge'), h('h1', 'เลือกของที่ใช่', 'secretary-title'), form,
    h('p', 'ค้นสินค้าข้ามร้านที่อยู่ใน Catalog ราคาและการจัดส่งต้องตรวจที่ร้านอีกครั้ง การเลือกรายการยังไม่ใช่การซื้อ', 'secretary-note'), status, results);
  let controller = null; let latest = 0;
  // What the agent is told and state() returns: the last search and what it found.
  let facts = { query: query.value.trim(), budget: Number(budget.value) || null, results: null, error: null, chosen: null, searching: false };
  const search = async () => {
    if (!query.value.trim()) return;
    const mine = ++latest; controller?.abort(); controller = new AbortController();
    results.replaceChildren(); submit.disabled = true; status.textContent = 'กำลังค้นสินค้าจาก Shopify…';
    facts = { query: query.value.trim(), budget: Number(budget.value) || null, results: null, error: null, chosen: null, searching: true };
    const found = [];
    try {
      const res = await apiFetch('/api/catalog', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: query.value.trim(), ...(budget.value ? { budget: Number(budget.value) } : {}) }), signal: controller.signal });
      const out = await res.json();
      if (!agent.alive() || mine !== latest) return;
      if (!res.ok || out.error) throw new Error(out.error || 'Shopify ไม่พร้อมใช้งาน');
      for (const product of out.products || []) {
        const card = h('article', null, 'secretary-card catalog-product');
        if (product.image) {
          const url = new URL(product.image);
          if (url.protocol === 'https:') { const img = h('img'); img.src = url.href; img.alt = product.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; card.append(img); }
        }
        const currency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: product.currency });
        const scale = 10 ** currency.resolvedOptions().maximumFractionDigits;
        const price = currency.format(product.amount / scale);
        found.push({ title: product.title, seller: product.seller, price });
        card.append(h('h2', product.title), h('p', product.seller, 'secretary-note'), h('p', price, 'catalog-price'), h('p', product.description));
        const choose = h('button', 'เลือกรายการนี้', 'secretary-button'); choose.type = 'button'; choose.setAttribute('aria-pressed', 'false');
        choose.onclick = () => {
          results.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = 'เลือกรายการนี้'; });
          choose.setAttribute('aria-pressed', 'true'); choose.textContent = 'เลือกแล้ว'; status.textContent = `เลือก ${product.title} แล้ว · เปิดหน้าร้านเพื่อตรวจตัวเลือกและราคา ไม่มีการสั่งซื้ออัตโนมัติ`;
          facts.chosen = `${product.title} (${product.seller}) ${price}`;
          // Live agent only (no label: offline nothing is said for it).
          agent.event?.(`The user chose "${product.title}" from ${product.seller} at ${price} on the catalog page. Choosing is not buying; nothing was ordered.`);
        };
        card.append(choose);
        const url = new URL(product.url);
        if (url.protocol === 'https:') { const link = h('a', 'ดูสินค้าที่ร้าน', 'catalog-store-link'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
        results.append(card);
      }
      facts = { ...facts, results: found, searching: false };
      agent.tell?.(`[screen] Catalog results: ${catalogSummary(facts)}`);
      status.textContent = results.childElementCount ? `พบ ${results.childElementCount} ตัวเลือก · เลือกรายการที่สนใจได้เลย` : 'ยังไม่พบสินค้าที่ส่งมาไทยและตรงเงื่อนไข ลองเปลี่ยนคำค้นหรือปรับงบ';
    } catch (err) {
      if (err.name !== 'AbortError' && agent.alive() && mine === latest) {
        status.textContent = `ค้นหาไม่สำเร็จ: ${err.message}`;
        facts = { ...facts, results: null, error: err.message, searching: false };
        agent.tell?.(`[screen] Catalog search failed: ${catalogSummary(facts)}`);
      }
    }
    finally { if (mine === latest) submit.disabled = false; }
  };
  form.onsubmit = (event) => { event.preventDefault(); search(); };
  if (query.value.trim()) search();
  return { destroy: () => { latest++; controller?.abort(); }, onAction: () => {},
    summary: () => catalogSummary(facts),
    state: () => ({ catalog: true, query: facts.query, results: facts.results || [], error: facts.error, chosen: facts.chosen }) };
}
