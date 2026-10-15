// The agent's one voice. Exactly one voice speaks at a time:
// - Lines are queued: a new line waits for the one before it, it never talks over it.
// - With the live ElevenLabs agent connected, every line goes through the agent's own voice
//   (setLiveVoice), so the app never plays a second voice next to it.
// - Offline order: pre-rendered MP3 in /voice/ -> live ElevenLabs via /api/tts -> browser speechSynthesis.
// - interruptAll() stops everything at once (the user pressed the mic).
// Every audio start and end goes to the run log with its source.
import { T, MUTED } from './timing.js';
import { logEvent } from './log.js';
import { apiFetch, onOffline } from './api.js';

let manifest = new Set();
let liveTts = false;
let fadeTimer = null;
let current = null;
let queue = Promise.resolve();
let generation = 0; // bumps on interruptAll(); queued lines from before it are dropped
let liveVoice = null; // (text) => Promise, set while the live agent is connected

const $ = (id) => document.getElementById(id);

// health: the /api/health answer (a promise), shared with the brain check in app.js.
export async function initVoice(health = apiFetch('/api/health').then((r) => r.json())) {
  const cached = fetch('/voice/manifest.json').then((res) => (res.ok ? res.json() : []));
  try {
    manifest = new Set(await cached);
    // The greeting plays on the first tap: have it in the cache before then.
    if (manifest.has('greet') && !MUTED) fetch('/voice/greet.mp3').catch(() => {});
  } catch { /* no cached voice yet */ }
  try {
    const h = await health;
    liveTts = h.tts && !h.offline;
  } catch { /* server without health route */ }
}

export const setLiveVoice = (fn) => { liveVoice = fn; };

// Offline mode: no more ElevenLabs TTS calls; cached MP3s, then the browser's voice.
onOffline(() => { liveTts = false; });

export function showSubtitle(text, holdMs = 2600) {
  const el = $('subtitle');
  clearTimeout(fadeTimer);
  el.textContent = text;
  el.classList.add('show');
  if (holdMs > 0) fadeTimer = setTimeout(() => el.classList.remove('show'), T(holdMs));
}

const guessMs = (text) => Math.min(9000, 1200 + text.length * 90);

function playAudio(src, text) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(src);
    current = audio;
    const guard = setTimeout(resolve, guessMs(text) + 4000);
    const done = () => { clearTimeout(guard); resolve(); };
    audio.onended = done;
    audio.onpause = done; // interruptAll() pauses it
    audio.onerror = () => { clearTimeout(guard); reject(new Error(`audio failed: ${src}`)); };
    audio.play().catch((err) => { clearTimeout(guard); reject(err); });
  });
}

function browserSpeak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return setTimeout(resolve, guessMs(text));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'th-TH';
    const thai = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('th'));
    if (thai) u.voice = thai;
    const guard = setTimeout(resolve, guessMs(text) + 1500);
    u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
    speechSynthesis.speak(u);
  });
}

async function liveSpeak(text, mine) {
  const res = await apiFetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const blob = await res.blob();
  if (mine !== generation) return;
  const url = URL.createObjectURL(blob);
  try { await playAudio(url, text); } finally { URL.revokeObjectURL(url); }
}

// Stop every voice at once: local audio, browser speech, queued lines (and the live agent, via app.js).
export function interruptAll() {
  generation += 1;
  queue = Promise.resolve();
  current?.pause();
  current = null;
  document.body.classList.remove('speaking');
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

async function speakNow({ line, text, onStart }) {
  const mine = generation;
  if (liveVoice) {
    // One voice: the live agent says it.
    showSubtitle(text, 0);
    await liveVoice(text, line, onStart);
    if (mine === generation) showSubtitle(text, 1800);
    return;
  }
  const source = MUTED ? 'muted' : line && manifest.has(line) ? 'mp3' : liveTts ? 'tts' : 'browser';
  document.body.classList.add('speaking');
  showSubtitle(text, 0);
  logEvent('audio_start', { source, id: line || text.slice(0, 40), text });
  onStart?.();
  try {
    if (source === 'muted') {
      await new Promise((r) => {
        const t = setTimeout(r, T(guessMs(text)));
        current = { pause: () => { clearTimeout(t); r(); } }; // interruptible, like real audio
      });
    }
    else if (source === 'mp3') await playAudio(`/voice/${line}.mp3`, text);
    else if (source === 'tts') await liveSpeak(text, mine);
    else await browserSpeak(text);
  } catch (err) {
    logEvent('error', { where: 'voice', message: err.message });
    if (mine === generation && source !== 'browser') await browserSpeak(text);
  } finally {
    logEvent('audio_end', { source, id: line || text.slice(0, 40) });
    if (mine === generation) {
      document.body.classList.remove('speaking');
      showSubtitle(text, 1800);
    }
  }
}

// speak({ line: 'pay_done', text: 'สั่งเรียบร้อย...' }) -> resolves when this line has been said.
// It waits for any line already speaking; it never talks over it. onStart fires when it starts.
export function speak({ line = null, text = '', onStart = null } = {}) {
  if (!text) { onStart?.(); return Promise.resolve(); }
  const mine = generation;
  const run = queue.then(() => (mine === generation ? speakNow({ line, text, onStart }) : onStart?.()));
  queue = run.catch(() => {});
  return run;
}
