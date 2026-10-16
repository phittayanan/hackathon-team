# Decisions

One entry per decision. Put the newest entry at the top.
First post a short summary in `#decisions` on Slack, then write it here.

## Template

Copy this block for a new decision:

```markdown
## YYYY-MM-DD: <short title>

- **Decision:** what we chose.
- **Why:** the reason.
- **Who decided:** names, or "whole team".
```

## 2026-10-16: Docs match the demo

- **Decision:** The product is written as "Q-Bot, an Agent OS demo". The
  money safety rules in `AGENTS.md` describe the demo as it is: rules check
  in code, Allow is a button only, no real money, no keys in the repo. The
  CryptoMate folder plan, Chrome setup and U-topia rules move to
  [archive/cryptomate/](archive/cryptomate/README.md), with the price test.
  Team operations (deploy, agent sync, run log) move from the README to
  [operations.md](operations.md).
- **Why:** The docs had drifted from the code: they named folders that never
  existed, a web search that was removed and an agent name that changed.
- **Who decided:** phittayanan

## 2026-10-16: Shopify product search instead of Tavily web search

- **Decision:** The `web_search` tool (Tavily) is removed. The live agent
  finds products through Shopify Global Catalog instead
  ([notes](../web/SHOPIFY-CATALOG.md)). There is no general web search.
- **Why:** osizk was building an agent that helps people shop, first with
  Tavily for the shopping search (issue #32), then moved it to Shopify. The
  general `web_search` tool (pull request #20) used the same Tavily code, so
  it went out with it, not by a decision of its own. The change is commit
  `794e172`, merged in pull request #38.
- **Who decided:** osizk
- **Update (pull request #60):** a general `web_search` tool is back for
  current facts (events, prices, news). It is optional (`TAVILY_API_KEY`).
  Products still come from Shopify.

## 2026-10-16: Pictures made ahead of time

- **Decision:** Pictures in generated pages come from a fixed set in
  `web/public/pics/`, picked by keyword. No image API call.
- **Why:** The ElevenLabs image API used about 18% of the credit
  (`web/lib/images.js`). Pull request #31.
- **Who decided:** not recorded

## 2026-10-16: Judges try the demo alone

> Partly superseded: Tavily web search was removed (see "Shopify product search instead of Tavily web search").

- **Decision:** There is no live pitch. Judges get the pitch deck, the source
  and a Vercel link, and they try the demo with nobody from the team there.
  So the passcode is gone, because a passcode in a public README protects
  nothing. A daily usage limit, for the whole site and per visitor, guards
  the ElevenLabs and Tavily credit. When the limit is reached or the credit
  runs out, the page switches to offline mode by itself. The home shows a
  short hint, suggestion buttons and the text box. Presenter controls need
  `?presenter=1`. Real Gmail is dropped and the fake data stays, but the
  live agent can search the web through Tavily (free tier) and show the
  sources.
- **Why:** "เราจะไม่ได้เป็นคนใช้ ... จะส่งแค่ source ไปให้": the demo must
  work for a stranger on the first click.
- **Who decided:** head (team lead)

## 2026-10-15: Deploy on Vercel

- **Decision:** The demo also runs on Vercel (issue #19). The always-on loop
  and fake feeds run in the page; the server routes are Vercel functions
  sharing code with the local server; logs go to Vercel's function log. The
  first plan was a passcode on every route that can call ElevenLabs. On
  2026-10-16 a daily usage limit replaced it (see above). Local `npm start`
  keeps working with no keys.
- **Why:** "Vercel" - a link the team and judges can open without our
  laptop.
- **Who decided:** head (team lead)

## 2026-10-15: Pictures in generated pages

> Superseded by "Pictures made ahead of time" (2026-10-16).

- **Decision:** Generated pages can have an image part with a short prompt.
  The page shows a grey frame at once; the server asks the ElevenLabs Image &
  Video API (`gemini-2.5-flash-image`) and the picture fades in. Pictures are
  cached by prompt, capped per page, and any error keeps the frame with an
  icon. The four storyboard scenes keep their ready-made pictures.
- **Why:** "เปิด" - pages the agent makes should look as good as the
  prebuilt ones.
- **Who decided:** head (team lead)

## 2026-10-15: The brain is an ElevenLabs agent

- **Decision:** The agent's brain is an ElevenLabs agent (ElevenAgents) with
  Claude Sonnet 5.5 inside, Thai voice and Thai speech to text. It is defined
  as code (`web/agent/`) and created or updated by `npm run agent:sync`. The
  browser joins with the official JS SDK through a signed URL from our
  server. The agent changes the screen only through client tools. Feed
  changes go into the conversation as contextual updates. The Claude API key
  path is removed. Offline, the keyword router, cached MP3s and ready-made
  pages still run the demo.
- **Why:** "ElevenLabs agent" - one service for voice, listening and the
  brain.
- **Who decided:** head (team lead)

## 2026-10-15: Allow is a button only

- **Decision:** On the payment card, only a tap on Allow moves money. Saying
  "allow", "yes" or "pay" only makes the button pulse. This holds even if
  the agent says otherwise; the code checks it. Tonight Allow ends in a success
  screen only, with no real payment.
- **Why:** Speech to text makes mistakes, and money must never move by
  mistake. Same rule as before: nothing pays without the owner's approve.
- **Who decided:** head (team lead)

## 2026-10-15: A real always-on agent

- **Decision:** The agent speaks first by itself. A loop (in the page since
  the Vercel move) watches fake feeds (email, calendar, sleep and runs,
  flight) every few seconds and decides when to speak and which scene to
  open. The agent decides when live, simple rules offline. It never speaks
  over an open scene or while anyone talks. A script keeps the demo order
  fixed; the presenter can fire a feed event from a panel. The panel and the
  hotkeys stay as the last resort, behind `?presenter=1` since 2026-10-16.
- **Why:** "Always-on จริง" - the agent should really watch and act, not
  wait for a presenter key.
- **Who decided:** head (team lead)

## 2026-10-15: Keep the pages the user likes

- **Decision:** When the user likes a generated page, the agent asks whether
  to keep it. A kept page is saved in the browser and opens at once next
  time, with new data and no new generation.
- **Why:** "แล้วถ้าอันเจอที่ user ชอบแล้วค่อยทำเป็นอะไรที่ไว้ใช้ประจำ" - what
  the user likes should become something they use every day.
- **Who decided:** head (team lead)

## 2026-10-15: Generated pages with a like-and-adjust loop

- **Decision:** Keep the four prebuilt scenes. For a task with no scene, the
  agent draws a new page as JSON from a fixed set of parts, never as HTML or
  code. Then it asks if the user likes it and proposes one or two changes;
  the spoken answer changes the page in place.
- **Why:** "มันต้อง generate ได้ด้วยเพื่อมันมี task ที่มันไม่คุ้น" - the agent
  will get tasks it does not know. A fixed set of parts keeps it safe.
- **Who decided:** head (team lead)

## 2026-10-15: Agent OS storyboard

> Partly superseded: the home now has a text box and suggestions, and there is no live pitch (2026-10-16). The demo plan is being replanned.

- **Decision:** Agent home, then four scenes: shopping list from email,
  payment card, training with race sign-up, flight delay. Every scene grows
  out of the home and folds back. The home has no chat history and no text
  box. Use cases are the three of the Muse launch video. Details:
  [agent-os-storyboard.md](agent-os-storyboard.md).
- **Why:** Each scene shows one message: the agent builds UI, money moves
  only on approve, multi-step work for you, the agent speaks first.
- **Who decided:** head (team lead)

## 2026-10-15: Pivot from CryptoMate to Agent OS

- **Decision:** We build **Agent OS**: you talk to an agent, and it answers
  with real UI instead of text, on one screen, never switching apps. This
  replaces CryptoMate and the CryptoMate entries below (app flow, payment
  assistant, tech stack, money story, demo story). The demo app is plain
  HTML/JS with a small Node server in `web/`, ElevenLabs for the voice,
  Claude optional (issue #17).
- **Why:** The team lead changed the idea ("เปลี่ยน"). A demo need not be
  pretty; quality rises as models improve.
- **Who decided:** head (team lead)

## 2026-10-15: Product is CryptoMate

> Superseded by the pivot to Agent OS (2026-10-15). Notes kept in [archive/cryptomate/](archive/cryptomate/README.md).

- **Decision:** We build CryptoMate, "เพื่อนคู่ใจที่ดูแลเงิน crypto ของคุณ
  ให้ง่ายและปลอดภัย" - a friend that keeps your crypto money easy and safe.
  A web app is the main product. LINE is connected later if time allows.
- **Why:** Paying with crypto today is hard and risky: few shops accept it,
  fees, price swings, scams. The event is run by U-topia, a PayFi company.
- **Who decided:** head (team lead)

## 2026-10-15: App flow

> Superseded by the pivot to Agent OS (2026-10-15). Notes kept in [archive/cryptomate/](archive/cryptomate/README.md).

- **Decision:** The user types what they want. The agent shows a marketplace
  list labelled 1, 2, 3. The user picks one. A detail view compares price and
  shipping across shops. The user presses buy. The agent opens the shop,
  fills the address form and reaches payment. The human only approves.
- **Why:** The agent does the work; the human keeps the one decision that
  moves money.
- **Who decided:** head (team lead)

## 2026-10-15: Our own crypto payment assistant pays, with rules and approve

> Superseded by the pivot to Agent OS (2026-10-15). Notes kept in [archive/cryptomate/](archive/cryptomate/README.md).

- **Decision:** Payment goes through our own crypto payment assistant. Before
  every payment it checks rules in plain code, not by the model: monthly
  budget left, cap per payment, shop on the allowed list. Then the owner
  approves in the web app. Only after approval does it pay, with the U-Card
  (U-topia's Visa card, funded from crypto). The agent drives the real
  U-topia app with the team lead's main U-topia account, made for this.
  The U-topia steps are a fixed script that stops before the final confirm.
- **Why:** "Easy and safe" means the model can never move money on its own.
  U-topia has no public API, SDK or sandbox, so the agent must drive the app.
- **Who decided:** head (team lead)

## 2026-10-15: Tech stack

> Superseded by the pivot to Agent OS (2026-10-15). Notes kept in [archive/cryptomate/](archive/cryptomate/README.md).

- **Decision:** Agent base loop: Pi v1.2.0
  (`@earendil-works/pi-coding-agent@1.2.0`) on Node. Browser: Playwright as a
  library, attached by CDP to a dedicated Chrome profile the owner logged in
  to by hand. Approve in the web app. On stage, share the real Chrome window
  next to the web app; stream the agent screen into the web app
  (CDP `Page.startScreencast` over a WebSocket) only if time allows. Use shops
  checked to work; Shopee, Lazada and Amazon often block agent browsers.
- **Why:** The agent never sees a password. A fixed script is safer than model
  guesses for the payment steps.
- **Who decided:** head (team lead)

## 2026-10-15: Money story

> Superseded by the pivot to Agent OS (2026-10-15). Notes kept in [archive/cryptomate/](archive/cryptomate/README.md).

- **Decision:** A 0.5-1% fee per purchase now. Later, sell the rules engine as
  an API to agent builders. On stage the fee is shown on a slide only; no real
  fee is taken.
- **Why:** A simple fee is easy to explain in a 3-minute demo. The rules
  engine is useful to anyone building shopping agents.
- **Who decided:** head (team lead)

## 2026-10-15: Demo story

> Superseded by the pivot to Agent OS (2026-10-15). Notes kept in [archive/cryptomate/](archive/cryptomate/README.md).

- **Decision:** Three beats. First, one real small buy of a physical item
  from a real online shop, paid with the U-Card (candidate: NaRaYa on Shopify,
  coin pouch at 60 THB; runner-up 7-Eleven ALL Online; not final). Second, a
  fake concert-ticket seller is blocked because the shop is not on the allowed
  list. Third, a purchase over the monthly budget is stopped.
- **Why:** A real buy proves the app works. The two blocks prove it is safe.
  Judging is 40% app execution and 40% practical.
- **Who decided:** head (team lead)

## 2026-10-15: Where we talk and where we keep work

- **Decision:** Chat in Slack, code and context in this GitHub repo; the repo
  is public; pull requests open without a local validation pipeline, one
  teammate reviews before merge.
- **Why:** Agents read the repo, not the chat, so the repo must hold all
  context. No tech stack is chosen yet, so there are no automatic checks yet.
- **Who decided:** head (team lead)
