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
| `server.js` | `createServer()` — HTTP `/health` + WebSocket fan-out of the event stream. |
| `index.js` | Wires it together and starts listening. |
| `config.js` | Paths (`DEFAULT_ROOTFS`) and `PORT`. |

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
