import { apiFetch } from '../api.js';

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
  let controller = null; let latest = 0; let pending = Promise.resolve();
  let catalog = { catalog: true, query: query.value.trim(), budget: budget.value ? Number(budget.value) : null, status: 'idle', products: [], selectedId: null, error: null };
  const select = (id) => {
    const product = catalog.products.find((p) => p.id === id);
    if (catalog.status !== 'ready' || !product) return 'error: product is not in the displayed results';
    catalog.selectedId = id;
    results.querySelectorAll('button').forEach((b) => {
      const selected = b.dataset.productId === id;
      b.setAttribute('aria-pressed', String(selected)); b.textContent = selected ? 'เลือกแล้ว' : 'เลือกรายการนี้';
    });
    status.textContent = `เลือก ${product.title} แล้ว · เปิดหน้าร้านเพื่อตรวจตัวเลือกและราคา ไม่มีการสั่งซื้ออัตโนมัติ`;
  };
  const search = () => {
    const q = query.value.trim(); const cap = budget.value ? Number(budget.value) : null;
    if (!q || q.length > 250 || (cap !== null && (!Number.isFinite(cap) || cap <= 0 || cap > 10000000))) return 'error: invalid query or THB budget';
    const mine = ++latest; controller?.abort(); controller = new AbortController();
    catalog = { catalog: true, query: q, budget: cap, status: 'loading', products: [], selectedId: null, error: null };
    results.replaceChildren(); submit.disabled = true; status.textContent = 'กำลังค้นสินค้าจาก Shopify…';
    pending = (async () => {
      try {
        const res = await apiFetch('/api/catalog', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q, ...(cap === null ? {} : { budget: cap }) }), signal: controller.signal });
        const out = await res.json();
        if (!agent.alive() || mine !== latest) return;
        if (!res.ok || out.error) throw new Error(out.error || 'Shopify ไม่พร้อมใช้งาน');
        if (!Array.isArray(out.products)) throw new Error('Shopify ส่งข้อมูลสินค้าไม่ครบ');
        catalog.products = out.products.slice(0, 8).map(({ id, title, seller, amount, currency, description, url }, index) => ({ position: index + 1, id, title, seller, amount, currency, description, url }));
        for (const product of out.products.slice(0, 8)) {
          const card = h('article', null, 'secretary-card catalog-product');
          if (product.image) {
            const url = new URL(product.image);
            if (url.protocol === 'https:') { const img = h('img'); img.src = url.href; img.alt = product.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; card.append(img); }
          }
          const currency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: product.currency });
          const scale = 10 ** currency.resolvedOptions().maximumFractionDigits;
          card.append(h('h2', product.title), h('p', product.seller, 'secretary-note'), h('p', currency.format(product.amount / scale), 'catalog-price'), h('p', product.description));
          const choose = h('button', 'เลือกรายการนี้', 'secretary-button'); choose.type = 'button'; choose.setAttribute('aria-pressed', 'false');
          choose.dataset.productId = product.id;
          choose.onclick = () => select(product.id);
          card.append(choose);
          const url = new URL(product.url);
          if (url.protocol === 'https:') { const link = h('a', 'ดูสินค้าที่ร้าน', 'catalog-store-link'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
          results.append(card);
        }
        catalog.status = 'ready';
        status.textContent = results.childElementCount ? `พบ ${results.childElementCount} ตัวเลือก · เลือกรายการที่สนใจได้เลย` : 'ยังไม่พบสินค้าที่ส่งมาไทยและตรงเงื่อนไข ลองเปลี่ยนคำค้นหรือปรับงบ';
      } catch (err) {
        if (err.name !== 'AbortError' && agent.alive() && mine === latest) {
          catalog.status = 'error'; catalog.error = err.message; catalog.products = []; results.replaceChildren();
          status.textContent = `ค้นหาไม่สำเร็จ: ${err.message}`;
        }
      }
      finally { if (mine === latest) submit.disabled = false; }
    })();
    return pending;
  };
  form.onsubmit = (event) => { event.preventDefault(); search(); };
  if (query.value.trim()) search();
  return {
    destroy: () => { latest++; controller?.abort(); },
    ready: () => pending,
    state: () => structuredClone(catalog),
    onAction(action, patch = {}) {
      if (action === 'select') return select(patch.product_id);
      if (action !== 'search') return 'error: unknown catalog action';
      if (patch.query !== undefined && (typeof patch.query !== 'string' || !patch.query.trim() || patch.query.trim().length > 250)) return 'error: invalid query';
      if (Object.hasOwn(patch, 'budget') && patch.budget !== null && (!Number.isFinite(patch.budget) || patch.budget <= 0 || patch.budget > 10000000)) return 'error: invalid THB budget';
      query.value = patch.query ?? catalog.query;
      budget.value = Object.hasOwn(patch, 'budget') ? patch.budget ?? '' : catalog.budget ?? '';
      return search();
    },
  };
}
