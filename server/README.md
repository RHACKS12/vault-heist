# @vault-heist/server

Node.js backend for Vault Heist: the event bus, the game state machine, and the
read-only firmware sandbox. Pure ESM JavaScript, no build step.

```bash
npm start        # http://localhost:3000  (WebSocket + /health)
npm run demo     # start + walk one scripted phase cycle
npm test         # node:test suite
PORT=4000 npm start
```

## Modules

| Module | Responsibility |
| --- | --- |
| `events.js` | Event vocabulary (`PHASES`, `SOURCES`, `EVENT_TYPES`, `AGENTS`) and `createEvent()`. |
| `bus.js` | `EventBus` — publish/subscribe + a ring buffer of recent events. The single source of truth. |
| `game.js` | `Game` — the phase state machine; every transition publishes a `phase_change`. |
| `sandbox.js` | `Sandbox` — the four read-only firmware tools, jailed to one rootfs. |
| `server.js` | `createServer()` — HTTP `/health`, command routes, WebSocket fan-out, and static hosting of the dashboard + player screen. |
| `betting.js` | `Betting` — the pari-mutuel pool (join, bet, odds, lock, settle). |
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

Host routes are gated by `HOST_TOKEN` when it is set in the environment.
Pari-mutuel: `odds(agent) = pot / stakeOn(agent)`; the winner's backers split the
whole pot in proportion to their stake; if nobody backed the winner (or no agent
cracked it), every bet is refunded.

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
| `agents/providers/{gemini,deepseek,haiku}.js` | Real provider adapters — **stubs** until Milestone 3b (they throw `NotWiredError`). |

### Provider interface

A provider is any object with `async step({ messages, tools }) -> step`, where a
step is `{ thought?, toolCalls?:[{id,name,args}], refused?:{reason} }`. The runner
owns a normalized message history (`system`/`user`/`assistant`/`tool`) that each
real adapter translates into its SDK's format. Swapping a mock for a real model
is a one-line change in the crew.

### Wiring a real provider (Milestone 3b)

1. `npm i @google/genai openai @anthropic-ai/sdk` (as needed).
2. Set the keys in `.env` (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`).
3. Implement `step()` in each `agents/providers/*.js` per the mapping documented in its header.

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
