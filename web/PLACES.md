# Nearby places through Google Maps

The user asks for a place near them ("หาร้านกาแฟแถวนี้ให้หน่อย"). The live agent calls
`find_places` with `{"query":"ร้านกาแฟ"}`; offline, the keyword router does the same when the
text names a kind of place and "near" (แถวนี้, ใกล้ๆ, near me). The places page grows out of the
home, asks the browser for the position, searches and shows up to 5 cards: name, distance,
rating, open now, address and a "ดูใน Google Maps" link. Nothing else opens unless the user taps it.

Flow: page -> `navigator.geolocation` (5 s, else no position) -> `POST /api/places
{query, lat?, lng?}` -> `lib/places.js` -> Google Places API (New) Text Search
(`places:searchText`, `languageCode: th`, `regionCode: TH`, 5 km location bias) -> cards ->
a `[scene event] Places results` message to the live agent. A scene event starts the agent's
turn (a `[screen]` note would not), so it names the top places even when they arrive after its
"looking now" line. Closing the page first sends nothing.

Privacy: the coordinates go to our server and Google for that one search only. They are not
logged, not stored and never sent to the agent; the agent hears names, distances, ratings and
open now. Places content is not cached (Google Maps Platform terms).

Setup: put `GOOGLE_MAPS_API_KEY` in the repo-root `.env` (next to `.env.example`; `server.js`
loads only that one) locally and in the Vercel project's environment
variables. In Google Cloud Console, restrict the key to Places API (New) and set a daily quota
cap. Without a key the page shows "ยังไม่ได้ตั้งค่า GOOGLE_MAPS_API_KEY" and the agent says the
search failed. Every search counts against the daily `calls` limit (lib/usage.js).

Cost: the field mask asks for `rating`, `userRatingCount` and `currentOpeningHours`, which bill
as the Text Search **Enterprise** SKU. Drop those three fields from `FIELDS` in `lib/places.js`
to bill as Pro instead.

Attribution: Places data shown without a Google map must carry "Google Maps" (`translate="no"`,
sans-serif 400, 12-16px, #5E5E5E). The page shows it under the cards; do not remove it.

On stage: allow location for the demo URL ahead of time (lock icon -> Site settings -> Location
-> Allow), so no permission prompt appears. A laptop's position comes from Wi-Fi and can be off.

References (checked October 2026):
https://developers.google.com/maps/documentation/places/web-service/text-search and
https://developers.google.com/maps/documentation/places/web-service/policies
