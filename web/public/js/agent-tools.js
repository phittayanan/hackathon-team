// Client tools of the ElevenLabs agent: the only way the live agent can change the UI.
// Each tool gets plain parameters from the agent and returns a short text result to it.
// The money rule lives here too: no tool can approve a payment. Only the owner's tap on Allow can.
import { validateSpec } from './genui.js';
import { plan as screenPlan } from './plan.js';
import { remember as keepFact, forgetMemory, MEMORY_KEYS } from './memory.js';
import * as learner from './learn.js';

export const PROACTIVE_SCENES = ['shopping', 'payment', 'flight', 'training'];
const SECRETARY_ACTIONS = ['today', 'email', 'add_tasks', 'draft', 'acknowledge', 'snooze'];

// Optional on the first tool call of a task with several steps: the screen shows the plan line.
const PLAN_PARAM = {
  type: 'string',
  description:
    'Only for a task of 2 to 4 steps: the steps in the user\'s language, 2 to 4 words each, separated by |, ' +
    'for example "อ่านอีเมล|ทำลิสต์|รอคุณกด Allow". The screen shows the plan and ticks a step as each tool finishes. Leave it out for one-step tasks.',
  required: false,
};

// Optional on render_ui and revise_ui: a brief for the page model, which writes the page as free HTML.
const DESIGN_PARAM = {
  type: 'string',
  description:
    'A vivid 1-3 sentence brief for the page designer: purpose, mood, layout idea and what the user can tap, ' +
    'for example "A sunny beach-postcard hero with the trip date huge, a timeline of the day below, a big Book button." ' +
    'Make each page in the session look different. Never for urgent pages.',
  required: false,
};

// Tool definitions, shared by the agent config (scripts/agent-sync.js) and the browser.
// Parameters are kept flat (strings and enums) so any tool schema format can carry them;
// structured data travels as a JSON string.
export const TOOL_DEFS = [
  {
    name: 'secretary_action',
    description: 'Personal secretary DEMO with sample data only. today = today tasks and calendar; email = sample client email; add_tasks = import its two tasks once; draft = prepare editable reply proposing 14:30 (13:30 conflicts with team meeting); acknowledge or snooze = act on displayed notifications. Returns current sample data. No real mail or calendar changes. Sending requires the owner tapping the test-send button; no tool can send.',
    params: {
      action: { type: 'string', enum: SECRETARY_ACTIONS, description: 'Secretary action', required: true },
      minutes: { type: 'string', enum: ['1', '5'], description: 'Snooze for one or five minutes', required: false },
    },
  },
  {
    name: 'open_scene',
    description:
      'Open a prebuilt full-screen scene. shopping = read the weekly shopping email and build the list; payment = payment approval card; ' +
      'flight = delayed flight with a faster option; training = sleep score, run plan and 10K race sign-up that fills itself.',
    params: {
      scene: { type: 'string', enum: PROACTIVE_SCENES, description: 'Which scene to open', required: true },
      data_json: { type: 'string', description: 'Optional JSON object with scene data in the shape of the defaults', required: false },
      plan: PLAN_PARAM,
    },
  },
  {
    name: 'scene_action',
    description:
      'Act on the scene that is open. confirm = accept the offer (e.g. change the flight, check out the shopping list); ' +
      'decline = keep things as they are; close = fold back to home. You can never approve a payment: only the owner taps Allow.',
    params: { action: { type: 'string', enum: ['confirm', 'decline', 'close'], description: 'What to do', required: true } },
  },
  {
    name: 'render_ui',
    description:
      'When no prebuilt scene fits, draw a new full-screen page from the fixed components. spec_json is a JSON object: ' +
      '{kind, name, match:[words], title, subtitle, accent: orange|green|blue|purple|pink|dark, urgency: none|urgent|serious, ' +
      'blocks:[...], proposals:[{id,label}]}. Block types: text{text} stat{label,value} progress{label,value 0-100 or "auto"} ' +
      'checklist{items:[{text,done,due,tag}]} list{items} card{title,text} chart{bars:[{label,value}]} field{label,placeholder} ' +
      'button{label} divider{} steps{items} call{label,number 1669|191|199} image{prompt,caption} (a short picture prompt; at most 2).  After it opens, ask if the user likes it and propose one or two changes ' +
      '(unless urgent). With design, a design model then redraws the page as a free-form page in a few seconds.',
    params: { spec_json: { type: 'string', description: 'The UI spec as a JSON string', required: true }, design: DESIGN_PARAM, plan: PLAN_PARAM },
  },
  {
    name: 'revise_ui',
    description: 'Redraw the open generated page with a changed spec (same format as render_ui), after the user asked for a change.',
    params: { spec_json: { type: 'string', description: 'The full changed UI spec as a JSON string', required: true }, design: DESIGN_PARAM },
  },
  {
    name: 'mark_urgent',
    description:
      'Mark the open generated page as urgent (health, injury or emergency): no like question, no proposed changes, never kept. ' +
      'serious = may be life-threatening: also shows a large button to call 1669.',
    params: { level: { type: 'string', enum: ['urgent', 'serious'], description: 'How urgent', required: true } },
  },
  {
    name: 'web_search',
    // Offered only when the server has a search key (TAVILY_API_KEY); see toolDefs().
    needs: 'search',
    description:
      'Search the web for real, current information (events, places, prices, opening hours, news). Returns a short answer and ' +
      'sources. Then show it with render_ui; the page lists the sources as links by itself. Search once per request.',
    params: { query: { type: 'string', description: 'What to search for, in a few words (English or Thai)', required: true }, plan: PLAN_PARAM },
  },
  {
    name: 'keep_scene',
    description: 'The user liked the open generated page and said yes to keeping it: save it so it opens at once next time.',
    params: {},
  },
  {
    name: 'remember',
    description:
      'Save one short fact about the user on their phone, so you know it on their next visit. name = what to call them; ' +
      'likes = what they like or care about (it replaces the old value, so keep what still holds); note = one other useful fact. ' +
      'The last task is saved by itself. Call it without saying anything first, and do not tell the user unless they ask. ' +
      'forget_all when the user asks you to forget them.',
    params: {
      key: { type: 'string', enum: [...MEMORY_KEYS.filter((k) => k !== 'last_task'), 'forget_all'], description: 'Which fact; forget_all = the user asked you to forget everything (facts and what you learned)', required: true },
      value: { type: 'string', description: 'The fact, a few words (empty to forget it)', required: true },
    },
  },
];

// The tools to offer: web_search only when search is available.
export const toolDefs = ({ search = false } = {}) => TOOL_DEFS.filter((t) => t.needs !== 'search' || search);

const withSources = (spec, sources) =>
  !sources?.length || spec.blocks.some((b) => b.type === 'sources')
    ? spec
    : validateSpec({ ...spec, blocks: [...spec.blocks, { type: 'sources', items: sources }] }) || spec;

const designOf = (design) => (typeof design === 'string' && design.trim() ? { design: design.trim().slice(0, 600) } : {});

const parseJson = (text) => {
  if (text == null || text === '') return {};
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Tools that finish a step of the plan line, and what each saves as the user's last task.
const STEP_TOOLS = ['open_scene', 'scene_action', 'render_ui', 'revise_ui', 'web_search', 'keep_scene'];
const FAILED = /^(error|refused|web search failed|web search is not|no results|no page)/;
const SCENE_TASKS = {
  shopping: 'groceries list from the weekly email',
  payment: 'a payment approval',
  flight: 'a delayed flight re-route',
  training: '10K training plan and race sign-up',
};
export function lastTask(name, params = {}) {
  if (name === 'open_scene') return SCENE_TASKS[params.scene] || null;
  if (name === 'web_search') return params.query ? `searched the web: ${params.query}` : null;
  if (name === 'render_ui') {
    const spec = parseJson(params.spec_json);
    if (spec?.saved) return `reopened the kept page: ${spec.saved}`;
    return spec?.title ? `made a page: ${spec.title}` : null;
  }
  return null;
}

// The [screen] note that tells the live agent which pages the user kept, and how to reopen one:
// render_ui with spec_json {"saved":"<kind>"} (the saved spec reference). Empty when nothing is kept.
export function keptPagesNote(saved = {}) {
  const pages = Object.values(saved || {}).filter((p) => p?.kind);
  if (!pages.length) return '';
  const list = pages
    .map((p) => `"${p.name || p.kind}" (reference: {"saved":"${p.kind}"}; words: ${(p.match || []).join(', ') || p.kind})`)
    .join('; ');
  return (
    `[screen] Pages the user kept earlier: ${list}. When the user asks for one of these, reopen it at once: ` +
    'call render_ui with spec_json set to its reference, for example {"saved":"' + pages[0].kind + '"}. Do not draw it again.'
  );
}

// ui: { current(): { name, ctl } | null, openScene(name, data), closeScene(), action(name, extra), nudgeAllow(),
//       search(query) -> { answer, results: [{ title, url, content }] } | { error },
//       saved() -> { [kind]: { kind, name, match, spec } }, tellAgent(text) }
// Optional for tests: ui.plan (the plan line) and ui.remember(key, value) (the memory).
export function createToolHandlers(ui) {
  const plan = ui.plan || screenPlan;
  const remember = ui.remember || keepFact;
  const learn = ui.learn || learner;
  const handlers = createScreenHandlers(ui, learn);
  handlers.remember = ({ key, value } = {}) => {
    if (key === 'forget_all') {
      (ui.forget || (() => { forgetMemory(); learn.forgetLearned(); }))();
      return 'forgot everything about the user on this phone; say so in one short sentence';
    }
    return remember(key, value) ? `remembered ${key}; do not mention it` : `error: key must be one of ${MEMORY_KEYS.join(', ')}`;
  };
  // Every tool: start the plan line if one came with it; a step tool that worked ticks it and
  // saves the last task. A sync result stays sync (the payment refusal is immediate).
  return Object.fromEntries(
    Object.entries(handlers).map(([name, fn]) => [
      name,
      (params = {}) => {
        const planned = Boolean(params?.plan) && plan.start(params.plan);
        plan.busy(true);
        // Released a moment later: the scene watcher hears this tool's own scene change after it ends.
        const release = () => setTimeout(() => plan.busy(false), 0);
        let out;
        try {
          out = fn(params);
        } catch (err) {
          release();
          throw err;
        }
        const done = (result) => {
          release();
          if (STEP_TOOLS.includes(name) && !FAILED.test(String(result))) {
            plan.tick();
            const task = lastTask(name, params);
            if (task) remember('last_task', task);
          } else if (planned) plan.clear(); // the task did not start: no plan to show
          return result;
        };
        return out && typeof out.then === 'function' ? out.then(done, (err) => { release(); throw err; }) : done(out);
      },
    ]),
  );
}

function createScreenHandlers(ui, learn) {
  const generated = () => (ui.current()?.name === 'generated' ? ui.current() : null);
  // The proposals of the last page drawn, until the user takes one (revise) or passes them over.
  let offered = null;
  const passedOver = () => {
    if (offered?.spec.proposals?.length) learn.noteIgnored(offered.spec, offered.spec.proposals);
    offered = null;
  };
  // Sources of the last web search: the next page drawn shows them as links.
  let sources = [];

  return {
    secretary_action({ action, minutes = '1' } = {}) {
      if (!SECRETARY_ACTIONS.includes(action) || (action === 'snooze' && !['1', '5'].includes(minutes))) return 'error: invalid secretary action';
      if (!ui.secretary) return 'error: secretary unavailable';
      return ui.secretary(action, Number(minutes));
    },
    // Returns after the scene has grown (the agent's sentence first), so a next tool sees it.
    async open_scene({ scene, data_json } = {}) {
      if (!PROACTIVE_SCENES.includes(scene)) return `error: unknown scene "${scene}"`;
      const data = parseJson(data_json);
      if (data === null) return 'error: data_json is not valid JSON';
      await ui.openScene(scene, data);
      learn.agentOpened(scene);
      return `opened ${scene}`;
    },

    scene_action({ action } = {}) {
      const open = ui.current();
      if (!open) return 'error: no scene is open';
      if (open.name === 'payment' && action === 'confirm') {
        ui.nudgeAllow();
        return 'refused: only the owner can approve a payment by tapping Allow. Ask them to tap it.';
      }
      if (action === 'close') {
        ui.closeScene();
        return 'closed';
      }
      if (!['confirm', 'decline'].includes(action)) return `error: unknown action "${action}"`;
      ui.action(action);
      return `${action} done on ${open.name}`;
    },

    async render_ui({ spec_json, design } = {}) {
      const parsed = parseJson(spec_json);
      // A kept page's reference: reopen the saved page as it was kept.
      if (typeof parsed?.saved === 'string') {
        const kept = ui.saved?.()[parsed.saved];
        if (!kept) return `error: no kept page "${parsed.saved}"; draw a new page with a full spec`;
        await ui.openScene('generated', { savedKind: kept.kind });
        return `reopened the kept page "${kept.name || kept.kind}"; say it is ready, do not ask if they like it`;
      }
      let spec = validateSpec(parsed);
      if (!spec) return 'error: spec has no usable blocks; use only the fixed components';
      spec = withSources(spec, sources);
      sources = [];
      passedOver();
      await ui.openScene('generated', { spec, ...(spec.urgency === 'none' ? designOf(design) : {}) });
      if (spec.urgency === 'none') offered = { spec };
      return spec.urgency === 'none' ? 'page shown; now ask if the user likes it and propose one or two changes' : 'first-aid page shown';
    },

    revise_ui({ spec_json, design } = {}) {
      const open = generated();
      if (!open) return 'error: no generated page is open';
      let spec = validateSpec(parseJson(spec_json));
      if (!spec) return 'error: spec has no usable blocks';
      // A revise keeps the sources of the page it changes.
      const before = open.ctl.state?.().spec;
      spec = withSources(spec, before?.blocks.find((b) => b.type === 'sources')?.items);
      ui.action('revise', { spec, ...designOf(design) });
      // Learn what the user asked to change, for the next page like it.
      learn.noteRevise(before, spec);
      offered = null;
      return 'page redrawn';
    },

    mark_urgent({ level } = {}) {
      const open = generated();
      if (!open) return 'no page is open (the user closed it); do nothing more';
      const current = open.ctl.state?.().spec;
      const spec = validateSpec({ ...current, urgency: level === 'serious' ? 'serious' : 'urgent' });
      ui.action('urgent', { spec });
      return `marked ${spec.urgency}`;
    },

    async web_search({ query } = {}) {
      if (!ui.search) return 'web search is not available; answer from what you know and say so';
      const out = await ui.search(String(query || ''));
      if (!out || out.error) return `web search failed (${out?.error || 'no answer'}); answer from what you know and say so`;
      sources = out.results.map(({ title, url }) => ({ title, url }));
      if (!out.results.length) return 'no results; answer from what you know and say so';
      const lines = out.results.map((r, i) => `${i + 1}. ${r.title}: ${r.content}`);
      return [`answer: ${out.answer || '(none)'}`, ...lines, 'Now call render_ui with this information; the page shows the sources by itself.'].join('\n').slice(0, 3000);
    },

    keep_scene() {
      const open = generated();
      if (!open) return 'error: no generated page is open';
      const spec = open.ctl.state?.().spec;
      if (spec?.urgency && spec.urgency !== 'none') return 'refused: first-aid pages are never kept';
      ui.action('keep');
      ui.tellAgent?.(keptPagesNote(ui.saved?.()));
      learn.noteKeep(spec);
      passedOver();
      return `kept "${spec?.name || 'page'}"; it opens at once next time`;
    },
  };
}
