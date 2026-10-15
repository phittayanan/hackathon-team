// The always-on agent's speak-or-wait decision from feed changes, by simple rules.
// The same urgency and reasons go to the live agent in each feed update (agent-loop.js), so the
// offline rules and the live agent judge a feed change the same way.
export const PROACTIVE = { flight: 'flight_intro', training: 'train_intro' };

// How much a feed change may interrupt the user: high and medium are worth speaking first for.
export const URGENCY = ['none', 'low', 'medium', 'high'];
export const worthSpeaking = (urgency) => urgency === 'high' || urgency === 'medium';

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const toHhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Why a flight change matters: the new landing time against the user's calendar that day.
export function flightReason(feeds) {
  const f = feeds.flight;
  const lands = toHhmm(toMin(f.arrive) + f.delayMinutes);
  const meeting = feeds.calendar.events.find((e) => e.day === f.day);
  const clash = Boolean(meeting && toMin(lands) > toMin(meeting.time));
  return {
    lands,
    clash,
    why: clash
      ? `it now lands at ${lands} instead of ${f.arrive}, after the ${meeting.time} ${meeting.title} (it clashes)`
      : `it now lands at ${lands}; nothing on the calendar clashes`,
  };
}

// Urgency of one changed feed, from its current state.
export function feedUrgency(feeds, key) {
  if (key === 'flight') return feeds.flight.status !== 'delayed' ? 'none' : flightReason(feeds).clash ? 'high' : 'low';
  if (key === 'health') return feeds.health.synced && feeds.health.raceOpen ? 'medium' : 'none';
  if (key === 'email') return feeds.email.messages.at(-1)?.kind === 'shopping' ? 'medium' : 'none';
  if (key === 'calendar') return 'low';
  return 'none';
}

export function decideByRules(feeds, handled) {
  if (worthSpeaking(feedUrgency(feeds, 'flight')) && !handled.flight) {
    return { speak: true, scene: 'flight', reason: `flight ${feeds.flight.code} delayed ${feeds.flight.delayMinutes} min: ${flightReason(feeds).why}` };
  }
  if (worthSpeaking(feedUrgency(feeds, 'health')) && !handled.training) {
    return { speak: true, scene: 'training', reason: `sleep score ${feeds.health.sleepScore}, race sign-up open` };
  }
  return { speak: false, scene: null, reason: 'nothing worth interrupting for' };
}

// Offline speak-or-wait decision. With the live ElevenLabs agent, feed changes go into the
// conversation as contextual updates instead, and the agent decides (see agent-loop.js).
export function decide(feeds, changed, handled) {
  return { ...decideByRules(feeds, handled), via: 'rules' };
}
