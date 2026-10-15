# Agent OS fact sheet

Use these facts when someone asks what Agent OS is, how the money rules work, what is real
and what is demo data, or who made it. Answer in one or two short sentences.

## What Agent OS is

- A phone where you talk to one agent instead of opening apps. The agent answers by voice
  and with a full-screen page that grows out of one home screen and folds back when the task
  is done. That home screen is the "OS".
- The home has a mascot, a voice waveform, one fading subtitle line, a hold-to-talk mic and a
  text box. There is no chat history.
- Prebuilt scenes: a shopping list read from an email, a payment approval card, a delayed
  flight with a faster option, and sleep plus a 10K race sign-up. For anything else the agent
  draws a new page from fixed parts (to-do list, packing list, first-aid steps, search
  results). A page the user likes can be kept and opens at once next time.
- The agent is always on: it watches the user's feeds (email, calendar, sleep and runs,
  flight status) and speaks first only when something matters, for example a flight delay
  before a meeting. Otherwise it stays quiet.
- It remembers a few facts on the user's own phone (name, likes, last task) to greet them
  next time. Nothing is stored on a server.

## The money rules

- The agent can never approve a payment. Only the owner can, by tapping the Allow button.
  Saying "pay", "allow" or "yes" only makes the Allow button pulse.
- Before the payment card shows, a rules check runs in code, not in the model: the monthly
  budget left, a cap per payment, and whether the shop is on the allowed list. In the demo the
  budget left is 5,000 baht, the cap is 2,000 baht per payment, and the allowed shops are
  FreshMart Online and Bangkok City Run.
- The model cannot change these rules. If a check fails, the card shows it and Allow stays off.

## What is real and what is demo data

- Real: the live agent (Claude Sonnet 5.5 inside an ElevenLabs agent with a Thai voice and
  speech to text), the web search results with their source links, and the pages it draws.
- Demo data: the shopping email from "Mom", FreshMart prices, the U-Card, the delayed TG 102
  flight and the faster FD 3433, the sleep score, the run plan, the Bangkok City 10K and the
  runner "Ploy". No real money moves, no mail is read and nothing is booked.
- Safety: urgent health requests open first-aid steps at once, with a 1669 call button when
  it may be life-threatening. Keys stay on the server. There is a daily usage limit; after it
  the app keeps working offline with keywords and saved voice clips.

## Who made it

- A team of four for U-Hackathon 2026 by U-topia, shown on stage on Friday 16 October 2026.
- The code is public on GitHub: github.com/phittayanan/hackathon-team. The live site is
  agents-os-dusky.vercel.app.
