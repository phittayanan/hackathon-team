# CryptoMate (dropped 2026-10-15)

CryptoMate was the team's first idea: "a friend that keeps your crypto money
easy and safe". On 2026-10-15 the team changed to the Agent OS demo
(see [decisions](../../decisions.md#2026-10-15-pivot-from-cryptomate-to-agent-os)).
Nothing here is used by the demo. It is kept for reference, in case the
real payment part is built after the hackathon.

What is in this folder:

| File | What it is |
| --- | --- |
| [price-test/](price-test/) | 50 items, Thai shops versus shops abroad (2026-10-15) |
| This page | The CryptoMate folder plan, Chrome setup and money rules, moved here from `AGENTS.md` |

The CryptoMate decisions (product, app flow, payment assistant, tech stack,
money story, demo story) stay in [decisions.md](../../decisions.md), marked
as superseded. The CryptoMate build parts are in the git history of
`docs/build-parts.md`.

## Planned folders (never created)

| Folder | What would live there | Owner |
| --- | --- | --- |
| `agent/` | Pi agent loop and its browser tools (open, read, click, type, wait), shopping run | B |
| `pay/rules/` | Rules check in plain code, with unit tests | B |
| `pay/approve/` | Payment request waiting for the owner's answer | A |
| `pay/utopia/` | Fixed U-topia script in the owner's logged-in window | head |
| `shared/` | Shared types, for example the payment request | B |

## Start the agent's Chrome

The agent uses its own Chrome profile. The owner logs in to shops and U-topia
in it by hand. The agent never sees a password.

1. Close any Chrome that uses this profile. Two programs cannot share one
   profile folder.
2. Start Chrome with a separate profile folder. Never use the default profile.

   ```text
   chrome --user-data-dir="$HOME/cryptomate-profile" --remote-debugging-port=9222
   ```

   Write `$HOME`, not `~`: most shells do not expand `~` after `=`.
   The Chrome program name differs by OS.
3. Log in by hand in that window.
4. The agent attaches with `chromium.connectOverCDP('http://localhost:9222')`.

## Money rules for a real payment

These were the hard rules for CryptoMate. If a real payment is ever built
behind Allow, they apply again, together with the rules in
[AGENTS.md](../../../AGENTS.md#money-safety).

- The U-topia script stops before the final confirm until the owner approves.
- One real stage buy only, small amount. Every other run stops before pay.
