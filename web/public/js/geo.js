// The user's position for a nearby search, asked only when a places search needs it.
// Resolves null when the browser has no geolocation, the user blocks it, or it takes too long:
// the search then runs without a position (Google biases by region only).
// The position stays in this page: it goes to our server and Google for the search, never to the agent.
export function currentPosition({ timeoutMs = 5000, geo = globalThis.navigator?.geolocation } = {}) {
  if (!geo?.getCurrentPosition) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    geo.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}
