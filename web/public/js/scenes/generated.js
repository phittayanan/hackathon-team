// Generated scene: draws a JSON UI spec from a fixed component set.
// Every string goes in with textContent. When the live agent sends a design brief with the spec, the
// block page shows at once and a page model (POST /api/page) writes a free HTML page that is swapped in
// as it streams. That HTML is sanitized (page-sanitize.js) and shown in a shadow root: scripts written
// by the model never run; taps on data-action reach the agent as [scene event] lines through this code.
// Other changes the user makes by hand (a ticked item, a counter, a toggle) reach the live agent as a
// silent [screen] update with what the page shows now; the spec in memory follows them.
// No answer, an error, a timeout or a page that fails the checks: the block page stays. Once the finished
// page has painted (and when a kept page reopens), its boxes are measured and checked (page-check.js):
// any failure brings the block page back, logs one [page check] line and tells the live agent silently.
// A page that passes is described (page-look.js) in a silent note, so the agent knows how it looks;
// inspect() measures it again on demand (the inspect_page tool).
// The agent asks if the user likes it; spoken answers revise the spec and it redraws in place.
// A page the user likes can be kept as a saved scene in localStorage (with its HTML, if it had one).
import { T } from '../timing.js';
import { apiFetch } from '../api.js';
import { sanitizePage, sanitizePartial, pageOk } from '../page-sanitize.js';
import { applyStyle, styleText } from '../style.js';
import { changeNote, markDone } from '../genui.js';
import { checkPage, failureText } from '../page-check.js';
import { describePage } from '../page-look.js';
import { logEvent } from '../log.js';

// The browser waits a little longer than the server's own 12 s limit (lib/page-model.js).
const PAGE_WAIT_MS = 14_000;
// Base styles inside the shadow root; the app's colour tokens (--ink, --accent...) inherit into it.
const PAGE_CSS =
  ':host{display:block;contain:layout paint;position:relative;overflow:hidden;border-radius:var(--radius);background:var(--cream)}' +
  '.pg-body{font-family:var(--font);color:var(--ink);line-height:1.5;min-height:100%;overflow-wrap:anywhere}' +
  '.pg-body *{box-sizing:border-box}.pg-body img,.pg-body svg{max-width:100%;height:auto}' +
  '[data-action],[data-toggle],[data-count-step]{cursor:pointer}';

const STORE = 'agentos.savedScenes';
const TAP = '[data-action],[data-toggle],[data-count-step],button,a';
const MAX_BOXES = 800; // elements measured per page; a model page is far smaller
const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done()));

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
        li.addEventListener('click', () => { item.done = !item.done; onChange(`${item.done ? 'ticked' : 'unticked'} "${item.text}"`); });
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

const shortText = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

// Taps inside a model-written page. Only this code reacts; the page itself has no scripts.
// changed({ toggle | count }, tapped): tapped = the same tap also went to the agent as a scene event.
function wirePage(root, agent, changed) {
  root.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const act = t.closest('[data-action]');
    const toggle = t.closest('[data-toggle]');
    if (toggle) {
      toggle.dataset.on = toggle.dataset.on === 'true' ? 'false' : 'true';
      changed({ toggle: { text: shortText(toggle) || toggle.dataset.toggle, on: toggle.dataset.on === 'true' } }, Boolean(act));
    }
    const step = t.closest('[data-count-step]');
    if (step) {
      const out = [...root.querySelectorAll('[data-count]')].find((x) => x.dataset.count === step.dataset.countStep);
      if (out) {
        out.textContent = String(Math.max(0, (parseInt(out.textContent, 10) || 0) + (Number(step.dataset.step) || 1)));
        changed({ count: { name: out.dataset.count.slice(0, 40), value: out.textContent } }, Boolean(act));
      }
    }
    if (act) {
      const label = shortText(act) || act.dataset.action.slice(0, 60);
      const value = act.dataset.value ? `, value: ${act.dataset.value.slice(0, 60)}` : '';
      agent.event?.(`The user tapped "${label}" on the page (action: ${act.dataset.action.slice(0, 40)}${value}). Act on it like a spoken request.`, label);
    }
  });
}

// Measure a painted model page for page-check.js: one box per element under the wrapper (nothing
// inside an <svg>), relative to the frame, in CSS px even while the scene is scaled (the g-flash swap).
function measurePage(host) {
  const body = host.shadowRoot?.querySelector('.pg-body');
  if (!body) return null;
  const frame = host.getBoundingClientRect();
  const scale = host.offsetWidth ? frame.width / host.offsetWidth || 1 : 1;
  const rel = (r) => ({ x: (r.left - frame.left) / scale, y: (r.top - frame.top) / scale, width: r.width / scale, height: r.height / scale });
  const index = new Map();
  const boxes = [];
  for (const node of body.querySelectorAll('*')) {
    if (boxes.length >= MAX_BOXES) break;
    if (node.parentElement?.closest('svg')) continue;
    const css = getComputedStyle(node);
    const inline = css.display === 'inline';
    index.set(node, boxes.length);
    boxes.push({
      parent: index.get(node.parentElement) ?? -1,
      tag: node.localName,
      text: [...node.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.data).join(' '),
      rect: rel(node.getBoundingClientRect()),
      rects: inline ? [...node.getClientRects()].slice(0, 20).map(rel) : undefined,
      fontSize: parseFloat(css.fontSize) || 0,
      display: css.display,
      visibility: css.visibility,
      tap: node.matches(TAP),
      // For page-look.js: colours (a gradient counts by its first colour) and a name hint.
      color: css.color,
      background: `${css.backgroundColor} ${css.backgroundImage}`,
      hint: `${node.getAttribute('role') || ''} ${node.getAttribute('class') || ''}`.trim().slice(0, 80),
    });
  }
  const own = getComputedStyle(body);
  const frameCss = getComputedStyle(host);
  const background = `${own.backgroundColor} ${own.backgroundImage} ${frameCss.backgroundColor}`;
  return { boxes, viewport: { width: host.clientWidth, height: window.innerHeight, contentWidth: body.scrollWidth, background } };
}

// The spec for the page model: sources stay with the app, which draws them as real links.
const withoutSources = (spec) => ({ ...spec, blocks: spec.blocks.filter((b) => b.type !== 'sources') });

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
  let lastFailure = ''; // the last layout check failure, for inspect() while the block page shows

  // The user changed the page by hand: tell the live agent (app.js sends nothing offline).
  const tell = (change) => agent.tell?.(changeNote(change, spec));
  const pageChanged = ({ toggle, count }, tapped) => {
    let change;
    if (toggle) {
      const out = markDone(spec, toggle.text, toggle.on);
      spec = out.spec;
      change = out.item ? `${toggle.on ? 'ticked' : 'unticked'} "${out.item.text}"` : `turned "${toggle.text}" ${toggle.on ? 'on' : 'off'}`;
    } else {
      change = `set "${count.name}" to ${count.value}`;
    }
    if (!tapped) tell(change);
  };

  // The model page on screen, measured now: its check failures and how it looks.
  const look = () => {
    const measured = host?.isConnected && measurePage(host);
    if (!measured) return null;
    // Checked against what the page model got: it never sees the sources.
    const fails = checkPage(measured.boxes, measured.viewport, withoutSources(spec));
    return { fails, text: describePage(measured.boxes, measured.viewport, fails) };
  };

  // The finished model page on screen passes the layout checks: a silent note says how it looks.
  // On a failure: one [page check] log line and a silent note to the live agent; the caller goes
  // back to the block page. No retry.
  const pageFits = () => {
    if (view !== 'html') return true;
    const seen = look();
    if (!seen) return true;
    const { fails } = seen;
    if (!fails.length) {
      lastFailure = '';
      agent.tell?.(`[screen] The designed page looks like: ${seen.text}`);
      return true;
    }
    const why = failureText(fails);
    lastFailure = why;
    logEvent('page_check', { text: `[page check] block page kept: ${why}`, kind: spec.kind, failures: fails });
    agent.tell?.(`[screen] The designed page was replaced by the simple page because: ${why}`);
    return false;
  };

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
      wirePage(host.attachShadow({ mode: 'open' }), agent, pageChanged);
      paint();
      el.append(host);
      // The page model writes no links: web search sources are drawn by the app, under the page.
      const sources = spec.blocks.find((b) => b.type === 'sources');
      if (sources) el.append(drawBlock(sources, spec, () => {}, () => {}));
    } else {
      host = null;
      const title = h('h1', 'g-title', spec.title);
      title.dataset.testid = 'g-title';
      el.append(title);
      if (spec.subtitle) el.append(h('p', 'g-subtitle', spec.subtitle));
      const ticked = (change) => { draw(); tell(change); };
      spec.blocks.forEach((b) => el.append(drawBlock(b, spec, ticked, (label) => agent.request(label))));
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
        body: JSON.stringify({ spec: withoutSources(spec), design, style: styleText() }),
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
      pageRaw = raw; // kept before the check: a page kept in this one frame is checked again when it reopens
      shown = out.html;
      setView('html');
      await nextFrame();
      if (pending !== stop) return;
      if (!pageFits()) throw new Error('page failed the layout check');
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
  else {
    // A kept page is checked the same way; it falls back to its block page, with no new model call.
    nextFrame().then(() => {
      if (!pageRaw || pageFits()) return;
      console.info('[page] block page kept: kept page failed the layout check');
      pageRaw = null;
      shown = null;
      setView('blocks');
    });
  }

  // The offline todo asks its question after it has grown (the intro line said what it was doing).
  if (stage === 'review' && data.ask) agent.say(data.ask);

  return {
    state: () => ({ spec, stage: stage === 'saved' ? 'review' : stage }),
    // How the page looks now, for the inspect_page tool. Measurement only.
    inspect() {
      if (view === 'blocks') {
        return lastFailure
          ? `the simple block page is showing: the designed page was replaced because its layout check failed: ${lastFailure}`
          : `the simple block page is showing (${pending ? 'the designed page is still being written' : 'no designed page for this one'}); it draws the spec with the app's own layout`;
      }
      const seen = look();
      if (!seen) return 'error: the page could not be measured';
      return view === 'partial' ? `the designed page is still being written; so far: ${seen.text}` : seen.text;
    },
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
