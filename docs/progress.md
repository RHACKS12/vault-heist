# Dev log

Newest first. One entry per chunk of work: what shipped, decisions, what's next.
See `DESIGN.md` for the overall plan and `CONTRIBUTING.md` for the workflow.

---

## 2026-10-04 — Milestone 3b: real provider adapters + OpenAI swaps in for DeepSeek

**Shipped** (feature branch `milestone-3b-real-providers` → merged to `main`):

- **Real SDK adapters** for all three crew members — each `provider.step()` is a
  single API call that translates the runner's normalized history + tool schemas
  into the SDK's shape and back to `{ thought, toolCalls, usage, refused? }`:
  - `providers/openai-compatible.js` — shared Chat Completions core.
  - `providers/openai.js` (`gpt-4o-mini`), `providers/gemini.js`
    (`@google/genai`, `gemini-3.8-flash`), `providers/haiku.js`
    (`@anthropic-ai/sdk`, `claude-haiku-4-5`, with tool-result coalescing).
  - Every adapter reports token `usage`, so the **$2 per-race cost cap** meters
    real spend. Factories take an injectable `client` → unit-tested with fakes,
    no network or keys (`test/providers.test.js`, `test/crew.test.js`).
- **OpenAI replaced DeepSeek** (couldn't make a DeepSeek account; `gpt-4o-mini`
  is also cheaper — ~$0.05–0.07/race). Full rename of the agent id
  `deepseek`→`openai` across the server, web, announcer catalog + clips, the
  betting roster, tests, and the committed `demo-clean.jsonl` (regenerated,
  winner `openai`). The `openai-compatible` core still supports DeepSeek via a
  baseURL if a key ever appears.
- **Live vs. mock wiring.** Host lock (`/api/host/lock`) now runs the *real* crew:
  each agent with a key set runs its model; agents without a key fall back to a
  mock wanderer so the roster stays complete. The "Run demo race" button and
  replays stay fully mock and keyless (bulletproof demo unchanged). Startup logs
  which agents are live. Deleted the `NotWiredError` stubs.
- `.env.example` / README / server README / DESIGN updated; `OPENAI_API_KEY`
  replaces `DEEPSEEK_API_KEY`.

**Total tests: 85 green** (73 server + 12 web).

---

## 2026-10-04 — Announcer voices live + full documentation

- **ElevenLabs voices generated and committed** — all 17 catalog lines were
  synthesized (voice `YOq2y2Up4RgXP2HyXjE5`, ~900 chars one-time) and committed
  under `web/announcer/` with `manifest.json`. The server loads them at startup
  (`announcer: 17 pre-generated clips loaded`) and plays them with zero runtime
  TTS cost; browser speech remains the fallback when clips are absent.
- **Fixes along the way:** `.env` is now auto-loaded for the server and scripts
  (`src/env.js`, Node ≥ 20.12) — Node doesn't read `.env` on its own; and the
  static server now serves `.mp3` as `audio/mpeg` (was `application/octet-stream`),
  so clips play reliably.
- **Catalog expanded to 17 fun lines** — new round, bets open, bets locked, and
  they're off, time's up, plus punchier per-agent milestone calls.
- **Full documentation pass:** rewrote `README.md` as a complete step-by-step
  guide (setup → run → multi-device demo → replay → announcer → testing →
  troubleshooting) and added `docs/RUNBOOK.md` (demo-day run-of-show).

**Total tests: 70 green** (58 server + 12 web).

---

## 2026-10-04 — Milestone 6: announcer (scaffolded, mock-first)

> ⚠️ **Real voices need `ELEVENLABS_API_KEY`** (Milestone 6b). The announcer
> already works without it via the browser's built-in speech. See `.env.example`.

**Shipped** (feature branch `claude/sharp-galileo-r5rmuk` → merged to `main`):

- **`announcer/lines.js`** — pure event→line mapping with the heist-crew persona.
  Only milestones/phases get a line (found a directory, opened the file,
  submitted, won, and the fixed "place your bets / and they're off / nobody
  cracked it" calls); tool noise is silent. Priorities: win 3, submit/phase 2,
  progress 1.
- **`announcer/announcer.js`** — subscribes to the bus, synthesizes audio via a
  TTS provider (caches fixed lines), and emits `announce` events. Never announces
  its own events (no loop).
- **Predefined catalog + pre-generation (cost control).** `announcer/catalog.js`
  is the finite set of all 15 lines, each with a stable key; `lines.js` maps an
  event to a key. `npm run generate:announcer` synthesizes every line **once** via
  ElevenLabs into `web/announcer/` + a `manifest.json` (key → url). The server
  loads the manifest and plays the clips — **zero per-event TTS cost** at show
  time. With no manifest, clips are null and the dashboard falls back to the
  browser's speech (audible with no key). `providers/elevenlabs.js` is the REST
  client the generator uses; there is no runtime TTS call.
- **Dashboard** — a **🔊 ANNOUNCER** on/off toggle (audio needs a user gesture),
  a priority playback queue (wins jump ahead, stale low-priority dropped), and a
  live `📣` caption under the verdict.
- **Design decision — narration is derived.** The announcer regenerates lines
  from the event stream, so it narrates **replays** too; recordings therefore
  exclude `announce` events (recorder filters `source === 'announcer'`), and the
  existing `demo-clean.jsonl` needed no change. Verified: replaying it produced
  the full call ("And they're off!" → "DeepSeek just broke into the etc vault!" →
  "We have a winner!") with captions. See `docs/announcer.png`.
- **7 new tests** (lines + pipeline + replay narration + no-loop).

**Total tests: 69 green** (57 server + 12 web).

**Next — the last key-dependent pieces:** Milestone 3b (real agent models) and
Milestone 6b (ElevenLabs voices). Everything else — the full interactive,
bulletproof, narrated demo — runs today with no keys.

---

## 2026-10-04 — Milestone 7: record & replay (bulletproof demo path)

**Shipped** (feature branch `claude/sharp-galileo-r5rmuk` → merged to `main`):

- **`server/src/recorder.js`** — `Recorder` taps the bus and captures a run to a
  `.jsonl` (one event per line). **3 tests.**
- **`server/src/replayer.js`** — `Replayer` re-emits a recording onto the same
  bus, pacing fast mock recordings to a watchable cadence (clamped gaps) and
  prepending a lobby reset so client reducers start clean. Replayed events carry
  `replay:true`. Plus `listRecordings()`. **6 tests.**
- **Command API**: `GET /api/recordings`, `POST /api/record/start|stop`,
  `POST /api/replay`, `POST /api/replay/stop` (host-gated). Host/demo actions are
  blocked while a replay runs, and vice-versa.
- **Dashboard**: a **● REC** toggle and a **▶ REPLAY** button in the host strip.
- **`recordings/demo-clean.jsonl`** — a committed 38-event clean run
  (lobby → bets → race → settle, winner DeepSeek), generated by
  `npm run record:demo` (`server/scripts/record-demo.mjs`).
- **Verified in a real browser**: on a fresh dashboard, clicking REPLAY streamed
  the recording through RACING to the cracked vault with the correct verdict —
  visually identical to a live run. See `docs/replay.png`.

**Total tests: 62 green** (50 server + 12 web).

**Why this matters:** the pitch runs on REPLAY, so a model refusal or dead venue
WiFi can't break the demo — it's the same code path as live, just fed from disk.

**Decisions:**

- **Replay re-streams to clients, doesn't re-drive the server game object.** The
  frontend renders from the event stream, so a visual re-stream is all the demo
  needs; keeps replay simple and side-effect-free on live state.
- **Min-gap pacing.** Mock recordings have ~0ms gaps; a 120ms floor makes replay
  watchable without needing artificial sleeps baked into the recording.

**Next:** Milestone 3b (real providers — needs keys) and Milestone 6 (ElevenLabs
announcer — needs `ELEVENLABS_API_KEY`) are the only remaining pieces; both are
the key-dependent ones.

---

## 2026-10-03 — Milestone 5: multi-device lobby + pari-mutuel betting

> ⚠️ **API keys still needed** for the real models (Milestone 3b):
> `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`. The betting lobby and
> the race run on mocks without them. See `.env.example`.

**Shipped** (feature branch `claude/sharp-galileo-r5rmuk` → merged to `main`):

- **`server/src/betting.js`** — the pari-mutuel pool. Players join (500 starting
  chips), place ONE bet per round, odds are `pot / stakeOn(agent)`, the winner's
  backers split the whole pot in proportion to their stake, and if nobody backed
  the winner (or no agent cracked it) every bet is refunded. **8 tests.**
- **Command API** (generalized routing in `server.js`, handlers in `index.js`):
  `GET /api/state`, `POST /api/join`, `POST /api/bet`, and host routes
  `/api/host/open|lock|reset` (gated by `HOST_TOKEN` when set). `host/lock` locks
  betting, runs the race, and settles the pot.
- **Player screen** (`web/play.html` + `web/play.js`) — join on a phone, pick a
  safecracker, place chips, watch, and see your payout. Per-device identity in
  `localStorage`; balance credited once on settle (guarded against backlog
  replay).
- **Dashboard** now shows live odds per agent, bets/chips per agent, the pot, the
  lobby size, host controls (open / lock & start / new round), and the payout
  line on a win. The reducer gained betting state (**4 new tests**).
- The pre-race lobby flow matches the plan: players bet → host locks → race.
  The flow was verified over HTTP (live odds, double-bet rejection, correct
  payout) and in a real browser (dashboard lobby + player screen screenshots:
  `docs/dashboard-lobby.png`, `docs/player.png`).

**Total tests: 53 green** (41 server + 12 web).

**Decisions:**

- **HTTP commands + WebSocket fan-out.** Clients POST actions; every client
  (including the sender) sees the result via the one event stream — no second
  realtime channel. Consistent with the existing pattern.
- **Starting chips = 500** so bets have room (and the demo's 300-chip pot works).
- **Host-controlled lock** (a button), per the earlier design discussion — more
  robust than auto-detecting "everyone has bet" when players keep joining.

**Next:** Milestone 3b (real providers — needs keys), Milestone 6 (ElevenLabs
announcer), or Milestone 7 (record & replay).

---

## 2026-10-03 — Milestone 4: observer dashboard

> ⚠️ **API keys still needed.** The dashboard runs entirely on the mock race, so
> it needs no keys. But the race is still driven by **mock** providers — running
> the REAL models (Milestone 3b) requires `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`,
> and optionally `ANTHROPIC_API_KEY`. See `.env.example`.

**Shipped** (feature branch `claude/sharp-galileo-r5rmuk` → merged to `main`):

- **`web/` workspace** — the observer screen, pure static HTML/CSS/ESM, no build
  step, served by the Node server. Case-file noir skin (kraft/manila + red +
  black, CONFIDENTIAL stamp, monospace, "CASE FILE No. XII"); on-screen renames
  (vault → the mark, win → cracked, pool → the pot).
- **`web/reducer.js`** — a *pure* render-state reducer (no DOM) that folds the
  event stream into dashboard state. **8 unit tests** cover it.
- **`web/app.js`** — DOM wiring: WebSocket (auto-reconnect) → reducer → render.
  Three reasoning panels, discrete milestone bars (exploring → found dir →
  opened file → submitted), the central vault visual with a crack animation on a
  win, the pot, and a "Run demo race" button.
- **Server static hosting + demo trigger** (`server.js`) — serves `web/` and
  exposes `POST /api/demo/race`, which runs a mock race over the live bus/game so
  the whole thing is watchable in a browser with no keys.
- **Verified in a real browser** (headless Chromium): clicked "Run demo race",
  watched phases → concurrent agents → milestones → `won` → `SETTLED`; the
  dashboard rendered the cracked vault and DeepSeek's `/etc/shadow` finding. See
  `docs/dashboard.png`.

**Total tests: 42 green** (34 server + 8 web).

**Decisions:**

- **Vanilla static frontend, not React/Vite.** Consistent with the zero-build
  server; served directly by Node; immediately runnable. State logic is isolated
  in a pure, tested reducer, so swapping in a framework later (if wanted) is low
  risk.
- **Betting UI is a placeholder** (the pot shows, labelled "live betting lands in
  Milestone 5") — the dashboard already handles `bet_placed`/`odds_update` events
  defensively.

**Next:** Milestone 3b (wire real providers — needs keys) and/or Milestone 5
(multi-device lobby + pari-mutuel betting, which the dashboard is already stubbed
for).

---

## 2026-10-03 — Milestone 3: agent loop + judge + race (mock-tested)

**Shipped** (feature branch `claude/sharp-galileo-r5rmuk` → merged to `main`):

- **AgentSession** (`agents/session.js`) — one per crew member, wrapping the
  shared read-only sandbox. Enforces a per-agent step budget and emits the
  `exploring` → `found_dir` → `opened_file` milestones (monotonic, fire-once) by
  watching which paths each agent touches vs. the round's target.
- **AgentRunner** (`agents/runner.js`) — provider-agnostic tool-use loop over a
  normalized message history. Emits reasoning + `submitted`; a refusal, a wrong
  answer, budget exhaustion, or another agent winning all end cleanly.
- **Judge** (`agents/judge.js`) — a submission is correct iff it names an
  accepted file (path or basename) or a specific string (hash/user/port/sink);
  generic keywords alone don't win.
- **Race** (`agents/race.js`) — runs the crew concurrently; the first correct
  submission sets the winner, emits `won`, and settles the game. Refusals/no-win
  handled.
- **Tools / prompts / answer / crew** — the 5 tool schemas, the authorized
  identification-only prompts, answer-key loading, and the 3-member roster.
- **Mock providers** (`agents/providers/mock.js`) — solver / wanderer / refuser /
  second-guess, so the whole pipeline runs and is tested with no API keys.
- **Real provider stubs** (`gemini.js` / `deepseek.js` / `haiku.js`) — interface
  in place, each documents its SDK mapping, throws `NotWiredError` until 3b.
- **18 new tests** (34 total, all green): judge per round, session milestones +
  budget, runner (solve / refuse / stop), and the full race (solver beats
  wanderers, refuser handled, no-winner case, single-winner guarantee).
- **`npm run race`** drives a full mock race over the real rootfs; verified the
  event stream end-to-end (phases → concurrent agents → milestones → `won` →
  `SETTLED`, winner `deepseek`).

**Decisions:**

- **Mock-first.** The pipeline is fully exercised offline; real SDK adapters are
  isolated behind the provider interface so wiring them can't destabilize the
  tested core.
- **One shared sandbox, per-agent sessions** (as discussed) — the rootfs is
  read-only so no copies; isolation of *behavior* (attribution, milestones,
  budget) lives in `AgentSession`.
- **`submit` is a tool.** Its result tells the model whether it won, so a wrong
  guess just continues the loop — no separate submission channel.

**Next — Milestone 3b:** implement the three real provider adapters against their
SDKs (read the claude-api skill before the Haiku one), add keys to `.env`, and
swap them into the crew in place of the mocks. Then Milestone 4 (observer
dashboard) can consume the already-working event stream.

---

## 2026-10-03 — Milestones 1 & 2: event bus + state machine + firmware sandbox

**Shipped** (feature branch `claude/sharp-galileo-r5rmuk` → merged to `main`):

- `server/` npm workspace, pure ESM JavaScript, no build step.
- **Event bus** (`bus.js`) — publish/subscribe + a 1000-event ring buffer so
  late-joining clients can be seeded with recent state.
- **Event vocabulary** (`events.js`) — `PHASES`, `SOURCES`, `EVENT_TYPES`,
  `AGENTS`, and `createEvent()` (monotonic `seq` + `ts`).
- **Game state machine** (`game.js`) — strict
  `LOBBY → BETTING_OPEN → BETS_LOCKED → RACING → SETTLED → (reset) → LOBBY`;
  every transition is validated and published as a `phase_change`.
- **Firmware sandbox** (`sandbox.js`) — the four read-only tools
  (`listDir`, `readFile`, `grep`, `strings`) over the committed IoTGoat rootfs,
  jailed with chroot-like path resolution (`..` clamped at `/`, symlinks
  followed but re-rooted so nothing escapes).
- **HTTP + WebSocket server** (`server.js`) — `/health` + fan-out of the event
  stream; new clients get a `hello` seed then live frames.
- **16 tests** (`node:test`), all green: bus ring buffer, state-machine
  transitions (incl. illegal-move rejection), sandbox against the real rootfs
  (reads `/etc/shadow`, greps `iotgoatuser`, `strings` the backdoor binary,
  path-traversal clamp, symlink resolution, error codes), and live WebSocket
  fan-out end-to-end. Server boots and `/health` reports the real rootfs.

**Decisions:**

- **Plain ESM JavaScript, not TypeScript.** Zero build step = faster hackathon
  iteration and immediately runnable/testable; strong JSDoc gives most of the
  safety. Easy to adopt TS later if desired. (DESIGN.md's `.ts` filenames were
  illustrative.)
- **Sandbox is chroot-like, not a real chroot.** Pure-JS path re-rooting keeps
  it portable and dependency-free, and handles the busybox symlink farm
  correctly (absolute link targets resolve inside the rootfs).
- **`main` is the trunk**; features branch off and merge back (see
  CONTRIBUTING.md). `main` created at the Phase 0 commit. Note: the GitHub
  *default branch* setting still needs flipping to `main` in repo Settings.

**Next — Milestone 3:** agent runners (Gemini Flash, DeepSeek, optional Haiku)
as async tool-use loops over the sandbox, plus the judge that checks a
submission against `targets/iotgoat/answer.json` and declares the winner.

---

## 2026-10-03 — Phase 0: firmware target extracted + answer key verified

**Shipped:**

- Picked **OWASP IoTGoat** as the guaranteed-clean target.
- Downloaded `IoTGoat-x86.img.gz` (OpenWrt 18.06.2), carved the SquashFS rootfs
  from partition 2 (offset `17301504`), committed it at `targets/iotgoat/rootfs/`
  (~13 MB, 1031 files). Removed the one device node git can't track.
- `targets/iotgoat/answer.json` — three rounds, all verified against both the
  extracted rootfs and the IoTGoat source tree:
  - **hardcoded-credentials** (default): `/etc/shadow`, `iotgoatuser`
    `$1$79bz0K8z$…` (password `7ujMko0vizxv`).
  - **shellback-backdoor**: `/usr/bin/shellback`, bind shell on TCP 5515.
  - **command-injection**: luci `webcmd()` → `io.popen`, `/admin/iotgoat/webcmd`.
- `targets/iotgoat/extract.sh` reproduces the rootfs (auto-detects the squashfs
  offset if a future release moves it).

**Note:** general internet egress is blocked in the cloud environment, but
GitHub *release-asset* downloads go through, which is how the image was fetched.
