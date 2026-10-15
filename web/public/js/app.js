// Agent OS: one home screen. The agent answers by voice and by growing a
// full-screen scene out of the home; when the task is done it folds back.
import { LINES } from './lines.js';
import { SCENE_DEFAULTS } from './data.js';
import { SCENES } from './scenes/index.js';
import { savedIndex, loadSaved } from './scenes/generated.js';
import { initVoice, speak, showSubtitle, interruptAll } from './voice.js';
import { logEvent } from './log.js';
import { apiFetch } from './api.js';
import { createListener } from './stt.js';
import { connectAgent, fireFeed } from './agent-link.js';
import { live, checkLive, prepareLive, startLive, setMic, sendText, sendContext, sendFeed, silenceAgent, afterAgentStarts } from './live-agent.js';
import { T, TEST, PRESENTER, wait } from './timing.js';
import { plan, watchScenes } from './plan.js';
import { hasMemory } from './memory.js';
import { noteFeed, proactiveWatch, forgetOnRequest } from './learn.js';
import { createSecretary } from './secretary.js';
import { setupSecretaryDemo } from './secretary-demo.js';
import { initMascot } from './mascot.js';
import { initLanguage } from './i18n.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
let open = null; // { name, el, ctl }
const secretary = createSecretary({ notify: async (notices, current) => {
  const text = `แจ้งเตือนทดสอบ ${notices.length} เรื่องค่ะ ${notices.map((n) => n.message).join(' ')}`;
  return sayThenOpen({ text }, 'secretary', { view: 'notifications', noticeIds: notices.map((n) => n.id) },
    () => current() && !open && !document.body.classList.contains('listening') && !document.body.classList.contains('thinking'));
} });
let thinkingTimer = null;

if (TEST) document.body.classList.add('test');

function makeAgent(token) {
  const alive = () => open === token;
  return {
    alive,
    wait,
    lines: LINES,
    secretary,
    // Speak a fixed line by id, or free text.
    say: (lineOrText) => (alive() ? speak(LINES[lineOrText] ? { line: lineOrText, text: LINES[lineOrText] } : { text: lineOrText }) : Promise.resolve()),
    open: (name, data) => alive() && openScene(name, data),
    // Same as the user saying it (chips and buttons on generated pages).
    request: (text) => alive() && handleUserText(text),
    // A tap on a model-written page: the live agent hears it as a scene event; offline it is like saying the label.
    event: (text, label) => {
      if (!alive()) return;
      logEvent('page_tap', { text });
      if (!live.connected) return label && handleUserText(label);
      if (label) showSubtitle(`“${label}”`, 1600);
      sendText(`[scene event] ${text}`);
    },
    close: () => alive() && closeScene(),
  };
}

export function openScene(name, data = {}) {
  const mount = SCENES[name];
  if (!mount) return;
  const el = document.createElement('div');
  el.className = `scene scene-${name}`;
  el.dataset.scene = name;

  logEvent('scene_open', { name, swap: Boolean(open) });
  if (open) {
    open.ctl.destroy?.();
    // Scene to scene: the old one slides up, the new one rises under it.
    const old = open.el;
    old.classList.add('leaving');
    setTimeout(() => old.remove(), T(650));
    el.classList.add('entering');
  } else {
    stage.classList.add('open');
  }
  stage.appendChild(el);
  document.body.classList.remove('thinking');
  document.body.classList.add('scene-open');
  document.body.dataset.scene = name;

  const token = { name, el, ctl: {} };
  open = token;
  token.ctl = mount(el, { ...SCENE_DEFAULTS[name], ...data }, makeAgent(token)) || {};
}

export function closeScene() {
  if (!open) return;
  const { el, name } = open;
  open.ctl.destroy?.();
  // Tell the live agent, so it does not act on a page that is gone.
  if (live.connected) sendContext(`[screen] The ${name} page was closed. The agent home is showing.`);
  logEvent('scene_close', { name });
  open = null;
  stage.classList.remove('open');
  document.body.classList.remove('scene-open');
  document.body.dataset.scene = 'home';
  setTimeout(() => el.remove(), T(750));
}

// Speak first, then act: the agent starts its sentence about what it will do, and the scene
// grows while that sentence plays (never before it starts).
async function sayThenOpen({ line, text }, name, data, current = () => true) {
  if (!current()) return false;
  let talking;
  await new Promise((started) => { talking = speak({ line, text, onStart: started }); });
  await wait(120);
  const show = current();
  if (show) openScene(name, data);
  await talking;
  return show;
}


// The agent speaks first (always-on feed event offline, or a presenter hotkey).
async function proactive(name) {
  if (open) closeScene();
  const line = { flight: 'flight_intro', training: 'train_intro', shopping: 'shop_intro', payment: 'pay_ask' }[name];
  if (!SCENES[name]) return;
  await sayThenOpen({ line, text: LINES[line] }, name);
}

async function routeText(text) {
  const res = await apiFetch('/api/route', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, context: open?.name || null, saved: savedIndex(), ...(open?.ctl.state?.() || {}) }),
  });
  if (!res.ok) throw new Error(`route ${res.status}`);
  return res.json();
}

// What the live agent's client tools may do to the screen.
const toolUi = {
  current: () => open,
  // Grow the scene once speech starts, while the agent explains it.
  openScene: async (name, data) => {
    await afterAgentStarts();
    openScene(name, data);
  },
  closeScene: () => closeScene(),
  action: (name, extra = {}) => open?.ctl.onAction?.(name, extra, Promise.resolve()),
  nudgeAllow: () => open?.ctl.onAction?.('button-only'),
  secretary: async (action, minutes) => {
    if (['acknowledge', 'snooze'].includes(action) && (open?.name !== 'secretary' || !open.ctl.state().noticeIds.length)) return 'error: no displayed notification';
    await afterAgentStarts();
    if (open?.name !== 'secretary') openScene('secretary');
    open.ctl.onAction(action, { minutes });
    return JSON.stringify(secretary.get());
  },
  // Kept pages, so the live agent can reopen one by its reference (render_ui {"saved": kind}).
  saved: () => loadSaved(),
  tellAgent: (text) => text && live.connected && sendContext(text),
};

// What the user said (voice or fallback text) -> agent action.
export async function handleUserText(text) {
  text = text.trim();
  if (!text) return;
  // Live agent: it hears the text and answers through its tools.
  if (live.connected) {
    showSubtitle(`“${text}”`, 2400);
    // The mascot thinks until the agent speaks or a page opens (a web search can take a while).
    document.body.classList.add('thinking');
    clearTimeout(thinkingTimer);
    thinkingTimer = setTimeout(() => document.body.classList.remove('thinking'), 30000);
    sendText(text);
    return;
  }
  showSubtitle(`“${text}”`, 1200);
  document.body.classList.add('thinking');
  let res;
  const t0 = Date.now();
  try {
    res = await routeText(text);
    logEvent('route', { via: res.via, scene: res.scene || null, action: res.action || null, ms: Date.now() - t0 });
    if (res.say) logEvent('agent_reply', { text: res.say });
  } catch (err) {
    console.warn('[agent]', err.message);
    res = { scene: null, line: 'unsure', say: LINES.unsure };
  } finally {
    document.body.classList.remove('thinking');
  }
  document.body.dataset.via = res.via || '';

  if (res.action) {
    const talking = res.say ? speak({ line: res.line, text: res.say }) : Promise.resolve();
    open?.ctl.onAction?.(res.action, res, talking);
    await talking;
    return;
  }
  if (res.scene && SCENES[res.scene]) {
    if (open) closeScene();
    await sayThenOpen({ line: res.line, text: res.say }, res.scene, res.data);
    return;
  }
  if (res.say) await speak({ line: res.line, text: res.say });
}

// What the user typed or tapped: same path as speech. Starts the live agent first if it can.
async function submitText(text, via) {
  text = String(text || '').trim();
  if (!text) return;
  logEvent('user_text', { text, via });
  if (live.available && !live.connected) await startLive(toolUi).catch(() => {});
  handleUserText(text);
}

// The text input, always shown next to the mic (for anyone who cannot or would rather not talk).
function setupFallback() {
  const form = $('fallback');
  const input = $('fallbackInput');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.blur();
    submitText(text, 'typed');
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });
  return { show: () => input.focus() };
}

function setupHomeButton() {
  $('catalogBtn').addEventListener('click', () => openScene('shopping', { catalog: true }));
  // The memory page: no talking needed to see or change what the agent remembers.
  $('memoryEntry').addEventListener('click', () => openScene('memory'));
  $('homeBtn').addEventListener('click', () => closeScene());
}

// Escape always folds back home. Presenter hotkeys only with ?presenter=1 (not while typing):
// / text input, f flight, t training, s shopping, p payment, h home.
// The always-on agent opens flight and training by itself; f and t are a last-resort fallback.
function setupHotkeys(fallback) {
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const actions = {
      Escape: () => closeScene(),
      ...(PRESENTER ? {
        '/': () => fallback.show(),
        '`': () => fallback.show(),
        f: () => proactive('flight'),
        t: () => proactive('training'),
        s: () => proactive('shopping'),
        p: () => proactive('payment'),
        h: () => closeScene(),
      } : {}),
    };
    const run = actions[e.key];
    if (run) { e.preventDefault(); run(); }
  });
}

function setupMic(fallback) {
  const mic = $('mic');
  const listener = createListener({
    onInterim: (t) => showSubtitle(`“${t}”`, 0),
    onFinal: (t) => { logEvent('stt', { text: t, final: true }); handleUserText(t); },
    onError: (err) => { console.warn('[stt]', err); if (err === 'not-allowed') fallback.show(); },
  });
  // Live agent: holding the mic unmutes it; the agent does its own speech to text.
  // Offline: the browser's speech recognition (th-TH) listens while the mic is held.
  const start = async (e) => {
    e.preventDefault();
    // Stop every voice first, so the mic never hears the agent.
    interruptAll();
    silenceAgent();
    document.body.classList.add('listening');
    logEvent('mic', { state: 'down' });
    if (live.available) {
      try {
        await startLive(toolUi);
        silenceAgent(); // e.g. its greeting, if this press started the conversation
        if (document.body.classList.contains('listening')) setMic(true);
        return;
      } catch { /* fall back to browser listening */ }
    }
    if (listener) listener.start();
    else { document.body.classList.remove('listening'); fallback.show(); }
  };
  const stop = () => {
    if (!document.body.classList.contains('listening')) return;
    document.body.classList.remove('listening');
    logEvent('mic', { state: 'up' });
    if (live.connected) setMic(false);
    else listener?.stop();
  };
  // Asleep (the session ended for idle or time): a tap on the mascot wakes the agent too.
  $('mascotWrap').addEventListener('click', () => {
    if (document.body.dataset.brain === 'asleep') startLive(toolUi).catch(() => {});
  });
  mic.addEventListener('pointerdown', start);
  mic.addEventListener('pointerup', stop);
  mic.addEventListener('pointerleave', stop);
  mic.addEventListener('pointercancel', stop);
  window.addEventListener('keydown', (e) => { if (e.key === ' ' && !e.repeat && !e.target.closest('input, textarea, select, button, dialog')) start(e); });
  window.addEventListener('keyup', (e) => { if (e.key === ' ' && !e.target.closest('input, textarea, select, button, dialog')) stop(); });
}

function tickClock() {
  const d = new Date();
  $('clock').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// The returning visitor's greeting, sent to the live agent as a marked message (see prompt.md).
export const SESSION_START = '[session start] The user just opened the app again. Greet them in one short sentence with what you remember, then wait. Call no tool.';

// The mascot greets once, after the first tap (browsers block sound before a gesture).
// The saved greet line (same voice as the live agent, whose first message is empty), so there is
// exactly one greeting whether or not the live agent connects later; a returning visitor is
// greeted by the live agent instead (it knows their name and last task).
function setupGreeting() {
  let greeted = false;
  const first = (e) => {
    if (greeted) return;
    if (e.target.closest?.('#mic, input, form, .presenter, .language-switch, .shopping-shortcut, .memory-entry, .home-btn, .secretary-shortcuts, dialog') || (e.type === 'keydown' && e.key !== 'Enter')) return;
    greeted = true;
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
    // Returning visitors hear the live agent's remembered greeting.
    if (live.available && hasMemory()) {
      logEvent('greet', { via: 'agent' });
      startLive(toolUi).then(() => {
        document.body.classList.add('started');
        return sendText(SESSION_START);
      }).catch(() => speak({ text: LINES.greet, onStart: () => document.body.classList.add('started') }));
      return;
    }
    logEvent('greet', { via: 'local' });
    speak({ text: LINES.greet, onStart: () => document.body.classList.add('started') });
  };
  window.addEventListener('pointerdown', first, true);
  window.addEventListener('keydown', first, true);
}

async function boot() {
  forgetOnRequest(); // ?forget=1: start with no memory and nothing learned
  initLanguage();
  initMascot();
  tickClock();
  setInterval(tickClock, 15000);
  const fallback = setupFallback();
  setupHomeButton();
  setupHotkeys(fallback);
  setupMic(fallback);
  setupGreeting();
  logEvent('page_open', { test: TEST });
  // One /api/health call for the voice and the brain, fetched while the voice manifest loads.
  const health = apiFetch('/api/health').then((r) => r.json());
  health.catch(() => {});
  await Promise.all([initVoice(health), checkLive(health)]);
  document.body.dataset.scene = 'home';
  watchScenes(plan, proactiveWatch);
  // The user's first touch, tap or key fetches the live agent's signed URL ahead of the first turn.
  for (const type of ['pointerdown', 'keydown', 'focusin']) window.addEventListener(type, prepareLive, { capture: true, passive: true });
  connectAgent({ onProactive: (scene) => proactive(scene), onFeed: (text) => live.connected && (noteFeed(), sendFeed(text)), onIdle: () => {
    if (document.querySelector('dialog[open]') || document.body.classList.contains('thinking') || document.activeElement?.matches('input, textarea, select')) return false;
    return secretary.flush();
  } });
  setupSecretaryDemo(secretary, {
    open: (view) => openScene('secretary', { view }),
    reset: () => { secretary.reset(); interruptAll(); silenceAgent(); closeScene(); fireFeed('reset'); },
  });
  document.body.dataset.ready = '1';
  // For tests and the presenter console.
  window.agentOS = { openScene, closeScene, handleUserText, proactive, fireFeed, secretary };
}

boot();
