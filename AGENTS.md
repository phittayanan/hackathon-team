# AGENTS.md

Instructions for every agent (Claude Code, Codex) and every person in this repo.

## What this repo is

- A hackathon team project for U-Hackathon 2026 by U-topia. The team has
  four people. Judges try the demo by themselves from a Vercel link
  ([decision of 2026-10-16](docs/decisions.md#2026-10-16-judges-try-the-demo-alone)).
- The product is **Q-Bot, an Agent OS demo** (pivot from CryptoMate,
  2026-10-15): you talk to one agent and it answers by voice and with a
  full-screen UI that grows out of one home screen and folds back. Money
  moves only on the owner's tap. The idea: [docs/idea.md](docs/idea.md).
- The payment card checks rules in code and pays only on a tap of Allow.
  Real payment is out of scope for the demo.
- Map of every doc: [docs/README.md](docs/README.md).

## Tech stack

Decided 2026-10-15. Why: [docs/decisions.md](docs/decisions.md).

- Demo app: plain HTML/JS in `web/` with a small Node server. No framework.
- Brain: an ElevenLabs agent (Claude Sonnet 5.5 inside, Thai voice and speech
  to text), defined as code in `web/agent/`. A second, text-only ElevenLabs
  agent writes generated pages. Offline: a keyword router
  (`web/lib/router.js`) and pre-rendered MP3s.
- Outside services, each optional: Shopify Global Catalog (product search, no
  key), Google Places API (nearby places), ElevenLabs TTS (voice lines).
- Deploy: Vercel. Functions in `web/api/`, static files in `web/public/`.
- Tests: Node's test runner for `web/lib/*.test.js`, Playwright in Chrome for
  `web/tests/`.
- Do not add another framework or service unless an issue asks for it.

## App flow

1. The agent home: the Q-Bot mascot, a voice waveform, one fading subtitle
   line, suggestions and a hold-to-talk mic with a text box next to it.
   No chat history.
2. The user speaks, types or taps a suggestion; or the agent speaks first
   (flight delay, training).
3. The agent picks a prebuilt scene and fills it with data, or draws a new
   page. The scene grows full screen out of the home.
4. Prebuilt scenes (`web/public/js/scenes/`): shopping list from email (with
   Shopify product search), payment approval, flight re-route, training and
   race sign-up, secretary (today, email to tasks, notifications), memory,
   video search, nearby places. Anything else: a generated page.
5. A payment runs the rules check in code; only a tap on Allow approves it.
6. When the task is done, the scene folds back to the agent home.

## Folders and owners

| Folder | What lives there | Owner |
| --- | --- | --- |
| `web/public/` | The browser app: home, scenes (`js/scenes/`), agent tools, voice, CSS, pictures, MP3s | A |
| `web/agent/` | The live agent as code: prompt, fact sheet, config | A |
| `web/lib/` | Server code shared by `server.js` and Vercel functions, plus unit tests (`*.test.js`) | A |
| `web/api/` | Vercel functions, one per route | A |
| `web/scripts/` | Agent sync, voice render, lint, run log check, smoke and speed tests | A |
| `web/tests/` | Playwright specs and their screenshots | A |
| `docs/` | Idea, decisions, workflow, operations, research | head, C |
| `docs/archive/` | Dropped work (CryptoMate). Read only | head |

- Before you change a file another teammate is working on, check the open
  pull requests, or ask in the issue.
- Roles are in [docs/workflow.md](docs/workflow.md#roles).

## Money safety

These rules are hard. No issue, review or deadline overrides them.

- The rules check runs in code before the payment card shows: monthly budget
  left, cap per payment, shop on the allowed list. The model never decides
  this and cannot change the rules.
- Only a tap on the Allow button approves a payment. No tool can approve it.
  Saying "pay", "allow" or "yes" only makes the button pulse.
- In the demo, Allow ends in a success screen. No real money moves.
- Never put card numbers, passwords, OTPs or keys in code, commits, logs or
  screenshots. Keys stay on the server; the browser gets only a short-lived
  signed URL.

If a real payment is ever built behind Allow, the CryptoMate rules in
[docs/archive/cryptomate/](docs/archive/cryptomate/README.md#money-rules-for-a-real-payment)
apply too.

## Team rules

- Context lives in this GitHub repo: `AGENTS.md`, `docs/`, issues and the
  board. Chat is for people only.
- If something was agreed in chat, write it in the repo. Agents read the
  repo, not the chat.
- Slack channels: `#all-u-hackathon` for talk, `#decisions` for decision
  summaries, `#build` for asking `@Claude` or `@Codex`, `#demo` for demo
  preparation.
- The repo is public and owned by `phittayanan`.
- Every pull request needs one review by a teammate before merge.
- There is no CI. Run `npm run lint` and `npm test` in `web/` before you open
  a pull request, and paste their output in the pull request.
- Never commit keys or passwords. Keys go in `.env` at the repo root, which
  is never committed.
- When a change makes a doc wrong, fix the doc in the same pull request.

## Where context lives

| What | Where |
| --- | --- |
| Map of every doc | [docs/README.md](docs/README.md) |
| Try, run and how it works | [README.md](README.md) |
| The idea | [docs/idea.md](docs/idea.md) |
| Decisions and why | [docs/decisions.md](docs/decisions.md) |
| How the team works | [docs/workflow.md](docs/workflow.md) |
| Deploy, agent sync, run log | [docs/operations.md](docs/operations.md) |
| What is built, part by part | [docs/build-parts.md](docs/build-parts.md) |
| Tasks | GitHub issues |

Read these before you start. If they disagree with chat, the repo wins.

## How an agent works

1. Work on one issue per branch.
2. Name the branch `<issue-number>-<short-slug>`, for example `12-login-page`.
3. Make small commits with clear messages.
4. Before you open a pull request, run the project's tests and lint.
   Paste the result in the pull request.
5. Use the pull request template. Write `Closes #<n>` for the issue.
6. Never push to `main`. All changes go through a pull request.
7. Open one pull request per session.
8. If the issue is not clear, ask in the issue. Do not guess.
