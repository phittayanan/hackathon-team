// The always-on agent: a loop in the page that watches the feeds every few seconds and
// decides by itself when to speak and which scene to open. (It runs in the browser, so the
// app needs no long-running server: it deploys as static files plus small functions.)
// It never speaks while a scene is open, while the agent talks, or while the user talks.
// Offline, simple rules decide and the page opens the scene. When the page runs the live
// ElevenLabs agent, feed changes go into the conversation as contextual updates instead,
// and the agent decides whether to speak.
import { decide as defaultDecide, PROACTIVE, URGENCY, feedUrgency, flightReason } from './brain.js';

export { flightReason };
import { LINES } from './lines.js';

// emit(event, data): 'proactive' { id, scene, line, say } offline, or 'feed' { changed, text, urgency, context } when live.
// The page answers a 'proactive' with ack({ id, ok }).
// quietMs: after the user's last interaction (tap, key, typing, speech), nothing is pushed for this
// long, so the agent never cuts in while the user is in the middle of something.
export function createAgentLoop({ feeds, script = [], tickMs = 3000, quietMs = 6000, clock = Date.now, decide = defaultDecide, log = console.log, onEvent = () => {}, emit = () => {}, onIdle = () => false }) {
  let presence = { scene: 'home', talking: false, listening: false, typing: false, thinking: false, live: false, lastInteractionAt: 0 };
  let seen = feeds.versions();
  let handled = {};
  let retry = false;
  let pending = null; // push waiting for the page's ack
  let nextId = 1;
  let deciding = false;
  const timers = new Set();
  const scriptDone = new Set();

  const busy = () =>
    presence.scene !== 'home' || presence.talking || presence.listening || presence.typing || presence.thinking ||
    clock() - presence.lastInteractionAt < quietMs;

  const push = (event, data) => emit(event, data);

  async function tick() {
    if (deciding || pending || busy()) return;
    if (onIdle()) return;
    const now = feeds.versions();
    const changed = Object.keys(now).filter((k) => now[k] !== seen[k]);
    if (!changed.length && !retry) return;
    if (presence.live) {
      seen = now;
      retry = false;
      const context = userContext(presence, clock());
      const urgency = topUrgency(feeds.get(), changed);
      const text = describeChanges(feeds.get(), changed, context);
      log(`[agent] feeds changed: ${changed.join(', ')} (urgency ${urgency}) -> feed update to the live agent`);
      push('feed', { changed, text, urgency, context });
      onEvent('push', { kind: 'feed', changed, presence });
      return;
    }
    deciding = true;
    try {
      const d = await decide(feeds.get(), changed, handled);
      seen = now;
      retry = false;
      log(`[agent] feeds changed: ${changed.join(', ') || '(retry)'} -> ${d.speak ? `speak, open ${d.scene}` : 'wait'} (${d.via}: ${d.reason})`);
      onEvent('decision', { changed, speak: d.speak, scene: d.scene, via: d.via, reason: d.reason });
      if (d.speak && PROACTIVE[d.scene] && !busy()) {
        pending = { id: nextId++, scene: d.scene, line: PROACTIVE[d.scene], say: LINES[PROACTIVE[d.scene]], reason: d.reason, via: d.via };
        push('proactive', pending);
        onEvent('push', { kind: 'proactive', scene: d.scene, presence });
      } else if (d.speak) {
        retry = true;
      }
    } finally {
      deciding = false;
    }
  }

  const interval = setInterval(() => tick().catch((err) => log(`[agent] tick failed: ${err.message}`)), tickMs);

  return {
    tick,
    setPresence(next) {
      const prev = presence;
      presence = {
        scene: String(next.scene || 'home'),
        talking: Boolean(next.talking),
        listening: Boolean(next.listening),
        typing: Boolean(next.typing),
        thinking: Boolean(next.thinking),
        live: Boolean(next.live),
        lastInteractionAt: Number(next.lastInteractionAt) || 0,
      };
      // Demo script: a scene closing schedules the next feed event.
      if (presence.scene === 'home' && prev.scene !== 'home') {
        script.forEach((step, i) => {
          if (step.afterScene === prev.scene && !scriptDone.has(i)) {
            scriptDone.add(i);
            const t = setTimeout(() => { timers.delete(t); feeds.fire(step.event); log(`[script] ${step.event}`); onEvent('feed_event', { event: step.event, by: 'script' }); }, step.delaySec * 1000);
            timers.add(t);
          }
        });
      }
    },
    ack({ id, ok }) {
      if (!pending || pending.id !== id) return;
      if (ok) handled[pending.scene] = true;
      else retry = true; // the page was busy; decide again when it is idle
      pending = null;
    },
    fire(event) {
      if (event === 'reset') {
        handled = {};
        pending = null;
        retry = false;
        scriptDone.clear();
        timers.forEach(clearTimeout);
        timers.clear();
      }
      const ok = feeds.fire(event);
      onEvent('feed_event', { event, by: 'presenter' });
      if (event === 'reset') seen = feeds.versions();
      return ok;
    },
    status: () => ({ presence, handled, pending, feeds: feeds.get() }),
    stop() {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    },
  };
}

// What the user is doing when a feed update goes out (updates go out only when idle).
export function userContext(presence, at = Date.now()) {
  return {
    scene: presence.scene,
    typing: Boolean(presence.typing),
    speaking: Boolean(presence.listening),
    agentTalking: Boolean(presence.talking),
    idleSeconds: presence.lastInteractionAt ? Math.max(0, Math.round((at - presence.lastInteractionAt) / 1000)) : null,
  };
}

export const topUrgency = (feeds, changed) =>
  changed.map((k) => feedUrgency(feeds, k)).reduce((a, b) => (URGENCY.indexOf(b) > URGENCY.indexOf(a) ? b : a), 'none');

const describeContext = (c) =>
  `User now: ${c.scene === 'home' ? 'on the agent home, no page open' : `the ${c.scene} page is open`}; ` +
  `${c.typing ? 'typing' : 'not typing'}; ${c.speaking ? 'speaking' : 'not speaking'}; ` +
  `${c.idleSeconds == null ? 'no interaction yet this visit' : `last interaction ${c.idleSeconds} s ago`}.`;

// One plain sentence per changed feed for the live agent, each with its urgency and concrete reason
// ("Why it matters: ..."), then what the user is doing now, so the agent can decide whether to
// speak first and say why, or stay quiet.
export function describeChanges(feeds, changed, context = null) {
  const say = {
    email: () => {
      const m = feeds.email.messages.at(-1);
      const why = m.kind === 'shopping' ? 'it is a shopping list the user may want bought' : `it is only a ${m.kind} email; nothing needs the user now`;
      return `New email from ${m.from}: "${m.subject}" (${m.kind}). Why it matters: ${why}.`;
    },
    calendar: () => `Calendar: ${feeds.calendar.events.map((e) => `${e.day} ${e.time} ${e.title}`).join('; ')}. Why it matters: the schedule changed.`,
    health: () =>
      feeds.health.synced
        ? `Sleep data synced: sleep score ${feeds.health.sleepScore}.${feeds.health.raceOpen ? ` Sign-up for the ${feeds.health.race} is open.` : ''} ` +
          `Why it matters: ${feeds.health.raceOpen ? `sleep score ${feeds.health.sleepScore} means the user is rested enough to train, and the ${feeds.health.race} sign-up just opened` : 'only a sleep score; nothing to act on'}.`
        : 'Health data reset.',
    flight: () => {
      const f = feeds.flight;
      if (f.status !== 'delayed') return `Flight ${f.code} is on time.`;
      const { why, clash } = flightReason(feeds);
      return (
        `Flight ${f.code} ${f.day} at ${f.depart} (${f.from} to ${f.to}) is delayed ${f.delayMinutes} minutes${f.cause ? ` (${f.cause})` : ''}. ` +
        `Why it matters: ${why}.${clash && f.faster ? ` A faster flight, ${f.faster.code}, lands at ${f.faster.arrive} and has a seat.` : ''}`
      );
    },
  };
  const lines = changed.map((k) => `${say[k]?.() || `${k} changed.`} Urgency: ${feedUrgency(feeds, k)}.`);
  return ['[feed update]', ...lines, ...(context ? [describeContext(context)] : [])].join(' ');
}
