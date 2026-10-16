## Why

From the blind-spot audit (`docs/research/agent-blind-spot-audit.md`, Part 2 gaps 1 to 3):

1. A new live session did not know a page was open: after a 20 s idle end, "เพิ่มนมด้วย" had no page to act on.
2. `open_scene` returned only `opened <scene>`, so Q-Bot could not say the payment total, which rule failed, or the flight times.
3. Catalog results, the search error and the choose tap never reached Q-Bot, and `state()` returned only `{catalog:true}`.

## What changed

1. New `web/public/js/scene-summary.js`: one pure summary per scene (payment, flight, shopping list, training, catalog), plain text, at most 400 characters, cut with `…`. Payment lists rules before items, so a cut drops items, never a rule. Each scene's controller exposes `summary()`; `open_scene` now returns `opened <scene>: <summary>`, and still `opened <scene>` if that scene is not the one showing. `flight.js` uses the shared `addMinutes`.
2. `startLive` sends `[screen] The <name> page is open: <summary>` after the kept-pages note. It uses the scene summary, or `pageSummary` from `genui.js` for a generated page. A scene with no summary gets the bare name.
3. Catalog: when results land, the live agent gets `[screen] Catalog results: …` (titles, sellers, prices) as silent context. A failed search sends `[screen] Catalog search failed: …`. The choose tap is a `[scene event]` with no label, so nothing is said offline and the subtitle does not change. `state()` returns `query`, `results`, `error` and `chosen`. The route handler reads only `spec`, `stage` and `saved` from the body, so the extra fields have no effect there.

No page looks different: no markup, style or text on any page changed. `genui.js`, `generated.js`, the prompt, and the `render_ui` / `revise_ui` parts of `agent-tools.js` are untouched.

`tests/smart-agent.spec.js` has two `opened <scene>` checks updated to the new result. That spec was **not run**: the task limits the run to the four specs below.

## How I tested it

No ElevenLabs call: the SDK and agent routes are stubbed, as in the existing live tests. This box has Playwright's Chromium, not branded Chrome, so the specs ran through a local config that is not committed. It only drops `channel: 'chrome'` and points at `/opt/pw-browsers/chromium`.

```text
$ node --test lib/agent-tools.test.js lib/scene-summary.test.js
# tests 19
# pass 19
# fail 0

$ npm run lint
lint ok: 109 files pass node --check

$ npx playwright test tests/live-agent.spec.js tests/shopping-catalog.spec.js tests/home-payment.spec.js tests/flight.spec.js
28 passed (1.1m)
```

New tests:
- unit: every summary, the rule order under a cut, `clip`, `openPageNote`, and `open_scene` with a summary
- live: open page after a session restart (generated page and payment); catalog results, choose tap and error
- offline: catalog `state()` in the next route request

## Issue

No issue. This comes from audit gaps 1 to 3.
