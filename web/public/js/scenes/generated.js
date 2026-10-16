// Generated scene: draws a JSON UI spec from a fixed component set.
// Every string goes in with textContent. When the live agent sends a design brief with the spec, the
// block page shows at once and a page model (POST /api/page) writes a free HTML page that is swapped in
// as it streams. That HTML is sanitized (page-sanitize.js) and shown in a shadow root: scripts written
// by the model never run; taps on data-action reach the agent as [scene event] lines through this code.
// No answer, an error, a timeout or a page that fails the checks: the block page stays.
// The agent asks if the user likes it; spoken answers revise the spec and it redraws in place.
// A page the user likes can be kept as a saved scene in localStorage (with its HTML, if it had one).
import { T } from '../timing.js';
import { apiFetch } from '../api.js';
import { sanitizePage, sanitizePartial, pageOk } from '../page-sanitize.js';
import { applyStyle, styleText } from '../style.js';

// The browser waits a little longer than the server's own 12 s limit (lib/page-model.js).
const PAGE_WAIT_MS = 14_000;
// Base styles inside the shadow root; the app's colour tokens (--ink, --accent...) inherit into it.
const PAGE_CSS =
  ':host{display:block;contain:layout paint;position:relative;overflow:hidden;border-radius:var(--radius);background:var(--cream)}' +
  '.pg-body{font-family:var(--font);color:var(--ink);line-height:1.5;min-height:100%;overflow-wrap:anywhere}' +
  '.pg-body *{box-sizing:border-box}.pg-body img,.pg-body svg{max-width:100%;height:auto}' +
  '[data-action],[data-toggle],[data-count-step]{cursor:pointer}';

const STORE = 'agentos.savedScenes';

export function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

// Remove one kept page (the memory page). Returns false when there was no such page.
export function removeSaved(kind) {
  const all = loadSaved();
  if (!all || !Object.hasOwn(all, kind)) return false;
  delete all[kind];
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// page: { html, design } of a model-written page, so a kept page reopens without a new model call.
function saveScene(spec, page = {}) {
  if (spec.urgency && spec.urgency !== 'none') return false; // first-aid pages are never kept
  try {
    const all = loadSaved();
    all[spec.kind] = { kind: spec.kind, name: spec.name, match: spec.match, spec, ...page, savedAt: new Date().toISOString() };
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// What the router needs to find kept pages again.
export const savedIndex = () => Object.values(loadSaved()).map(({ kind, match }) => ({ kind, match }));

// Reopen a kept page with fresh data: same layout, items reset, today's date.
function refresh(spec) {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    ...spec,
    subtitle: `Saved scene · ${today}`,
    blocks: spec.blocks.map((b) => (b.type === 'checklist' ? { ...b, items: b.items.map((i) => ({ ...i, done: false })) } : b)),
  };
}

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
};

function checklistDone(spec) {
  const items = spec.blocks.filter((b) => b.type === 'checklist').flatMap((b) => b.items);
  return items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0;
}

function drawBlock(b, spec, onChange, onButton) {
  switch (b.type) {
    case 'text': return h('p', 'g-text', b.text);
    case 'stat': {
      const el = h('div', 'g-stat');
      el.append(h('b', null, b.value), h('span', null, b.label));
      return el;
    }
    case 'progress': {
      const value = b.value === 'auto' ? checklistDone(spec) : b.value;
      const el = h('div', 'g-progress');
      el.dataset.testid = 'g-progress';
      const label = h('div', 'g-progress-label');
      label.append(h('span', null, b.label), h('b', null, `${value}%`));
      const bar = h('div', 'g-bar');
      const fill = h('i');
      fill.style.width = `${value}%`;
      bar.append(fill);
      el.append(label, bar);
      return el;
    }
    case 'checklist': {
      const ul = h('ul', 'g-checklist');
      b.items.forEach((item) => {
        const li = h('li', item.done ? 'done' : '');
        const box = h('span', 'g-box', item.done ? '✓' : '');
        li.append(box, h('span', 'g-item', item.text));
        if (item.tag) li.append(h('em', `g-tag g-tag-${item.tag.toLowerCase()}`, item.tag));
        if (item.due) li.append(h('small', 'g-due', item.due));
        li.addEventListener('click', () => { item.done = !item.done; onChange(); });
        ul.append(li);
      });
      return ul;
    }
    case 'list': {
      const ul = h('ul', 'g-list');
      b.items.forEach((t) => ul.append(h('li', null, t)));
      return ul;
    }
    case 'card': {
      const el = h('article', 'g-card');
      el.append(h('h3', null, b.title), h('p', null, b.text));
      return el;
    }
    case 'chart': {
      const el = h('div', 'g-chart');
      const max = Math.max(1, ...b.bars.map((x) => x.value));
      b.bars.forEach((x) => {
        const col = h('div', 'g-col');
        const bar = h('i');
        bar.style.height = `${Math.round((x.value / max) * 100)}%`;
        col.append(h('b', null, x.value), bar, h('span', null, x.label));
        el.append(col);
      });
      return el;
    }
    case 'field': {
      const el = h('label', 'g-field', b.label);
      const input = h('input');
      input.placeholder = b.placeholder || '';
      el.append(input);
      return el;
    }
    case 'button': {
      const btn = h('button', 'btn btn-allow g-button', b.label);
      btn.addEventListener('click', () => onButton(b.label));
      return btn;
    }
    case 'divider': return h('hr', 'g-divider');
    case 'image': {
      // Grey frame at once; the picture fades in when the server has it. On any error the frame stays with an icon.
      const fig = h('figure', 'g-image');
      fig.dataset.testid = 'g-image';
      const frame = h('div', 'g-frame');
      fig.append(frame);
      if (b.caption) fig.append(h('figcaption', null, b.caption));
      apiFetch('/api/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: b.prompt, scene: spec.kind }) })
        .then((r) => r.json())
        .then((out) => {
          if (!out.url) throw new Error(out.error || 'no image');
          const img = h('img');
          img.alt = b.caption || b.prompt;
          img.onload = () => fig.classList.add('loaded');
          img.onerror = () => fig.classList.add('failed');
          img.src = out.url;
          frame.append(img);
        })
        .catch(() => fig.classList.add('failed'));
      return fig;
    }
    case 'steps': {
      const ol = h('ol', 'g-steps');
      b.items.forEach((t) => ol.append(h('li', null, t)));
      return ol;
    }
    case 'sources': {
      // Web search sources: real links (http/https only, checked in validateSpec).
      const box = h('div', 'g-sources');
      box.dataset.testid = 'g-sources';
      box.append(h('span', 'g-sources-label', 'Sources'));
      const ul = h('ul');
      b.items.forEach((i) => {
        const a = h('a', null, i.title);
        a.href = i.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const li = h('li');
        li.append(a, h('small', null, new URL(i.url).hostname.replace(/^www\./, '')));
        ul.append(li);
      });
      box.append(ul);
      return box;
    }
    case 'call': {
      // Only emergency numbers reach here (checked on the server); digits only.
      const a = h('a', 'g-call', `📞 ${b.label}`);
      a.href = `tel:${String(b.number).replace(/\D/g, '')}`;
      a.dataset.testid = 'g-call';
      return a;
    }
  }
  return h('div');
}

// Taps inside a model-written page. Only this code reacts; the page itself has no scripts.
function wirePage(root, agent) {
  root.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const toggle = t.closest('[data-toggle]');
    if (toggle) toggle.dataset.on = toggle.dataset.on === 'true' ? 'false' : 'true';
    const step = t.closest('[data-count-step]');
    if (step) {
      const out = [...root.querySelectorAll('[data-count]')].find((x) => x.dataset.count === step.dataset.countStep);
      if (out) out.textContent = String(Math.max(0, (parseInt(out.textContent, 10) || 0) + (Number(step.dataset.step) || 1)));
    }
    const act = t.closest('[data-action]');
    if (act) {
      const label = (act.getAttribute('aria-label') || act.textContent || act.dataset.action).replace(/\s+/g, ' ').trim().slice(0, 60);
      const value = act.dataset.value ? `, value: ${act.dataset.value.slice(0, 60)}` : '';
      agent.event?.(`The user tapped "${label}" on the page (action: ${act.dataset.action.slice(0, 40)}${value}). Act on it like a spoken request.`, label);
    }
  });
}

export default function mountGenerated(el, data, agent) {
  let fromSaved = false;
  let spec = data.spec;
  let design = data.design || '';
  let pageRaw = null; // the model's finished page, as written (kept with the scene)
  if (data.savedKind) {
    const kept = loadSaved()[data.savedKind];
    if (kept) {
      spec = refresh(kept.spec);
      fromSaved = true;
      if (kept.html && pageOk(sanitizePage(kept.html))) {
        pageRaw = kept.html;
        design = kept.design || '';
      }
    }
  }
  if (!spec) {
    agent.close();
    return {};
  }
  let urgent = Boolean(spec.urgency && spec.urgency !== 'none');
  let stage = urgent ? 'urgent' : fromSaved ? 'saved' : 'review';
  let version = 0;
  // view: 'blocks' (the spec), 'partial' (model page still being written) or 'html' (finished page).
  let shown = pageRaw ? sanitizePage(pageRaw).html : null;
  let view = shown ? 'html' : 'blocks';
  let host = null;
  let pending = null;

  const paint = () => {
    host.shadowRoot.innerHTML = `<style>${PAGE_CSS}</style>${shown}`;
  };

  const draw = (flash = false) => {
    el.className = `scene scene-generated g-accent-${spec.accent}${flash ? ' g-flash' : ''}`;
    el.dataset.scene = 'generated';
    el.dataset.version = String(version);
    el.dataset.stage = stage;
    el.dataset.view = view;
    // The user's own design system (style.js) on the root: the block page follows it.
    applyStyle(el);
    el.replaceChildren();
    const badge = h('p', `g-badge${urgent ? ' g-badge-urgent' : ''}`, urgent ? 'First aid' : fromSaved ? 'Saved scene' : 'Generated for you');
    badge.dataset.testid = 'g-badge';
    el.append(badge);
    if (view !== 'blocks' && shown) {
      host = h('div', 'g-html');
      host.dataset.testid = 'g-html';
      wirePage(host.attachShadow({ mode: 'open' }), agent);
      paint();
      el.append(host);
    } else {
      host = null;
      const title = h('h1', 'g-title', spec.title);
      title.dataset.testid = 'g-title';
      el.append(title);
      if (spec.subtitle) el.append(h('p', 'g-subtitle', spec.subtitle));
      spec.blocks.forEach((b) => el.append(drawBlock(b, spec, () => draw(), (label) => agent.request(label))));
    }

    const chips = h('div', 'g-chips');
    chips.dataset.testid = 'g-chips';
    const options =
      stage === 'keep' ? ['Keep it', 'No thanks'] : stage === 'review' ? [...spec.proposals.map((p) => p.label), 'I like it'] : [];
    options.forEach((label) => {
      const chip = h('button', 'g-chip', label);
      chip.addEventListener('click', () => agent.request(label));
      chips.append(chip);
    });
    if (options.length) el.append(chips);
    if (flash) setTimeout(() => el.classList.remove('g-flash'), T(700));
  };
  draw();

  // Same page with new HTML: repaint only the shadow root while the page is being written.
  const setView = (next) => {
    if (next !== 'blocks' && view !== 'blocks' && host) {
      view = next;
      el.dataset.view = view;
      paint();
      return;
    }
    const swap = next !== view;
    view = next;
    draw(swap);
  };

  // Ask the page model for a free HTML page for the current spec and brief; never for urgent pages.
  async function fetchPage() {
    pending?.abort();
    pending = null;
    if (!design || urgent) return;
    const stop = new AbortController();
    pending = stop;
    const timer = setTimeout(() => stop.abort(), T(PAGE_WAIT_MS));
    let raw = '';
    let last = 0;
    try {
      const res = await apiFetch('/api/page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec, design, style: styleText() }),
        signal: stop.signal,
      });
      if (!res.ok || !res.body) throw new Error(`page http ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (pending !== stop) return;
        raw += decoder.decode(value, { stream: true });
        if (Date.now() - last > T(250)) {
          last = Date.now();
          const part = sanitizePartial(raw);
          // Swap in once there is a real start of a page; until then the block page stays.
          if (/<body/i.test(raw) && part.text >= 40) {
            shown = part.html;
            setView('partial');
          }
        }
      }
      if (pending !== stop) return;
      const out = sanitizePage(raw);
      if (!pageOk(out)) throw new Error('page failed the checks');
      pageRaw = raw;
      shown = out.html;
      setView('html');
    } catch (err) {
      if (pending !== stop) return;
      console.info('[page] block page kept:', err.message);
      pageRaw = null;
      shown = null;
      if (view !== 'blocks') setView('blocks');
    } finally {
      clearTimeout(timer);
      if (pending === stop) pending = null;
    }
  }
  if (!pageRaw) fetchPage();

  // The offline todo asks its question after it has grown (the intro line said what it was doing).
  if (stage === 'review' && data.ask) agent.say(data.ask);

  return {
    state: () => ({ spec, stage: stage === 'saved' ? 'review' : stage }),
    destroy() {
      pending?.abort();
      pending = null;
    },
    async onAction(action, res, talking) {
      if (action === 'urgent' && res?.spec) {
        // First aid is always the block page: stop any model page.
        pending?.abort();
        pending = null;
        pageRaw = null;
        shown = null;
        view = 'blocks';
        spec = res.spec;
        urgent = true;
        stage = 'urgent';
        version += 1;
        draw(true);
        return;
      }
      if (urgent && action !== 'close') return;
      if (action === 'revise' && res.spec) {
        // The changed spec shows as blocks at once; a new model page follows if there is a brief.
        spec = res.spec;
        if (res.design) design = res.design;
        pageRaw = null;
        shown = null;
        view = 'blocks';
        version += 1;
        stage = 'review';
        draw(true);
        fetchPage();
      } else if (action === 'accept') {
        stage = 'keep';
        draw();
      } else if (action === 'keep') {
        saveScene(spec, pageRaw && view === 'html' ? { html: pageRaw, design } : {});
        stage = 'kept';
        fromSaved = true;
        draw(true);
        await talking;
        await agent.wait(500);
        agent.close();
      } else if (action === 'close') {
        await talking;
        agent.close();
      }
    },
  };
}
