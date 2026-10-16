# Build parts

What is built, part by part, and where it lives. Paths are under `web/`.
To add work, open a GitHub issue with the
[Task template](../.github/ISSUE_TEMPLATE/task.md).

The CryptoMate build parts were dropped on 2026-10-15. They are in the git
history of this file and in [archive/cryptomate/](archive/cryptomate/README.md).

Folders and owners: [AGENTS.md](../AGENTS.md#folders-and-owners).
Hard rules for every part: [Money safety](../AGENTS.md#money-safety).
How to run and test: [README.md](../README.md).

## Done

Checked against `main` at `3b92022` (2026-10-16).

| # | Part | Main files | Pull requests |
| --- | --- | --- | --- |
| 1 | Agent home, scene system, payment card | `public/js/app.js`, `public/js/scenes/payment.js`, `public/js/pay-rules.js`, `lib/router.js` | #18 |
| 2 | Shopping list from email, voice lines | `public/js/scenes/shopping.js`, `public/js/voice.js`, `scripts/render-voice.js` | #18 |
| 3 | Flight delay card | `public/js/scenes/flight.js` | #18 |
| 4 | Training page, race sign-up (waits for the user's yes) | `public/js/scenes/training.js` | #18, #54 |
| 5 | Generated pages: block pages, like-and-adjust, keep liked pages | `public/js/genui.js`, `public/js/scenes/generated.js` | #18, #43, #45 |
| 6 | Always-on agent | `public/js/agent-loop.js`, `public/js/feeds.js`, `public/js/brain.js`, `public/js/agent-link.js` | #18 |
| 7 | Vercel deploy | `api/`, `lib/handlers.js`, `lib/vercel.js`, `vercel.json` | #18, #34 |
| 8 | Judge-ready: no passcode, daily limit, suggestions, offline notice | `lib/usage.js`, `public/js/suggest.js` | #20, #21, #24 |
| 9 | Speed: faster live start and boot | `public/js/live-agent.js`, `scripts/measure.js` | #25 |
| 10 | Smarter live agent: today's date, memory, learned preferences, plan line, fact sheet | `agent/`, `public/js/memory.js`, `public/js/learn.js`, `public/js/plan.js` | #23, #27, #28 |
| 11 | Secretary demo: today, email to tasks, notifications | `public/js/secretary.js`, `public/js/scenes/secretary.js` ([notes](../web/SECRETARY-DEMO.md)) | #30 |
| 12 | Credit saver: session limits, pictures made ahead of time, key rotation, blocked workspace skipped | `lib/accounts.js`, `lib/images.js`, `public/js/session-limits.js` | #31, #52 |
| 13 | Generated pages as free HTML from the page writer, sanitized; page check and look | `lib/page-model.js`, `public/js/page-sanitize.js`, `public/js/page-check.js`, `public/js/page-look.js` | #33, #46, #50 |
| 14 | Memory page: see, edit, forget | `public/js/scenes/memory.js` | #36 |
| 15 | Q-Bot glass UI and mascot states | `public/css/app.css`, `public/js/mascot.js`, [design system](qbot-design-system.md) | #37 |
| 16 | Shopify product discovery (replaced Tavily web search) | `lib/shopify-catalog.js`, `public/js/scenes/shopping-catalog.js` ([notes](../web/SHOPIFY-CATALOG.md)) | #38 |
| 17 | Personal design system: each user's pages learn their style | `public/js/style.js` | #39 |
| 18 | The agent sees the open scene and its facts | `public/js/scene-summary.js` | #48 |
| 19 | YouTube tutorial search | `public/js/youtube-search.js`, `public/js/scenes/video-search.js` | #47 |
| 20 | Nearby places through Google Maps | `lib/places.js`, `public/js/scenes/places.js` ([notes](../web/PLACES.md)) | #53 |

## Open pull requests

Checked 2026-10-16. The live list is on GitHub.

| Pull request | What it adds |
| --- | --- |
| #51 | Video search lists YouTube clips and plays them in the app, with a Shorts mode |
| #41 | Assistant replies grounded in secretary and catalog data, with behavior evals |
| #26 | Generated pages: better layout, hierarchy and usability |

## Pick up next

The demo plan and the demo video are being replanned. Until then, these are
left from the earlier list:

| Part | Why | Size |
| --- | --- | --- |
| Pick a better Thai voice | The account has no Thai-only voice; try voices, then `npm run voice -- --force` | 0.5 h |
| Thai keywords | Speech to text makes mistakes in Thai; add the words people really say to `lib/router.js` | 1 h |
| Real U-topia payment behind Allow | Only after the hackathon; follow [Money safety](../AGENTS.md#money-safety) | 3 h |

Removed from the earlier list: the live agent smoke test (the agent is live),
HTTPS for the phone (Vercel serves HTTPS), more block-page parts
(pages are now written as free HTML, part 13), and the stage rehearsal (no live
pitch since [2026-10-16](decisions.md#2026-10-16-judges-try-the-demo-alone)).
