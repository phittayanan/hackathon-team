import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPlaces, distanceM } from './places.js';
import { keywordRoute, placeQuery } from './router.js';
import { placesSummary } from '../public/js/scene-summary.js';

const env = { GOOGLE_MAPS_API_KEY: 'test-key' };
const place = { id: 'p1', displayName: { text: 'Cafe Amazon' }, formattedAddress: 'Bang Mot, Bangkok', location: { latitude: 13.652, longitude: 100.4943 },
  googleMapsUri: 'https://maps.google.com/?cid=1', rating: 4.4, userRatingCount: 120, currentOpeningHours: { openNow: true } };
const reply = (places) => async () => ({ ok: true, json: async () => ({ places }) });

test('Text Search sends the key in a header, a field mask, Thai language and a 5 km bias around the user', async () => {
  let sent;
  const out = await searchPlaces({ query: ' ร้านกาแฟ ', lat: 13.6512, lng: 100.4943 }, env, async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) }; return reply([place])();
  });
  assert.equal(sent.url, 'https://places.googleapis.com/v1/places:searchText');
  assert.equal(sent.options.headers['X-Goog-Api-Key'], 'test-key');
  assert.match(sent.options.headers['X-Goog-FieldMask'], /places\.displayName/);
  assert.doesNotMatch(sent.url, /test-key/);
  assert.deepEqual(sent.body, { textQuery: 'ร้านกาแฟ', languageCode: 'th', regionCode: 'TH', pageSize: 5,
    locationBias: { circle: { center: { latitude: 13.6512, longitude: 100.4943 }, radius: 5000 } } });
  assert.deepEqual(out.places[0], { id: 'p1', name: 'Cafe Amazon', address: 'Bang Mot, Bangkok', rating: 4.4, ratings: 120, openNow: true, distanceM: 89, url: 'https://maps.google.com/?cid=1' });
  assert.equal(out.near, true);
});

test('without a position there is no bias and no distance', async () => {
  let body;
  const out = await searchPlaces({ query: 'cafe' }, env, async (_u, o) => { body = JSON.parse(o.body); return reply([place])(); });
  assert.equal(body.locationBias, undefined);
  assert.equal(out.places[0].distanceM, null);
  assert.equal(out.near, false);
});

test('rejects bad input or a missing key before the network; maps HTTP errors', async () => {
  const fail = () => assert.fail('must not call');
  for (const input of [{}, { query: 'x' }, { query: 'x'.repeat(161) }, { query: 'cafe', lat: 200, lng: 0 }, { query: 'cafe', lat: 13 }, { query: 'cafe', lat: '13', lng: '100' }]) {
    await assert.rejects(searchPlaces(input, env, fail));
  }
  await assert.rejects(searchPlaces({ query: 'cafe' }, {}, fail), /GOOGLE_MAPS_API_KEY/);
  await assert.rejects(searchPlaces({ query: 'cafe' }, env, async () => ({ ok: false, status: 429 })), /จำกัดจำนวน/);
  await assert.rejects(searchPlaces({ query: 'cafe' }, env, async () => ({ ok: false, status: 403 })), /403/);
});

test('drops nameless places and links that are not Google Maps over HTTPS', async () => {
  const out = await searchPlaces({ query: 'cafe' }, env, reply([
    { ...place, displayName: {} },
    { ...place, googleMapsUri: 'javascript:alert(1)' },
    { ...place, googleMapsUri: 'https://evil.example/maps' },
  ]));
  assert.equal(out.places.length, 2);
  assert.deepEqual(out.places.map((p) => p.url), [null, null]);
});

test('distance is great-circle metres', () => {
  assert.equal(distanceM({ lat: 13.7563, lng: 100.5018 }, { lat: 13.7563, lng: 100.5018 }), 0);
  assert.ok(Math.abs(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111195) < 10);
});

test('offline router opens places only for a kind of place near the user', () => {
  assert.equal(placeQuery('หาร้านกาแฟแถวนี้ให้หน่อย'), 'ร้านกาแฟ');
  assert.equal(placeQuery('มีร้านขายยาใกล้ๆ ไหม'), 'ร้านขายยา');
  assert.equal(placeQuery('find a cafe near me'), 'cafe');
  assert.deepEqual(keywordRoute('โรงพยาบาลใกล้ฉันอยู่ไหน').data, { query: 'โรงพยาบาล' });
  assert.equal(keywordRoute('วิ่งแถวนี้ดีไหม').scene, 'training');
  assert.equal(keywordRoute('this week is hectic').scene, 'shopping');
});

test('the agent summary lists only found places and never coordinates', () => {
  const s = placesSummary({ query: 'ร้านกาแฟ', near: true, results: [{ name: 'Cafe Amazon', distance: '90 ม.', rating: '4.4', open: 'เปิดอยู่' }] });
  assert.match(s, /1\. Cafe Amazon 90 ม\., rating 4\.4, เปิดอยู่/);
  assert.match(s, /never invent/);
  assert.match(placesSummary({ query: 'x', near: false, results: [] }), /no user location.*no places found/);
  assert.match(placesSummary({ query: 'x', error: 'boom' }), /failed: boom/);
});
