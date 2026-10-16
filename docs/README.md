# Docs map

Which file answers which question. If a doc and the code disagree, the code
is right and the doc is a bug: fix it in your pull request.

## Start here

| Question | File |
| --- | --- |
| How do I try or run the app? How does it work? | [README.md](../README.md) |
| What are the rules for people and agents in this repo? | [AGENTS.md](../AGENTS.md) |
| How does the team work (Slack, issues, pull requests, roles)? | [workflow.md](workflow.md) |

## The product

| Question | File |
| --- | --- |
| What problem, for whom, what the demo shows (being replanned) | [idea.md](idea.md) |
| The stage storyboard of 2026-10-15 (being replanned) | [agent-os-storyboard.md](agent-os-storyboard.md) |
| What did we decide, and why? | [decisions.md](decisions.md) |
| What is built, where, and in which pull request? | [build-parts.md](build-parts.md) |
| Colors, type, spacing and components of the Q-Bot UI | [qbot-design-system.md](qbot-design-system.md) |

## Running the demo

| Question | File |
| --- | --- |
| Deploy, agent sync, voice lines, run log, presenter controls | [operations.md](operations.md) |
| Every key, what it does, and what happens without it | [.env.example](../.env.example) |
| What the live agent is told | [web/agent/prompt.md](../web/agent/prompt.md), [web/agent/knowledge.md](../web/agent/knowledge.md) |

## Feature notes

These sit next to the code they describe.

| Feature | File |
| --- | --- |
| Nearby places (Google Maps): flow, privacy, cost, attribution | [web/PLACES.md](../web/PLACES.md) |
| Secretary demo: today, email to tasks, notifications | [web/SECRETARY-DEMO.md](../web/SECRETARY-DEMO.md) |
| Shopify product discovery | [web/SHOPIFY-CATALOG.md](../web/SHOPIFY-CATALOG.md) |

## Research

Each file is a snapshot of its date. It is not updated when the code changes.

| File | What it is |
| --- | --- |
| [research/agent-architecture-review.md](research/agent-architecture-review.md) | Q-Bot agent architecture review (2026-10-16, at `31c0cfd`) |
| [research/agent-blind-spot-audit.md](research/agent-blind-spot-audit.md) | What the user can see that the agent cannot (2026-10-16) |

## Other folders

| Folder | What it is |
| --- | --- |
| [pr/](pr/) | Pull request bodies and before/after screenshots. Pull request descriptions may link to them by path, so do not move them |
| [archive/cryptomate/](archive/cryptomate/README.md) | The dropped first idea: folder plan, Chrome setup, money rules, price test |
