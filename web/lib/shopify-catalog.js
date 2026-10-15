const ENDPOINT = 'https://catalog.shopify.com/api/ucp/mcp';
// shortcut: Shopify's documented example profile is used for the demo; host our own profile before production.
const DEMO_PROFILE = 'https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json';
const text = (value, length) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
const https = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
};

export async function searchShopifyCatalog({ query, budget } = {}, env = process.env, fetchImpl = fetch) {
  if (typeof query !== 'string' || !query.trim() || query.length > 250) throw new Error('กรุณาระบุสินค้าที่ต้องการ ไม่เกิน 250 ตัวอักษร');
  if (budget != null && (!Number.isFinite(budget) || budget <= 0 || budget > 10000000)) throw new Error('งบประมาณต้องเป็นจำนวนบวกไม่เกิน 10,000,000 บาท');
  const profile = https(env.SHOPIFY_AGENT_PROFILE_URL || DEMO_PROFILE);
  if (!profile) throw new Error('Shopify agent profile must use HTTPS');
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
      name: 'search_catalog', arguments: {
        meta: { 'ucp-agent': { profile } },
        catalog: { query: query.trim(), context: { address_country: 'TH', currency: 'THB', language: 'th' },
          filters: { ships_to: { country: 'TH' }, available: true, ...(budget == null ? {} : { price: { max: Math.floor(budget * 100) } }) },
          pagination: { limit: 8 } },
      },
    } }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Shopify จำกัดจำนวนคำขอ กรุณารอสักครู่แล้วลองใหม่' : `Shopify Catalog ไม่พร้อมใช้งาน (${res.status})`);
  const body = await res.json();
  if (body.error || body.result?.isError) throw new Error('Shopify Catalog ปฏิเสธคำขอ กรุณาลองใหม่');
  const data = body.result?.structuredContent;
  if (!Array.isArray(data?.products)) throw new Error('Shopify Catalog ส่งข้อมูลไม่ครบ กรุณาลองใหม่');
  const products = data.products.slice(0, 8).flatMap((product) => {
    const variant = product.variants?.find((v) => v.availability?.available !== false && https(v.url || product.url)
      && (budget == null || (v.price?.currency === 'THB' && v.price.amount <= Math.floor(budget * 100))));
    if (!variant) return [];
    const price = variant.price;
    if (!Number.isSafeInteger(price?.amount) || price.amount < 0 || !/^[A-Z]{3}$/.test(price.currency)) return [];
    // Budget filtering is checked again locally: never label another currency as baht.
    if (budget != null && (price.currency !== 'THB' || price.amount > Math.floor(budget * 100))) return [];
    const image = (variant.media || product.media || []).find((m) => m.type === 'image' && https(m.url));
    return [{ id: text(product.id, 150), title: text(product.title, 180), variant: text(variant.title, 160),
      seller: text(variant.seller?.name, 100), amount: price.amount, currency: price.currency,
      description: text(product.metadata?.top_features?.slice(0, 2).join(' · ') || product.description?.plain || product.description?.html, 350),
      url: https(variant.url || product.url), image: image ? https(image.url) : null }];
  });
  return { provider: 'shopify', query: query.trim(), country: 'TH', budget: budget ?? null, products };
}
