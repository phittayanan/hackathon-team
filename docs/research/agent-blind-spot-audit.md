# Agent blind-spot audit for Q-Bot

<!-- SUMMARY -->

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
