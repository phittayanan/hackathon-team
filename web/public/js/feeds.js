// Fake data feeds the always-on agent watches: email, calendar, health (sleep and runs), flight status.
// Each feed has a version that goes up when it changes. Events change feeds; the demo script
// fires them in a fixed order, and the presenter can fire one by hand.
const initial = () => ({
  email: { version: 0, messages: [{ id: 'm1', from: 'Mom', subject: 'ของที่ต้องซื้อสัปดาห์นี้', kind: 'shopping' }] },
  calendar: { version: 0, events: [{ day: 'tomorrow', time: '11:00', title: 'Client meeting, Chiang Mai' }] },
  health: { version: 0, synced: false, sleepScore: null, raceOpen: false, race: 'Bangkok City 10K' },
  flight: {
    version: 0, code: 'TG 102', day: 'tomorrow', from: 'BKK', to: 'CNX', depart: '08:00', arrive: '09:15',
    status: 'on-time', delayMinutes: 0, cause: null, faster: { code: 'FD 3433', arrive: '09:55' },
  },
});

export const EVENTS = {
  'sleep-synced': (f) => bump(f.health, { synced: true, sleepScore: 86, raceOpen: true }),
  'flight-delayed': (f) => bump(f.flight, { status: 'delayed', delayMinutes: 120, cause: 'ground delay at BKK' }),
  'flight-on-time': (f) => bump(f.flight, { status: 'on-time', delayMinutes: 0, cause: null }),
  'email-shopping': (f) => bump(f.email, { messages: [...f.email.messages, { id: `m${f.email.messages.length + 1}`, from: 'FreshMart', subject: 'Your weekly deals', kind: 'promo' }] }),
};

function bump(feed, patch) {
  Object.assign(feed, patch);
  feed.version += 1;
}

export function createFeeds() {
  let feeds = initial();
  return {
    get: () => feeds,
    fire(event) {
      if (event === 'reset') {
        feeds = initial();
        return true;
      }
      if (!EVENTS[event]) return false;
      EVENTS[event](feeds);
      return true;
    },
    versions: () => Object.fromEntries(Object.entries(feeds).map(([k, v]) => [k, v.version])),
  };
}

// The demo script: after the user's scene closes, the next feed event comes a few seconds later,
// so the stage order is always shopping/payment -> training -> flight.
export const DEMO_SCRIPT = [
  { afterScene: 'payment', delaySec: 6, event: 'sleep-synced' },
  { afterScene: 'training', delaySec: 6, event: 'flight-delayed' },
];
