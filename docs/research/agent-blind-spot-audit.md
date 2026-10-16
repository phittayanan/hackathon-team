# Agent blind-spot audit for Q-Bot

**Result.** Reading the code found 12 new blind spots besides the known `render_ui` one. Most share one cause: tools tell the agent a name ("opened payment"), not what the screen shows, and a new session does not know which page is open.

**Meaning.** On stage, a follow-up about the screen ("how much?", "which is cheapest?") gets a vague answer, and after 20 quiet seconds the agent forgets the open page.

**Fix next.**

1. Tell a new session which page is open (gap 1).
2. Make `open_scene` return the scene's facts (gap 2).
3. Send catalog results and the chosen product to the agent (gap 3).

**Adopt.** ElevenLabs agent tests, each mock result copied from the real handler.

A blind spot is something the user can see or do that the agent cannot see, check or undo.
The first one found: after `render_ui` the agent got back only `page shown`.
That gap is being fixed in the pull request `fix: Q-Bot knows what is on the page it made`; this file lists it as fixed-in-progress only.

## Part 1. Ways to find blind spots

### How the sources were checked

Primary sources only. Date: 2026-10-16.
The research session's network blocked `elevenlabs.io`, `promptfoo.dev`, `deepeval.com`, `inspect.aisi.org.uk`, `langfuse.com`, the LangSmith docs site, `arxiv.org` and `docs.anthropic.com`.
So most facts come from each tool's own GitHub repository (its docs folder or its generated API types), read without running anything.
A fact marked **(search excerpt)** comes from a web-search excerpt of an official page that could not be opened; treat it as likely, not checked.
**Unverified** means no primary source was read for it.
Every setup time is an estimate, not a measurement.
No API key was used, nothing was installed, no account was made.

### Tools and methods

| Method | What it finds | Cost | Setup (estimate) | Works with ElevenLabs client tools in a browser? |
| --- | --- | --- | --- | --- |
| ElevenLabs agent tests (simulation, next-reply, tool-call) | Wrong tool, wrong parameters, wrong reply to a given tool result, across a scripted or simulated multi-turn chat | Per-test price unverified; LLM cost is billed apart from call charges (search excerpt) | 1–2 h | Yes, by mocking: the browser code never runs, you paste the exact string the handler returns as the mock result |
| ElevenLabs conversation analysis and transcripts | After real runs: per-turn `tool_calls` and `tool_results`, evaluation-criteria and data-collection results | Included with conversations | 30 min | Yes, on real browser runs |
| promptfoo `elevenlabs:agents` provider | Same as ElevenLabs simulation, from a config file you keep in the repo; plus a separate simulated-user provider and red teaming | MIT licence; hosted pricing unverified | 1 h | Mocked only; it calls the simulate-conversation endpoint, which is marked deprecated (see notes) |
| DeepEval `ElevenLabsConnector` + `ConversationSimulator` + `ToolCorrectnessMetric` | Expected against actual tool calls, inputs and outputs, over simulated users with a persona and goal | Apache-2.0; you pay the judge LLM and ElevenLabs usage | 2–3 h | Talks to the live agent over WebSocket; client tools must be rewritten as Python stand-ins |
| Inspect (UK AISI) | Tool-use evals, ReAct agents, approval flows | MIT | 3–4 h | No: the model runs inside ElevenLabs. You would test an offline copy of the prompt and tools against Claude directly |
| LangSmith | Multi-turn simulation (`openevals`), LLM-as-judge on threads, trajectory evals | Developer plan: 5,000 traces a month until a card is added | 2 h | No integration; you would log transcripts yourself |
| Langfuse | Tracing, sessions, LLM-as-judge on datasets and live traces | Self-hosted free; Cloud Hobby free with 50k units a month; Core $29 a month | 1 h cloud, 2–3 h self-hosted | No integration; you would log transcripts yourself |
| LLM plays the user (tau-bench method) | Unreliability across repeated tries (`pass^k`), and who caused a failure (user, agent, environment) and its type (`used_wrong_tool`, `took_unintended_action`, ...) | LLM calls only | Reuse the method, not the code | No: borrow the method inside one of the tools above |
| Trace review of tool calls | What came back after each call, read by a person or pasted into a model for analysis | Free | 30 min | Yes, on real browser runs |
| Code-read audit prompt (this file, appendix) | For every tool and every message the page sends: what the agent knows, what the user sees that it does not, what it cannot undo; and prompt-against-tools mismatches | Free | 30–60 min per run | Yes: it reads the browser code itself, so it sees what mocks hide |

Fit for this project, one line each:

| Method | Before the stage demo (today) | After the hackathon |
| --- | --- | --- |
| ElevenLabs agent tests | Too slow to set up now | Adopt: one simulation test per scene, mock result = the real handler string |
| Transcript review | Yes: read the rehearsal transcripts' `tool_results` | Keep as a weekly habit |
| promptfoo | No | Only if the provider moves off the deprecated endpoint |
| DeepEval | No | Good second step for scored regression runs; costs a Python copy of the tools |
| Inspect | No | Not a fit: cannot reach the real agent |
| LangSmith / Langfuse | No | Only if the team wants a dashboard of many sessions; Langfuse if self-hosted matters |
| tau-bench method | No | Use its `pass^k` idea: run each test several times, not once |
| Code-read audit prompt | Yes: already run, Part 2 | Re-run after every change to tools, prompt or scenes |

### Notes per source

**ElevenLabs agent testing.**
Three test types: simulation (multi-turn, an LLM plays the user), next-reply, and tool-call (which tool, which parameters).
Simulation tests take `tool_mock_config` (`mocking_strategy` all / selected / none, `fallback_strategy` `call_real_tool` or `raise_error`, `mocked_tool_ids`) and `tool_mock_overrides`; each override has `mock_result` ("The return value the LLM sees when this mock is active"), `is_error` and `parameter_conditions`.
Tests can start from `chat_history`, set `dynamic_variables`, and list `success_conditions`.
Simulation testing is in public alpha (search excerpt); whether client tools count as mockable is unverified, system tools are never mocked (search excerpt).
The older simulate-conversation endpoint (`tool_mock_config` per tool name, `partial_conversation_history`) is marked deprecated in favour of tests; a removal date of 2026-10-31 was seen only in a search excerpt.
Conversation analysis stores `evaluation_criteria_results`, `data_collection_results`, `call_successful` and `transcript_summary`; each transcript turn carries `tool_calls`, `tool_results`, `message` and `interrupted`.
Sources: [agent testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing) (search excerpt), [simulate conversations](https://elevenlabs.io/docs/eleven-agents/guides/simulate-conversations) (search excerpt), [elevenlabs-python API types](https://github.com/elevenlabs/elevenlabs-python/tree/main/src/elevenlabs/types) (read).

**ElevenLabs client-tool settings that cause blind spots by themselves.**
`expects_response`: "If true, calling this tool should block the conversation until the client responds with some response which is passed to the llm"; `response_timeout_secs` is 1–120, or -1 to wait.
`tool_error_handling_mode` defaults to `auto`, which by the SDK's field description means `hide` for tools that are not native integrations, so a client-tool error may never reach the agent; `passthrough` sends it.
`sendContextualUpdate` is background context the agent should consider "but don't react to"; `sendUserMessage` "will prompt the agent to take its turn" (search excerpt).
Sources: [client_tool_config_input.py](https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/types/client_tool_config_input.py) (read), [JavaScript SDK](https://elevenlabs.io/docs/agents-platform/libraries/javascript) (search excerpt).

**promptfoo.**
Provider `elevenlabs:agents` with `simulatedUser`, `evaluationCriteria`, `toolMockConfig`, `maxTurns`, and `elevenlabs:history`.
Its code calls `/convai/agents/{id}/simulate-conversation`, the deprecated endpoint above, so it may stop working; that is our inference.
Separate `promptfoo:simulated-user` provider, tau-bench style. Red-team features not checked in depth.
Sources: [providers/elevenlabs.md](https://github.com/promptfoo/promptfoo/blob/main/site/docs/providers/elevenlabs.md), [agents/index.ts](https://github.com/promptfoo/promptfoo/blob/main/src/providers/elevenlabs/agents/index.ts), [simulated-user.md](https://github.com/promptfoo/promptfoo/blob/main/site/docs/providers/simulated-user.md).

**DeepEval.**
`ElevenLabsConnector(agent_id, client_tools={...})` joins the live agent over WebSocket; "Whatever a handler returns is given to the agent as context"; a handler that raises or times out answers with an error (default timeout 30 s).
`ConversationSimulator` takes a scenario, persona and expected outcome; `ToolCorrectnessMetric` compares expected and actual tools, optionally inputs and outputs.
Sources: [elevenlabs connector doc](https://github.com/confident-ai/deepeval/blob/main/docs/content/integrations/voice-agent-connectors/elevenlabs.mdx), [docs folder](https://github.com/confident-ai/deepeval/tree/main/docs/content/docs) (tool correctness, conversation simulator).

**Inspect.**
Custom Python tools, tool error handling, ReAct agents, approval, and an agent bridge that routes an agent's model calls through Inspect. No ElevenLabs connector.
Source: [inspect_ai docs](https://github.com/UKGovernmentBEIS/inspect_ai/tree/main/docs) (tools-custom.qmd, agent-bridge.qmd).

**LangSmith.**
Multi-turn simulation with `openevals`, online LLM-as-judge on threads, trajectory evals; Developer plan limit as in the table.
Source: [langchain-ai/docs, src/langsmith](https://github.com/langchain-ai/docs/tree/main/src/langsmith) (multi-turn-simulation.mdx, billing.mdx).

**Langfuse.**
Tracing, sessions, agent graphs, LLM-as-judge; prices as in the table.
Source: [langfuse-docs](https://github.com/langfuse/langfuse-docs) (PricingTable.tsx, llm-as-a-judge.mdx).

**tau-bench.**
An LLM user talks to a tool-using agent under a policy. `pass^k` shows reliability over repeated tries: for Claude 3.5 Sonnet in the airline domain it falls from 0.46 at k=1 to 0.225 at k=4.
`auto_error_identification.py` labels fault and error type. The repo says it is outdated and points to τ³-bench, which adds a voice mode.
The paper, [arXiv 2406.12045](https://arxiv.org/abs/2406.12045), could not be opened; only the README was read.
Source: [tau-bench README](https://github.com/sierra-research/tau-bench).

**Prompt patterns for finding gaps.**
Anthropic's engineering post on tools: "return only high signal information back to agents"; errors should give "specific and actionable improvements, rather than opaque error codes"; read "the raw transcripts (including tool calls and tool responses)", and let a model analyse concatenated transcripts; have eval agents output reasoning and feedback blocks.
Claude's tool docs: detailed tool descriptions are "by far the most important factor in tool performance".
No source found offers a ready-made "what can the agent see after this call" audit prompt. The appendix prompt is our own, built from these two sources and run in Part 2.
Sources: [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).

### Best audit prompt, and why

The code-read audit prompt (appendix) is the best first method here:
the gaps in this app live in the browser handlers and the page's messages, which every hosted test only mocks.
A mock returns whatever you type, so it cannot show that the real handler says `opened payment` and nothing more.
Reading the code finds that; a simulation test then proves the fix.

## Part 2. Audit of this codebase

Method: the audit prompt in the appendix, run by hand over the code on `main` at `fb9a497`, reading code only.
No agent was run, no ElevenLabs call was made. "Agent" means the live ElevenLabs agent (Q-Bot).
Line numbers are for that commit.

### What the agent receives, channel by channel

| Channel | Where | What the agent gets back | What the user sees that the agent does not |
| --- | --- | --- | --- |
| `open_scene` | `web/public/js/agent-tools.js:222-229` | `opened <scene>` | merchant, items, total, rules check result (payment); flight codes and times; race form; catalog products and errors |
| `scene_action` | `agent-tools.js:231-245` | `closed`, `<action> done on <scene>`, or the payment refusal | whether the scene did anything at all (training and catalog ignore it) |
| `render_ui` | `agent-tools.js:247-262` | `page shown; now ask…` / `first-aid page shown` / reopen line | the drawn page (design model redraws freely) — **known, fix in progress** |
| `revise_ui` | `agent-tools.js:264-277` | `page redrawn` | the redrawn page — **known, fix in progress** |
| `mark_urgent` | `agent-tools.js:279-286` | `marked <level>` or `no page is open …; do nothing more` | — |
| `keep_scene` | `agent-tools.js:289-299` | `kept "<name>" …` plus a `[screen]` kept-pages note | — |
| `remember` | `agent-tools.js:167-173` | `remembered <key>; do not mention it` | — |
| `secretary_action` | `agent-tools.js:216-220`, `app.js:167-173` | the whole sample store as JSON | — (best-covered tool) |
| `skip_turn` | `web/agent/config.js:91-98` | system tool | — |
| `[screen] … page was closed` | `app.js:92` (contextual update) | which scene closed | — |
| `[screen] Pages the user kept …` | `agent-tools.js:153-156`, `live-agent.js:279-280` | kept pages and how to reopen | — |
| `[screen] The user changed what you remember` | `scenes/memory.js:45` | the change | — |
| `[scene event: <line>] Say this …` | `live-agent.js:181`, via `voice.js:99-103` | one fixed Thai sentence (e.g. `pay_done`) | the amount paid, the flight booked, the race entered |
| `[scene event] The user tapped …` | `app.js:48-54`, `scenes/generated.js:224` | the tapped label and action on a generated page | ticks and typing on generated pages — **known, fix in progress** |
| `[feed update] …` | `agent-loop.js:170`, `live-agent.js:316` | feed change plus user context; only when idle (`agent-loop.js:29`) | — |
| `[session start] …` | `app.js:343, 362` | greet with memory | which page is open, if any |
| Typed or spoken text | `app.js:192`, `live-agent.js:309-311` | the words | — |

### Gaps, sorted by severity

Severity: **judges would notice** (likely in a 3-minute demo), **sometimes** (needs a natural but less common turn), **rare**.

| # | Severity | Where | User story | Smallest fix |
| --- | --- | --- | --- | --- |
| 1 | judges would notice | `web/public/js/live-agent.js:275-280`, `web/public/js/session-limits.js:3-5` | The user reads a drawn page for 25 s, then says "เพิ่มนมด้วย"; the session ended after 20 s idle, the new session starts knowing only memory and kept pages, so the agent does not know a page is open or what is on it. | In `startLive`, if a scene is open, send `[screen] The <name> page is open: <one-line summary>` with the kept-pages note. |
| 2 | judges would notice | `web/public/js/agent-tools.js:228` | On the payment card the user asks "ยอดเท่าไหร่" or "ทำไมกด Allow ไม่ได้"; the agent got only `opened payment`, so it cannot say the total or which rule failed, and the prompt forbids guessing prices (`web/agent/prompt.md:70`). | Return a one-line summary from the scene (merchant, total, each rule ✓/✕; flight codes and times) instead of `opened <scene>`. |
| 3 | judges would notice | `web/public/js/scenes/shopping-catalog.js:28-50, 41-44, 56` | After a product search the user asks "อันไหนถูกสุด" or "ตัวที่เลือกแล้วส่งไทยไหม"; the results, the search error and the "เลือกรายการนี้" tap never reach the agent, and `state()` returns only `{catalog:true}`. | When results land, `tellAgent` titles, sellers and prices (or the error); send the choose tap as `agent.event`. |
| 4 | sometimes | `web/public/js/app.js:59-85` (swap path 66-73), `web/public/js/scenes/shopping.js:29, 53`, `web/public/js/app.js:139-144, 277-280` | The shopping list checks out by itself into the payment card, or the presenter opens a scene by hotkey; the user asks "อันนี้คืออะไร"; the agent still thinks the shopping list (or the home) is showing, because `openScene` never sends a `[screen]` note — only `closeScene` does. | In `openScene`, when live, send `[screen] The <name> page is open` (and which page it replaced). |
| 5 | sometimes | `web/public/js/agent-tools.js:242-244`, `web/public/js/scenes/training.js:86`, `web/public/js/scenes/shopping-catalog.js:56` | On the catalog or training page the user says "ตกลง เอาอันนี้"; the agent calls `scene_action confirm`, gets `confirm done on shopping`, tells the user it is done, and nothing happened. | Have `ui.action` report whether the scene handled the action; return `error: this page has no <action>` when not. |
| 6 | sometimes | `web/agent/prompt.md:57-60`, `web/public/js/agent-tools.js:281` | The user says "นิ้วเลือดออก"; the prompt bullet is headed `mark_urgent`, so the agent may call it first; with no page open it gets `…; do nothing more` and draws no first-aid page. | Head the bullet with `render_ui` and change the no-page result to "call render_ui with urgency first". |
| 7 | sometimes | `web/agent/prompt.md:31-32` vs `prompt.md:54-55`, `web/public/js/app.js:53`, `web/public/js/live-agent.js:181` | The user taps a button on a generated page; the message starts `[scene event]`, which line 31 says means "say the given sentence … and nothing more", while line 54 says act on it; the agent may just echo the label. | Give taps their own tag (for example `[tap]`) and name it once in the prompt. |
| 8 | sometimes | `web/public/js/agent-tools.js:53` (`data_json` "in the shape of the defaults"), `web/public/js/data.js:3-9`, `web/public/js/app.js:84` | The user says "จ่ายค่าไฟ 800 บาท"; the agent opens `payment` with guessed keys, the card merges them over the FreshMart defaults and shows ฿849 FreshMart items, and the agent, told only `opened payment`, says 800. | List the real keys in the tool description (`merchant`, `items:[{name,qty,price}]`, `total`, `method`) and return the total shown. |
| 9 | sometimes | `web/public/js/live-agent.js:181`, `web/public/js/scenes/payment.js:52, 61`, `flight.js:58, 65`, `training.js:80` | After the Allow tap the user asks "จ่ายไปเท่าไหร่ ร้านไหน"; the agent only got the fixed sentence `pay_done`, not the amount or merchant. | Add the facts to the scene-event header, e.g. `[scene event: pay_done, paid ฿849 to FreshMart Online]`. |
| 10 | known, fix in progress | `web/public/js/agent-tools.js:254, 261, 276`, `web/public/js/scenes/generated.js` | User: "ในลิสต์มีอะไรบ้าง" after `render_ui`/`revise_ui`; agent got `page shown` / `page redrawn`. | Being fixed in the PR `fix: Q-Bot knows what is on the page it made`. Check that it also covers the kept-page reopen at line 254, which returns only the page name. |
| 11 | rare | `web/agent/prompt.md:106-108`, `web/public/js/live-agent.js:313-315` | The prompt says to answer a `[screen]` close note with `skip_turn`, but `[screen]` goes as a contextual update, which (per the code's own comment at line 314) gives the agent no turn; the line is dead and costs prompt tokens. | Drop the `skip_turn` sentence from the `[screen]` paragraph. |
| 12 | rare | `web/public/js/agent-tools.js:108-111`, `web/public/js/live-agent.js:29, 67`, `web/public/js/app.js:188` vs `web/agent/prompt.md:56` | Code keeps a `sources` block, a `live.search` flag and a "web search can take a while" comment, but there is no search tool and the prompt says search is unavailable; no user-facing failure, only confusion for the next editor. | Leave as is for the demo; remove the dead search paths after. |
| 13 | rare | `web/agent/config.js:39-49` (no `tool_error_handling_mode` set), `web/public/js/live-agent.js:192-198` | A tool runs past `response_timeout_secs: 10` (`config.js:44`); by the SDK field description the default mode hides client-tool errors, so the agent may never learn the call failed and say the page is up. Handler throws are already turned into `error: …` strings, so only timeouts are exposed. | Set `tool_error_handling_mode: 'passthrough'` on each client tool after checking the field on the ElevenLabs API reference. |

### Prompt against tools

- Every client tool in `TOOL_DEFS` (`agent-tools.js:35-104`) and `skip_turn` (`config.js:91-98`) is named in the prompt. No tool is unexplained.
- No instruction names a tool that does not exist. Mismatches found are wording, not names: gap 6 (`mark_urgent` heads a bullet that is about `render_ui`), gap 7 (one tag, two meanings), gap 11 (a turn the agent never gets).
- One field is under-explained: `data_json` (gap 8). The prompt gives its shape only for the catalog.
- Checked and true: "You only get feed updates when no scene is open and nobody is talking" (`prompt.md:104`) matches `agent-loop.js:29`.

### What the agent cannot undo or check

- It cannot undo `scene_action confirm` on flight (`flight.js:42-61`): the scene books and closes itself.
- It cannot stop the training sign-up: it fills and submits itself with no tap (`training.js:51-83`); `scene_action` has no handler there (gap 5).
- It cannot check that a `remember` or `keep_scene` stuck beyond the result line; that is fine.
- It can never approve a payment (`agent-tools.js:234-237`, `payment.js` Allow tap only). This is by design and correct.

## Appendix. The audit prompt

Run it in a coding agent (Claude Code or Codex) at the repo root, reading code only.
It makes no ElevenLabs call and changes no file. Paste everything between the lines.

---

```text
You are auditing a voice and text agent for blind spots. A blind spot is something the user can
see, do or change that the agent cannot see, check or undo. Read code only. Do not run the app,
call any API, or edit any file.

Files to read first:
- web/agent/prompt.md (whole file): the agent's system prompt.
- web/agent/config.js: the tool list, tool settings (expects_response, response_timeout_secs,
  tool_error_handling_mode, pre_tool_speech) and built-in tools.
- web/public/js/agent-tools.js: each tool's definition and every string each handler returns.
- web/public/js/live-agent.js: every sendContextualUpdate, sendUserMessage and sendContext call,
  and what happens when a session starts and ends.
- web/public/js/app.js: tellAgent, every [screen] message, openScene and closeScene.
Reach everything else with grep (scenes in web/public/js/scenes/, voice.js, agent-loop.js,
agent-link.js, data.js) and read only the matching lines.

Step 1. Make an inventory of channels into the agent:
- every tool (client and built-in);
- every message the page sends: contextual updates, user messages, tagged messages such as
  [screen], [scene event], [feed update], [session start];
- dynamic variables filled at session start.
For each, give file:line and the exact text or return string the agent receives.

Step 2. For each channel, answer three questions with file:line evidence:
a. After this, what does the agent know? Quote the exact string; do not assume more.
b. What can the user see or do now that the agent cannot? Follow the code into the scene that
   opens or changes: list what it draws, what it fetches later, every button and input, and
   whether each tap or result is sent to the agent.
c. What can the agent not undo or check? Actions that complete by themselves, handlers that
   report success without doing anything, errors that are swallowed or hidden, timeouts.
Also check these cross-cutting paths: a scene opened by something other than a tool (another
scene, a hotkey, a feed loop); a scene replaced without close; a session that ends and restarts
while a scene stays open; the offline brain taking over.

Step 3. Check the prompt against the tools:
- every tool, parameter, enum value, field and message tag the prompt names: does it exist, and
  does the code behave as the prompt says?
- every tool and parameter the code defines: does the prompt explain when and how to use it,
  including the shape of JSON parameters?
- one tag or word with two meanings, and instructions that can never fire (for example a turn
  the agent never gets because the message is a contextual update).

Step 4. List each gap as one table row:
| # | Severity | Where (file:line) | User story | Smallest fix |
- User story: one line, "User says X; the agent cannot answer because Y."
- Severity: "judges would notice" (likely in a 3-minute stage demo), "sometimes" (needs a
  natural but less common turn), or "rare".
- Smallest fix: one line, the least code that closes the gap.
Sort by severity. Mark gaps already being fixed as "known, fix in progress" and do not count
them as new. Never fill a gap with a guess: if the code does not show it, write "unclear" and
say what to read next.

Step 5. Above the table, write at most 120 words in simple English: Result, Meaning for the demo,
and the top three gaps to fix next.
```

---

Known fixes to tell the auditor about on each run (update this list): `fix: Q-Bot knows what is on the page it made` (render_ui / revise_ui content and taps on generated pages).
