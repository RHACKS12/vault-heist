// Entry point: wire bus, game, sandbox, and betting together, expose the command
// API, serve the dashboard + player screen, and start the server.
//
//   npm start            -> server + dashboard (/) + player screen (/play.html)
//   npm run demo         -> a scripted phase cycle
//   npm run race         -> a full auto demo: bots join, bet, lock, and race
//
// Hosted flow (multi-device):
//   players  -> POST /api/join, POST /api/bet
//   host     -> POST /api/host/open, /api/host/lock (runs the race), /api/host/reset
// Real agent models arrive in Milestone 3b (keys in .env); today the race runs
// on mock providers.
import './env.js'; // load .env (repo root or server/) before anything reads process.env
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { EventBus } from './bus.js';
import { Game } from './game.js';
import { Sandbox } from './sandbox.js';
import { Betting } from './betting.js';
import { Recorder } from './recorder.js';
import { Replayer, listRecordings } from './replayer.js';
import { Announcer } from './announcer/announcer.js';
import { createServer } from './server.js';
import { joinUrls } from './lan.js';
import { DEFAULT_ROOTFS, WEB_ROOT, RECORDINGS_DIR, PORT, RACE_COST_CAP_USD, RACE_COOLDOWN_MS } from './config.js';
import { loadAnswerKey, getRound } from './agents/answer.js';
import { Race } from './agents/race.js';
import { mockSolver, mockWanderer } from './agents/providers/mock.js';
import { CREW, buildRealCrew, configuredAgents } from './agents/crew.js';

const AGENTS = CREW.map((m) => m.agent); // ['gemini', 'openai', 'haiku']

const bus = new EventBus();
const game = new Game({ bus });
const sandbox = new Sandbox(DEFAULT_ROOTFS);
const betting = new Betting({ bus, agents: AGENTS });
const recorder = new Recorder({ bus });
const replayer = new Replayer({ bus });
// Announcer narrates milestones (live and replayed). It plays PRE-GENERATED clips
// from web/announcer/manifest.json (built offline by `npm run generate:announcer`),
// so there's no per-event TTS cost. With no manifest, clips are null and the
// dashboard falls back to the browser's speech.
const announcer = new Announcer({ bus, clips: loadAnnouncerClips() }).start();

function loadAnnouncerClips() {
  const file = path.join(WEB_ROOT, 'announcer', 'manifest.json');
  try {
    if (existsSync(file)) {
      const clips = new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8'))));
      console.log(`[vault-heist] announcer: ${clips.size} pre-generated clips loaded`);
      return clips;
    }
  } catch (e) { console.warn(`[vault-heist] announcer manifest unreadable: ${e.message}`); }
  console.log('[vault-heist] announcer: no clips — using browser speech fallback');
  return new Map();
}

const answerKey = await loadAnswerKey('iotgoat');
const round = getRound(answerKey); // default round: hardcoded-credentials

let racing = false;
let lastRaceEndedAt = 0;

/** The scripted mock crew — keyless and deterministic, so the demo + replay
 *  path always produces a clean, exciting race. */
function buildMockRace() {
  return new Race({
    bus, game, sandbox, round,
    costCapUsd: RACE_COST_CAP_USD,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 4 }) },
      { agent: 'openai', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
      { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 5 }) },
    ],
  });
}

/** The real crew: each agent with an API key runs its real model; any agent
 *  without a key falls back to a mock wanderer so the roster stays complete and
 *  the race still runs. The shared $2 cost cap meters real spend. */
function buildRealRace() {
  const real = new Map(buildRealCrew().map((m) => [m.agent, m]));
  const agents = CREW.map((m) =>
    real.get(m.agent) ?? { agent: m.agent, strategy: m.strategy, provider: mockWanderer({ steps: 5 }) });
  return new Race({ bus, game, sandbox, round, costCapUsd: RACE_COST_CAP_USD, agents });
}

/** RACING -> run the crew (given its builder) -> settle the pot on the winner. */
async function startRaceAndSettle(buildRace) {
  if (racing) throw httpError('a race is already in progress', 409);
  const waitMs = lastRaceEndedAt + RACE_COOLDOWN_MS - Date.now();
  if (waitMs > 0) throw httpError(`race cooldown — try again in ${Math.ceil(waitMs / 1000)}s`, 429);
  racing = true;
  try {
    game.startRace();
    const { winner, cost } = await buildRace().run();
    betting.settle(winner);
    return { winner, cost };
  } finally {
    racing = false;
    lastRaceEndedAt = Date.now();
  }
}

function httpError(message, status) { const e = new Error(message); e.status = status; return e; }
function requireHost(body) {
  if (process.env.HOST_TOKEN && body?.token !== process.env.HOST_TOKEN) throw httpError('bad host token', 403);
}
function requirePhase(expected) {
  if (game.phase !== expected) throw httpError(`action not allowed in phase ${game.phase}`, 409);
}
function requireNotReplaying() {
  if (replayer.playing) throw httpError('a replay is in progress', 409);
}

/** Full auto demo: bots join + bet, then lock + race (so the pot is populated). */
async function runDemoRace() {
  if (game.phase === 'SETTLED') { game.reset(); betting.reset(game.round); }
  if (game.phase !== 'LOBBY') throw httpError(`cannot start from phase ${game.phase}`, 409);
  game.openBetting(); betting.openRound();
  for (const [name, agent, amount] of [['Ava', 'openai', 120], ['Ben', 'gemini', 80], ['Cy', 'haiku', 100]]) {
    const { playerId } = betting.join(name);
    betting.placeBet(playerId, agent, amount);
  }
  game.lockBets({ pot: betting.pot(), odds: betting.odds() });
  betting.lock();
  return startRaceAndSettle(buildMockRace);
}

const routes = {
  'GET /api/state': async () => ({
    phase: game.phase, round: game.round, agents: AGENTS,
    recording: recorder.recording, replaying: replayer.playing,
    joinUrls: joinUrls({ port: boundPort }), // for the dashboard's join QR
    ...betting.snapshot(),
  }),
  'POST /api/join': async (body) => betting.join(body.name),
  'POST /api/bet': async (body) => {
    requirePhase('BETTING_OPEN');
    return betting.placeBet(body.playerId, body.agent, body.amount);
  },
  'POST /api/host/open': async (body) => {
    requireHost(body); requireNotReplaying();
    if (game.phase === 'SETTLED') { game.reset(); betting.reset(game.round); }
    requirePhase('LOBBY');
    game.openBetting(); betting.openRound();
    return { phase: game.phase };
  },
  'POST /api/host/lock': async (body) => {
    requireHost(body); requireNotReplaying();
    requirePhase('BETTING_OPEN');
    game.lockBets({ pot: betting.pot(), odds: betting.odds() });
    betting.lock();
    return startRaceAndSettle(buildRealRace);
  },
  'POST /api/host/reset': async (body) => {
    requireHost(body);
    requirePhase('SETTLED');
    game.reset(); betting.reset(game.round);
    return { phase: game.phase };
  },
  'POST /api/demo/race': async (body) => { requireHost(body); requireNotReplaying(); return runDemoRace(); },

  // --- record & replay (Milestone 7) ---
  'GET /api/recordings': async () => ({ recordings: await listRecordings(RECORDINGS_DIR) }),
  'POST /api/record/start': async (body) => { requireHost(body); return recorder.start(body.label); },
  'POST /api/record/stop': async (body) => {
    requireHost(body);
    const r = recorder.stop();
    const saved = await recorder.save(RECORDINGS_DIR, `${r.label}-${Date.now()}`);
    return { count: r.count, file: path.basename(saved.file) };
  },
  'POST /api/replay': async (body) => {
    requireHost(body); requireNotReplaying();
    if (racing) throw httpError('a race is in progress', 409);
    const name = (body.name || 'demo-clean.jsonl').replace(/[^\w.-]/g, '');
    const file = path.join(RECORDINGS_DIR, name.endsWith('.jsonl') ? name : `${name}.jsonl`);
    const events = await replayer.loadFile(file).catch(() => { throw httpError(`recording not found: ${name}`, 404); });
    // run the replay in the background; stream it to connected clients
    replayer.play(events, { speed: Number(body.speed) || 1 }).catch((e) => console.error('[replay]', e.message));
    return { started: true, name, events: events.length };
  },
  'POST /api/replay/stop': async (body) => { requireHost(body); replayer.stop(); return { stopped: true }; },
};

const server = createServer({ bus, game, sandbox, betting, port: PORT, webRoot: WEB_ROOT, routes });
const boundPort = await server.listen();
console.log(`[vault-heist] dashboard: http://localhost:${boundPort}/`);
console.log(`[vault-heist] player:    http://localhost:${boundPort}/play.html`);
console.log(`[vault-heist] rootfs:    ${sandbox.root}`);
const live = configuredAgents();
console.log(live.length
  ? `[vault-heist] live models: ${live.join(', ')} (others fall back to mock); host race uses real providers`
  : '[vault-heist] no API keys set — host race runs on mock providers. Add keys to .env for live models.');

bus.subscribe((e) => console.log(`  event #${e.seq} ${e.source}/${e.type}`, JSON.stringify(e.payload)));

if (process.argv.includes('--demo')) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  console.log('[vault-heist] running scripted demo cycle...');
  await wait(400); game.openBetting();
  await wait(400); game.lockBets({ pot: 0 });
  await wait(400); game.startRace();
  await wait(400); game.settle({ winner: null });
  await wait(400); game.reset();
}

if (process.argv.includes('--race')) {
  console.log('[vault-heist] running a full auto demo race (bots bet, then race)...');
  const result = await runDemoRace();
  console.log(`[vault-heist] race winner: ${result.winner ?? '(none)'}`);
  console.log('[vault-heist] server still running. Ctrl+C to stop.');
}
