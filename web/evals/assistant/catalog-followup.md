# Catalog follow-ups — 2026-10-16

App change `dadf3f0` addresses the missing product-result visibility found during
the personal-assistant evaluation. Previously `open_scene` returned only
`opened shopping` while results appeared in the browser. It now waits for the
search and returns the current query, THB budget, status, products in visible
order, 1-based positions, stable IDs and `selectedId`.

`catalog_action` supports:

- `read`: get the latest displayed state without searching again.
- `search` with `data_json`: refine query and/or THB budget in place; omitted
  constraints stay unchanged. `budget:null` removes the cap.
- `select` with `data_json:{"product_id":"..."}`: highlight a product in the
  current results. It never orders, opens checkout or approves payment.

Prices remain provider minor units, not converted values: 120000 THB satang
means 1200 baht. New searches clear selected IDs and old positions. Errors
return an explicit error state rather than a successful empty result. Closing
or replacing the page while a search is pending prevents stale tool results.
Manual searches and selections are reflected by the same state read by tools.

## Live setup

The real ElevenLabs agent was synced and its config read back before testing:

- Agent: `agent_4201m513nq4rehzvkg099sqgjgy5`; nine client tools.
- Config SHA-256: `3cbd4a45aff581618be25c39691c82f8e4e5aa31a4feea712e40c332e0ae6f3b`.
- Provider version for both conversations:
  `agtvrsn_8201m516kte8erwvyme8n3ytywzg`.
- Fresh Chrome context per conversation, real SDK, typed Thai input.
- Only `/api/catalog` was replaced with controlled A/B/C data from
  `cases.json`; the brain, tools and audio response were real. Prices were
  filtered by the requested budget, with running suitability and weight in
  descriptions. No product URL was opened.

## Four-turn selection and budget example

Conversation `conv_9001m516qc5xfzjrpdq7a01zft9d`, provider `done`, 56 seconds,
audio present, `text_only:false`.

| User request | Observed model/tool/UI behavior |
| --- | --- |
| หาหูฟังสำหรับใส่วิ่ง งบไม่เกิน 2000 บาท | Opened catalog with running query and 2000 THB. Tool returned A at position 1 (1800 baht, 25g) and B at position 2 (1200 baht, 30g), matching the UI. Compared price/weight from those fields. |
| เอาตัวที่สอง เลือกไว้ก่อน ยังไม่ซื้อ | Called `read`, then `select {product_id:"B"}`. Only B was highlighted and the agent said no order/payment occurred. No second search. |
| ลดงบเหลือ 1500 บาท เงื่อนไขอื่นเหมือนเดิม | Called `search {budget:1500}`. The same running query was preserved; only B remained. Search cleared the previous selection, which the agent correctly disclosed. |
| ตอนนี้มีตัวไหนตรงเงื่อนไขบ้าง และงบเท่าไร ยังไม่ซื้อ | Called `read` and reported B at 1200 baht, running suitability and 30g, within the new 1500 budget. No additional search or payment scene. |

Exactly two catalog HTTP requests occurred, with identical running queries and
budgets 2000 then 1500. This illustrative story is separate from the fixed
30-case suite and is not counted as a new held-out or benchmark case.

## D19 failure and retry

Conversation `conv_9101m516qbxae35shwrnkwbkg9sd`, provider `done`, 64 seconds,
audio present, `text_only:false`.

The first request returned a controlled HTTP 503. The agent acknowledged a
temporary search failure and did not invent results. When asked whether results
had arrived, it volunteered a retry and then reported the successful B result.
The user's explicit next retry also kept the same running query and 1500 THB
budget. Its final `read` reported B's actual fixture price and suitability,
while saying wireless/waterproof details were unknown. Three HTTP requests
occurred: initial failure, volunteered retry, explicit retry. No payment opened.

Codex reviewed actual replies, tool results, request payloads and visible state.
D19 passed all five case metrics with no explicit forbidden action in this
run. Its separate worksheet has one scored case, 19 pending, `passRate:null`.
The optional automatic retry is recorded here rather than hidden as a read.

## Real Shopify probe and limits

Separately, the unchanged server catalog function was called against the real
Shopify endpoint with `query:"wireless headphones", budget:2000`. It returned
one THB-priced product with amount 149084 (1490.84 baht). This verifies a real
response path; it does not verify stock, shipping promises or purchase behavior.
The two model conversations above used fixture products, not that live result.

Local gitignored evidence: `logs/assistant-catalog-followup-catalog-r1.json`,
`logs/assistant-D19-catalog-r1.json`,
`logs/assistant-catalog-provider-metadata.json`, and
`logs/assistant-dev-catalog-r1.json`. Actual microphone input, repeated critical
cases and the full development/held-out suite remain untested on this version.

## Code validation

Full `npm test`: 124 Node unit tests and 95 Playwright tests passed. Lint passed
for 102 JS files. Browser checks cover tool-visible ordering and owner/tool
selection, no extra search on read/select, partial refinement with retained
criteria, clearing stale selection, rejecting invalid input/IDs, empty versus
failed searches, retry, and closing the page during a pending search.

The older prefetch test's programmatic focus remained intermittent even after
waiting for startup. It now uses a real Playwright click, matching its
first-touch behavior under test. Three targeted repeats and the full suite
passed after that test-only change; production prefetch code is unchanged.
