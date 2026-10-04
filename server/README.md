# @vault-heist/server

Node.js backend for Vault Heist: the event bus, the game state machine, and the
read-only firmware sandbox. Pure ESM JavaScript, no build step.

```bash
npm start        # http://localhost:3000  (dashboard + /play.html + WebSocket + /health)
npm run demo     # start + walk one scripted phase cycle
npm run race     # start + a full auto demo (bots bet, then race)
npm test         # node:test suite
PORT=4000 npm start
```

Keys (ElevenLabs for generation, and later the agent models) are read from a
`.env` at the repo root or `server/`, loaded automatically via `src/env.js`
(Node ≥ 20.12). Inline env vars take precedence. The static server serves the
dashboard, the player screen, and the announcer `.mp3` clips.

## Modules

| Module | Responsibility |
| --- | --- |
| `events.js` | Event vocabulary (`PHASES`, `SOURCES`, `EVENT_TYPES`, `AGENTS`) and `createEvent()`. |
| `bus.js` | `EventBus` — publish/subscribe + a ring buffer of recent events. The single source of truth. |
| `game.js` | `Game` — the phase state machine; every transition publishes a `phase_change`. |
| `sandbox.js` | `Sandbox` — the four read-only firmware tools, jailed to one rootfs. |
| `server.js` | `createServer()` — HTTP `/health`, command routes, WebSocket fan-out, and static hosting of the dashboard + player screen. |
| `betting.js` | `Betting` — the pari-mutuel pool (join, bet, odds, lock, settle). |
| `recorder.js` | `Recorder` — capture the event stream to a `.jsonl` (excludes derived `announce` events). |
| `replayer.js` | `Replayer` — re-emit a recording onto the bus at a watchable cadence. |
| `announcer/` | The announcer — predefined catalog, event→key, `announce` events. |
| `index.js` | Wires it together, exposes the command API, and starts listening. |
| `config.js` | Paths (`DEFAULT_ROOTFS`, `WEB_ROOT`) and `PORT`. |
| `agents/` | The crew — see below. |

## Command API (Milestone 5)

The lobby is driven over HTTP; live state fans out over the WebSocket.

| Route | Body | Purpose |
| --- | --- | --- |
| `GET /api/state` | — | current phase, round, pot, odds, totals, counts, players |
| `POST /api/join` | `{name}` | join the lobby → `{playerId, balance}` (500 starting chips) |
| `POST /api/bet` | `{playerId, agent, amount}` | place one bet (only while `BETTING_OPEN`) |
| `POST /api/host/open` | `{token?}` | open betting (`LOBBY`/`SETTLED` → `BETTING_OPEN`) |
| `POST /api/host/lock` | `{token?}` | lock bets, run the race, settle the pot |
| `POST /api/host/reset` | `{token?}` | `SETTLED` → `LOBBY` for a new round |
| `POST /api/demo/race` | — | full auto demo: bots join + bet, then lock + race |
| `GET /api/recordings` | — | list recorded runs in `recordings/` |
| `POST /api/record/start` | `{label?, token?}` | start capturing the event stream |
| `POST /api/record/stop` | `{token?}` | stop + save to `recordings/<label>-<ts>.jsonl` |
| `POST /api/replay` | `{name?, speed?, token?}` | replay a recording (default `demo-clean.jsonl`) onto the bus |
| `POST /api/replay/stop` | `{token?}` | stop the current replay |

Host routes are gated by `HOST_TOKEN` when it is set in the environment.
Pari-mutuel: `odds(agent) = pot / stakeOn(agent)`; the winner's backers split the
whole pot in proportion to their stake; if nobody backed the winner (or no agent
cracked it), every bet is refunded.

## Record & replay (Milestone 7)

Because every frontend is driven solely by the bus, a recorded run replays
identically — the bulletproof demo path. Record a clean run with
`npm run record:demo` (writes `recordings/demo-clean.jsonl`, committed), then on
stage the host hits **REPLAY** (or `POST /api/replay`) and the dashboard streams
it with no models and no network. Replay paces fast recordings out to a watchable
cadence and prepends a lobby reset so clients start clean.

## Agents (the crew)

The race pipeline, built mock-first so it runs with no API keys:

| Module | Responsibility |
| --- | --- |
| `agents/tools.js` | The 5 tool definitions (JSON Schema): `list_dir`, `read_file`, `grep`, `strings`, `submit`. |
| `agents/session.js` | `AgentSession` — one per agent; wraps the shared sandbox, enforces a step budget, emits `exploring`/`found_dir`/`opened_file` milestones. |
| `agents/runner.js` | `AgentRunner` — the provider-agnostic tool-use loop; emits reasoning + `submitted`. |
| `agents/judge.js` | `judge(submission, round)` — correct iff it names an accepted file or specific string. |
| `agents/race.js` | `Race` — runs the crew concurrently; first correct submission wins, emits `won`, settles the game. |
| `agents/answer.js` | Loads `targets/<t>/answer.json` and resolves the active round. |
| `agents/prompts.js` | System prompt (authorized, identification-only) + per-strategy task prompt. |
| `agents/crew.js` | The 3-member roster (family, strategy, model id, env var). |
| `agents/providers/mock.js` | Deterministic mock providers (solver / wanderer / refuser) for offline tests + `npm run race`. |
| `agents/providers/{gemini,openai,haiku}.js` | Real provider adapters (Gemini / OpenAI / Anthropic SDKs). `openai-compatible.js` is the shared Chat Completions core. |
| `agents/pricing.js` · `agents/cost.js` | Per-model pricing + the shared per-race cost cap ($2 default, `RACE_COST_CAP_USD`). |

### Provider interface

A provider is any object with `async step({ messages, tools }) -> step`, where a
step is `{ thought?, toolCalls?:[{id,name,args}], refused?:{reason}, usage?:{inputTokens,outputTokens} }`.
The runner owns a normalized message history (`system`/`user`/`assistant`/`tool`)
that each real adapter translates into its SDK's format. Each factory takes an
injectable `client`, so the adapters are unit-tested without network or keys
(`test/providers.test.js`).

### Running real models (Milestone 3b — done)

1. SDKs are already installed (`@google/genai`, `openai`, `@anthropic-ai/sdk`).
2. Set the keys in `.env` (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
3. Lock betting as host (`POST /api/host/lock`) to run the real crew; each agent
   with a key runs its model (`gpt-4o-mini`, `gemini-2.5-flash`, `claude-haiku-4-5`),
   others fall back to a mock. Every step's token usage is billed against the
   shared `$2` cost cap, which stops the race if spend crosses it.

## Event shape

Every event on the bus (and every WebSocket frame, except the initial `hello`):

```js
{ seq, round, ts, source, type, agent, payload }
```

`seq` is a monotonic counter for ordering/replay; `source` is one of `SOURCES`;
`type` is one of `EVENT_TYPES`; `agent` is a crew member or `null`.

A new WebSocket client first receives `{ type: 'hello', phase, round, recent[] }`
(the last 50 events) so it renders current state immediately, then a live frame
per published event.

## Sandbox tools

Construct with the rootfs path, then call the four tools. Every path is treated
as absolute within the rootfs; `..` is clamped at `/` and symlinks are followed
but re-rooted, so nothing can escape the jail.

```js
import { Sandbox } from './src/sandbox.js';
import { DEFAULT_ROOTFS } from './src/config.js';
const sb = new Sandbox(DEFAULT_ROOTFS);

await sb.listDir('/etc');                      // { path, entries:[{name,type,path,target?}] }
await sb.readFile('/etc/shadow');              // { path, size, binary, truncated, content|preview }
await sb.grep('iotgoatuser', { path:'/etc' }); // { pattern, hits:[{file,line,text}], filesScanned, truncated }
await sb.strings('/usr/bin/shellback');        // { path, min, lines:[...], truncated }
```

- **`readFile`** is byte-capped (`maxBytes`, default 8 KB); binary files return a
  hex/ascii `preview` instead of `content`.
- **`grep`** recurses from a dir (or scans one file), skips symlinks during the
  walk, and is bounded by `maxHits` / `maxFiles` / `maxFileBytes`.
- **`strings`** extracts printable ASCII runs ≥ `min`, capped at `maxLines`.
- Errors are `SandboxError` with a `.code` (`ENOENT`, `EISDIR`, `ENOTDIR`,
  `ELOOP`, `EREGEX`).

These are the exact tools the agents (Milestone 3) will be given — not a shell.

## Announcer (Milestone 6)

The announcer is a **derived presentation layer**. `announcer/catalog.js` is the
predefined set of every line — 5 phase/game calls + 4 milestones × 3 agents = 17,
each with a stable `key`. `announcer/lines.js` maps a milestone/phase event to a
catalog key (only `found_dir`, `opened_file`, `submitted`, `won`, and the fixed
"place your bets / and they're off / nobody cracked it" calls — tool noise is
silent). `announcer/announcer.js` subscribes to the bus and emits `announce`
events, attaching a **pre-generated clip** for the key when one exists; the
dashboard plays them with a **priority queue** (wins/submissions jump ahead) and
a live caption. Because it regenerates from the stream, it narrates **replays**
too — which is why recordings exclude `announce` events.

### Pre-generate the audio (keeps cost down)

The line set is finite, so every clip is generated **once** and served as a
static file — **zero per-event TTS cost** on stage:

```bash
ELEVENLABS_API_KEY=... [ELEVENLABS_VOICE_ID=...] npm run generate:announcer
```

Keys can also go in a `.env` file at the repo root (or `server/`) — it's loaded
automatically (Node ≥ 20.12). Add `--dry-run` to preview the plan + credit
balance without synthesizing. The generator refuses to run if the balance is too
low, so it can't overrun your credits.

This writes one MP3 per catalog entry to `web/announcer/` plus `manifest.json`
(key → url); commit `web/announcer/` so the demo has audio offline. The server
loads the manifest at startup and plays the clips — it never calls ElevenLabs at
runtime. With no manifest, clips are null and the dashboard falls back to the
browser's built-in speech (audible with no key). Run the generator on a machine
with network access — the cloud sandbox blocks general egress.
`providers/elevenlabs.js` is the REST client the generator uses.
