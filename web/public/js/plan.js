// The visible plan line: for a task of several steps the agent passes a plan with its first tool
// call ("read email | build list | tap Allow"); the line shows it above the subtitle and ticks a
// step each time a tool finishes or the app moves to the next scene by itself (shopping -> payment).
// It fades when every step is done or the task folds back home.
export const MAX_STEPS = 4;
const STEP_LEN = 32;

// "a | b | c", "a -> b", "a → b" or an array: 2 to 4 short steps, or null.
export function parseSteps(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/\s*(?:\||→|->|\n)\s*/);
  const steps = raw.map((s) => String(s).replace(/^\s*\d+[.)]?\s*/, '').trim().slice(0, STEP_LEN)).filter(Boolean).slice(0, MAX_STEPS);
  return steps.length >= 2 ? steps : null;
}

// The plan state, apart from the screen so it can be tested in Node.
// render({ steps, done }) draws it; steps = [] hides it. wait(fn, ms) schedules the fade.
export function createPlan({ render = () => {}, wait = (fn, ms) => setTimeout(fn, ms), cancel = (t) => clearTimeout(t) } = {}) {
  let steps = [];
  let done = 0;
  let fade = null;
  let busy = 0;
  const draw = () => render({ steps, done });
  const stopFade = () => { if (fade) cancel(fade); fade = null; };

  const plan = {
    state: () => ({ steps: [...steps], done, busy: busy > 0 }),
    active: () => steps.length > 0,
    start(input) {
      const next = parseSteps(input);
      if (!next) return false;
      stopFade();
      // The same plan sent again with a later step's tool: keep the progress.
      if (next.join('|') === steps.join('|')) return true;
      steps = next;
      done = 0;
      draw();
      return true;
    },
    tick() {
      if (!steps.length || done >= steps.length) return;
      done += 1;
      draw();
      if (done === steps.length) plan.fadeSoon(2500);
    },
    clear() {
      stopFade();
      if (!steps.length) return;
      steps = [];
      done = 0;
      draw();
    },
    fadeSoon(ms) {
      stopFade();
      fade = wait(() => { fade = null; plan.clear(); }, ms);
    },
    // A tool is running: a scene change now is the tool's own, not a step of its own.
    busy(on) { busy = Math.max(0, busy + (on ? 1 : -1)); },
    // The app changed scene: a direct swap (shopping -> payment) done by the app is a step;
    // back home ends the plan, unless a tool is just swapping pages.
    sceneChanged(from, to) {
      if (!steps.length || busy > 0) return;
      if (to === 'home') plan.fadeSoon(1500);
      else if (from && from !== 'home') plan.tick();
      else stopFade();
    },
  };
  return plan;
}

// The line on the screen: <ol id="plan"> right above the subtitle in the bottom panel, made on first use.
function renderLine({ steps, done }) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('plan');
  if (!el) {
    el = document.createElement('ol');
    el.id = 'plan';
    el.className = 'plan';
    el.dataset.testid = 'plan';
    el.setAttribute('aria-label', 'Plan');
    const subtitle = document.getElementById('subtitle');
    if (subtitle?.parentElement) subtitle.before(el);
    else (document.getElementById('phone') || document.body).append(el);
  }
  el.replaceChildren(...steps.map((text, i) => {
    const li = document.createElement('li');
    li.dataset.state = i < done ? 'done' : i === done ? 'now' : 'next';
    li.textContent = `${i < done ? '✓' : i + 1} ${text}`;
    return li;
  }));
  el.classList.toggle('show', steps.length > 0);
}

export const plan = createPlan({ render: renderLine });

// Watch the scene the app shows (body data-scene), once, in the browser only. Each target gets
// sceneChanged(from, to): the plan line, and the learner (learn.js).
let watching = false;
export function watchScenes(...targets) {
  if (!targets.length) targets = [plan];
  if (watching || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  watching = true;
  let scene = document.body.dataset.scene || 'home';
  new MutationObserver(() => {
    const next = document.body.dataset.scene || 'home';
    if (next === scene) return;
    const from = scene;
    scene = next;
    for (const target of targets) target.sceneChanged(from, next);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
}
