# Idea

> **Being replanned (2026-10-16).** The pain point and the demo are being
> replanned for the demo video. Until then this page is the plan of
> 2026-10-15. What is built now: [build-parts.md](build-parts.md).

**Agent OS** - you talk to an agent, and it answers with real UI instead of
text, on one screen, never switching apps.
Each decision is also written in [decisions.md](decisions.md).

This replaces the first idea, CryptoMate (a friend that keeps your crypto
money easy and safe), on 2026-10-15. CryptoMate's money rules live on in the
payment scene: rules checked in code, and only the owner's tap pays.

## Problem

Today an assistant answers in text, and you still open five apps to act on
it. Each app has its own screens, logins and steps.

## Users

- Busy people who want tasks done, not more apps: shopping, travel changes,
  sign-ups.
- Later: anyone who wants one agent home instead of a phone full of apps.

## What the demo shows

About 3 minutes on stage. Storyboard:
[agent-os-storyboard.md](agent-os-storyboard.md).

1. Agent home: a mascot, a voice waveform, one fading subtitle line, a
   hold-to-talk mic with a text box next to it. No chat history.
2. "This week is hectic": the agent reads a fake email and builds a shopping
   list item by item.
3. The list becomes a payment card. Money moves only on a tap of Allow.
4. The agent speaks first about sleep and a 10K race, and signs you up.
5. The agent speaks first about a delayed flight, and re-books on "yes".
6. A task it does not know ("help me make a todo list"): it draws a new page,
   asks if you like it, and changes it as you answer. A page you like can be
   kept and opens at once next time.

Every task grows out of the home and folds back to it. That is the OS.

## What we will not build

- Real payments. Allow ends in a success screen only.
- Driving outside websites. Every form is filled inside our own UI.
- LINE.
- Accounts or server storage. Kept pages live in the browser.

## Open questions

- Thai voice: no Thai-only voice in the ElevenLabs account yet. The premade
  "Jessica" voice speaks Thai with `eleven_v4`.
- Phone on stage: the microphone needs HTTPS when the page is not on
  `localhost`.
- The live ElevenLabs agent is tested with a stubbed SDK only, until the key
  has the Agents permission.
