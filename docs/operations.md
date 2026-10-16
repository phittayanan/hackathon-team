# Operations

How the team runs, checks and deploys the demo. Judges never need this page.
Every command runs in `web/`. Every key is described in
[.env.example](../.env.example).

## The live agent

The agents are defined as code in `web/agent/` and sent to ElevenLabs by
`npm run agent:sync`. It creates or updates two agents in every account,
found by name:

| Agent name | What it is |
| --- | --- |
| `Q-Bot (U-Hackathon 2026)` | The live voice agent judges talk to, with its client tools and fact sheet (`web/agent/knowledge.md`) |
| `Agent OS page writer` | The text-only agent that writes generated pages |

The key needs the Agents permission (scope `convai_write`). Run a sync after
every change to `web/agent/prompt.md`, `web/agent/knowledge.md`, the tools in
`web/public/js/agent-tools.js` or `web/agent/config.js`. The `web_search` tool
is synced only when `TAVILY_API_KEY` is set.

```text
npm run agent:sync -- --dry-run   # show what would be sent
npm run agent:sync
```

### Try an agent change on a test agent first

Sync a test agent of your own (in the first account). It gets new tools too,
and its ids go to that file, never to `.env`. `ELEVENLABS_AGENT_ID` pins it
only with the single `ELEVENLABS_API_KEY`, not with `ELEVENLABS_API_KEYS`:

```text
npm run agent:sync -- --env ../.env.test-agent       # creates it the first time
ELEVENLABS_AGENT_ID=<id from .env.test-agent> PORT=5192 npm start
npm run smoke:live -- --base http://localhost:5192
```

### Manual smoke test

Playwright covers only the no-key path and a stubbed agent.

1. Run `npm start` and open http://localhost:5173 in Chrome.
2. Tap "สัปดาห์นี้ยุ่งมาก". `<body>` should show `data-brain="agent"`, the
   agent should answer in Thai, and the shopping list should open.
3. On the payment card, say "จ่ายเลย". It must not pay.
4. With `TAVILY_API_KEY` set (and `agent:sync` run after it), type
   "หางานวิ่ง 10K ในกรุงเทพเดือนหน้าให้หน่อย". A generated page should open
   with real races and a **Sources** list of `http(s)` links under it.
   `npm run smoke:live` checks the same.

The browser's own speech recognition (Thai) needs Chrome on `localhost` or
HTTPS.

To test the live agent end to end in Chrome, run
`npm run smoke:live -- --wav my-thai-request.wav`. The WAV is played as the
microphone.

## Voice lines

Every fixed line is pre-rendered to an MP3 in `web/public/voice/` with
ElevenLabs TTS. Run it once after a line changes, with `ELEVENLABS_API_KEY`
in `.env`:

```text
npm run voice              # only new or changed lines
npm run voice -- --force   # every line again
```

Voice order: saved MP3, then live ElevenLabs, then the browser's own voice.

## Deploy on Vercel

The app deploys as static files (`web/public/`) plus small functions
(`web/api/`). The always-on agent runs in the page, so no server process is
needed. One-time steps for the captain:

1. Log in: `npx vercel login`.
2. Link the project: `npx vercel link`. The project's root directory is
   `web`, where `vercel.json` is.
3. Set the env vars for Production. Each command asks for the value:

   ```text
   npx vercel env add ELEVENLABS_API_KEYS production
   npx vercel env add GOOGLE_MAPS_API_KEY production
   npx vercel env add TAVILY_API_KEY production
   ```

   Use the same values as in `.env`. For an exact daily limit across
   function instances, add a free Upstash Redis database from the Vercel
   Marketplace. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Change
   the limits with the `USAGE_*` variables in `.env.example`.
4. Deploy: `npx vercel --prod`.

### Add an ElevenLabs account

Each teammate's own account adds credit. To add one, put the key (it needs
the Agents permission) in the production list and redeploy:

```text
npx vercel env rm ELEVENLABS_API_KEYS production --yes
npx vercel env add ELEVENLABS_API_KEYS production   # paste every key, comma separated
npx vercel --prod
```

The production build runs `agent-sync --auto`: it finds both agents by name
in each account, creates each one if it is missing, and updates it otherwise.
Preview and local builds never sync. A failing account is a warning with its
key masked, never a failed deploy. A key that is out of credit or whose
workspace is blocked is skipped for the rest of the UTC day.

## Run log: find what to fix

Each local server run writes one file, `web/logs/run-<time>.jsonl`. It stays
local and is never committed, because it holds what testers said. On Vercel
the run log goes to the function log: Vercel dashboard > the project > Logs,
search for `[runlog]`.

Each line records one event with a millisecond time: what the user said,
typed or tapped; what the agent replied; every tool call; every voice start
and end, with its source; scenes opening and closing; live agent sessions
starting and ending (`live_start`, `live_end`: a new session has no memory of
the last conversation); layout checks that failed (`page_check`); lessons
(`lesson`: `asked` with the mistake signal, `noted` with the rule the agent
wrote); feed events; limit and offline switches; errors.

```text
npm run log:check                                   # the latest run
npm run log:check -- logs/run-2026-10-15T17-41-34-352Z.jsonl
```

It reports reply speed and flags two voices at once, replies slower than
3 s, a scene that opened before the agent spoke, a feed event pushed over
speech, self-hearing and errors. It also lists the lessons the agent wrote
after its own mistakes. Lessons stay on each phone (at most 5); a lesson
that shows up in many runs is a mistake every user hits, so move it into
`agent/prompt.md` or the code.

## Speed check

`npm run measure -- --base <url> --runs 3` measures first paint, time to
ready, first tap to the agent's voice and scene, and a warm reply. Each live
run uses one session of the daily limit; `--offline` measures only the page
load, and `--slow` simulates a phone on 4G.

## Presenter controls

They work only when the page is opened with `?presenter=1`, and keys work
only when you are not typing.

| Control | What it does |
| --- | --- |
| `/` | Focus the text box |
| Tap the clock 3 times | Feed panel: sleep synced, flight delayed, new email, reset |
| `Shift+T`, `Shift+F`, `Shift+R` | Feed events: sleep synced, flight delayed, reset |
| `s`, `p`, `t`, `f` | Last resort: open shopping, payment, training or flight |
| `m`, `n` | Open the memory page, the notification test |
| `h` | Go home |

For everyone: hold `Space` or the mic to talk, and `Esc` folds back home.

Other URL options:

| Option | What it does |
| --- | --- |
| `?script=off` | Stops the scripted feed events (the agent no longer speaks first on its own) |
| `?mute=1` | Silences the voice |
| `?forget=1` | Forgets memory, learned preferences and lessons |
