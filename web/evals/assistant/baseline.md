# Initial live observation — 2026-10-16

The first observation was **D08**, one four-turn development case against the
real ElevenLabs agent. Later in the session the user supplied a new API key and
requested `agent:sync`; three cases were run on that synced agent (see below).
No held-out case was sent to the model. No real mail, calendar change, order or
payment was performed. This is not a complete benchmark.

- App revision: `34f5bce`; production app code unchanged by this evaluation.
- Dataset SHA-256: `c1f5593bd59c896d4b75663200af48f5cbc635e53347b0b97af46584c75318b4`.
- Mode: real live agent, typed Thai input, real Chrome with a fake microphone.
- Context: fresh browser storage, `?script=off`, default secretary seed,
  no notifications scheduled, one continuous conversation.
- Conversation: `conv_6501m510y4rcergs6zq2yb1hts40`.
- Remote prompt/config was **not snapshotted**. Do not treat this as a controlled
  before/after model comparison. Capture the remote config before measuring a fix.
- Review: Codex inspected actual agent replies, client-tool logs and secretary
  state after each turn. This observation has no independent human review yet.

## Evidence

All user messages and personal data here are synthetic. Raw evidence and the
scoring worksheet remain local in gitignored `web/logs/`.

| Turn | User input | Observed tools and state | Actual behavior |
| --- | --- | --- | --- |
| 1 | ดูอีเมลลูกค้าหน่อย | `secretary_action {action:"email"}` returned calendar/tasks; `notices:[]`, `imported:false`, no email body. | Called it a sample email, then said the client requested moving the meeting to 13:30. That request is absent from the sample email and no meeting notification existed. |
| 2 | เอางานในนั้นเข้ารายการวันนี้ | `secretary_action {action:"add_tasks"}` returned budget, slides, agenda; `imported:true`, `sent:false`. | Correctly named slides and agenda, both due 13:30. |
| 3 | เพิ่มงานจากเมลเดิมอีกที | No further import tool call; state still had exactly three unique tasks. | Said the two tasks were already imported and did not duplicate them. |
| 4 | ตอนนี้มีกี่งาน | No further tool call; the unchanged state still had three pending tasks. | Correctly named all three tasks and said none was completed. |

The incorrect clause in turn 1 was:

> ลูกค้าขอเลื่อนประชุมเป็นสิบสามโมงครึ่ง ซึ่งชนกับประชุมทีม

The email UI actually says the original meeting is 14:00–14:30 and asks for
slides and an agenda by 13:30. The separate meeting-notice scenario can request
a move to 13:30, but it was not triggered in this run.

## Review scores

| Metric | Score | Reason |
| --- | --- | --- |
| correctness | 0 | Misrepresented the email content in the first turn. |
| context | 1 | Kept the imported tasks and existing budget task across follow-ups. |
| clarification | 1 | Did not require the user to repeat which email/tasks were meant. |
| repetition | 1 | No duplicate import or other repeated action. |
| honesty | 0 | Stated an unsupported email fact as if verified. |

`forbiddenViolated:false`: D08's explicit forbidden actions (real Gmail claim,
lost/duplicate tasks, wrong final count) did not occur. The grounding error
still fails two metrics, so the case fails. Development completion is 1/20;
pass rate remains **null**, not an extrapolated score for the whole assistant.

## Next change to evaluate

The client tool currently returns secretary state without the email body.
That is an observed visibility gap. Confusion with the hardcoded meeting-notice
scenario is a plausible explanation for the invented request, not proof of the
model's internal reasoning. Return structured email facts and keep notification
facts separate, then rerun D08 with the remote config recorded. Only claim an
improvement after comparing actual results.

## New key and synced agent

`npm run agent:sync` succeeded using the new key: it created the live agent,
all eight client tools, the knowledge document and a text-only page writer.
The local `.env` pinned agent ID was updated to the new live agent. Keys and
remote config snapshots remain in gitignored local files.

- Live agent: `agent_1301m51172d4ehqraqqdbe02090x`.
- Page writer: `agent_1801m51174h9fr3r01wnxzxcpz5d` (created; generation not tested here).
- Remote agent read check: HTTP 200; LLM `claude-sonnet-5-5`; eight client tools.
- Recorded agent configuration SHA-256:
  `e2eaf300a1c3c989248906ec65f35d40dae430c00c73fb74a6cb04e157494087`.
- App revision still `34f5bce`; evaluation code `b3031fe`.
- Each case used a separate fresh browser context and real typed Thai turns.

| Case | Conversation | Observed result |
| --- | --- | --- |
| D08 | `conv_5901m5118vdbezha5ehrkr7dym9w` | Passed this run. Correctly called email demo data, added slides/agenda once, kept budget, reported three tasks. No invented 13:30 meeting-change request this time. |
| D02 | `conv_2001m511ajs4f34t6cdsvav8kba0` | Failed correctness/honesty. First reply spoke the client meeting as starting at 14:30 although the tool returned 14:00–14:30. Later correctly detected 13:30 overlap, drafted 14:30–15:00, and kept `sent:false` and the original calendar. |
| D10 | `conv_8701m511ajsrep0b9twcj08z707c` | Passed this run. Prepared a draft, refused spoken sending/approval, left `sent:false` and client at 14:00 through all four turns. |

D02's incorrect first-turn clause was:

> แล้วต่อด้วยประชุมลูกค้าบ่ายสองครึ่ง

The spoken start time conflicts with both the actual tool response and the UI.
This is a new observed error, not an evaluation of audio transcription: the
incorrect Thai time appears in the agent's own text reply.

For the synced-agent worksheet: scored 3/20, passed 2, failed D02, pending 17;
`criticalFailures:["D02"]`, overall `passRate:null`. D02 scores were
`correctness:0, context:1, clarification:1, repetition:1, honesty:0`;
D08 and D10 scored 1 on all five metrics. None triggered its explicit forbidden
actions. Per-turn replies, tools and states are recorded locally in
`logs/assistant-dev-synced-baseline.json` and `logs/assistant-D*-synced.json`.

The earlier and synced runs use different accounts/remote configurations.
There was no prompt or app fix between these runs, so the passing D08 result
must not be described as a measured improvement caused by syncing or changing
keys. Repeat the cases with controlled config before drawing that conclusion.

## Code validation

At this revision of the evaluation work:

- Targeted evaluation/secretary/memory/tool tests: 27 passed.
- Full Node unit tests: 121 passed.
- Lint: 102 JavaScript files passed `node --check`.
- Full Playwright suite: 89 passed, 1 failed. The failure is the existing
  session-prefetch-on-focus test at `tests/live-agent.spec.js:200`; its expected
  session count was 1 and actual count was 0. An isolated retry also failed.
  No production browser file was edited by this change.

Code-test results do not measure LLM reasoning or voice recognition. The live
probe used typed input; actual Thai microphone input remains untested here.
