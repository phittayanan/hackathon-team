// Nearby places through Google Places API (New) Text Search, with the key kept on the server.
// Checked October 2026: https://developers.google.com/maps/documentation/places/web-service/text-search
// - POST places:searchText, headers X-Goog-Api-Key and X-Goog-FieldMask (no default fields).
// - rating, userRatingCount and currentOpeningHours bill as the Enterprise SKU; the rest is Pro.
// - Places content must not be cached or stored (place ids may be), so nothing here is kept.
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri', 'rating', 'userRatingCount', 'currentOpeningHours.openNow']
  .map((f) => `places.${f}`).join(',');
const RADIUS_M = 5000;
const MAX_RESULTS = 5;
const text = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
const mapsUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)google\.com$/.test(url.hostname) ? url.href : null; } catch { return null; }
};
const isCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Great-circle distance in metres.
export function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

// { query, lat?, lng? } -> { provider, query, near, places: [{ id, name, address, rating, ratings, openNow, distanceM, url }] }
export async function searchPlaces({ query, lat, lng } = {}, env = process.env, fetchImpl = fetch) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 160) throw new Error('กรุณาบอกสถานที่ที่อยากหา 2 ถึง 160 ตัวอักษร');
  if ((lat != null || lng != null) && !isCoord(lat, lng)) throw new Error('ตำแหน่งไม่ถูกต้อง');
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_MAPS_API_KEY');
  const near = lat != null ? { lat, lng } : null;
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({
      textQuery: query.trim(), languageCode: 'th', regionCode: 'TH', pageSize: MAX_RESULTS,
      ...(near ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS_M } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Google Maps จำกัดจำนวนคำขอ กรุณารอสักครู่แล้วลองใหม่' : `Google Maps ไม่พร้อมใช้งาน (${res.status})`);
  const body = await res.json();
  const places = (Array.isArray(body.places) ? body.places : []).slice(0, MAX_RESULTS).flatMap((p) => {
    const name = text(p.displayName?.text, 120);
    if (!name) return [];
    const at = p.location;
    return [{
      id: text(p.id, 200), name, address: text(p.formattedAddress, 200),
      rating: Number.isFinite(p.rating) ? p.rating : null,
      ratings: Number.isSafeInteger(p.userRatingCount) ? p.userRatingCount : null,
      openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
      distanceM: near && isCoord(at?.latitude, at?.longitude) ? distanceM(near, { lat: at.latitude, lng: at.longitude }) : null,
      url: mapsUrl(p.googleMapsUri),
    }];
  });
  return { provider: 'google-maps', query: query.trim(), near: Boolean(near), places };
}
