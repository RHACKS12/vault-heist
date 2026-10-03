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
import { EventBus } from './bus.js';
import { Game } from './game.js';
import { Sandbox } from './sandbox.js';
import { Betting } from './betting.js';
import { createServer } from './server.js';
import { DEFAULT_ROOTFS, WEB_ROOT, PORT } from './config.js';
import { loadAnswerKey, getRound } from './agents/answer.js';
import { Race } from './agents/race.js';
import { mockSolver, mockWanderer } from './agents/providers/mock.js';

const AGENTS = ['gemini', 'deepseek', 'haiku'];

const bus = new EventBus();
const game = new Game({ bus });
const sandbox = new Sandbox(DEFAULT_ROOTFS);
const betting = new Betting({ bus, agents: AGENTS });

const answerKey = await loadAnswerKey('iotgoat');
const round = getRound(answerKey); // default round: hardcoded-credentials

let racing = false;

/** Build the race for this round. Mock providers today; real ones in 3b. */
function buildRace() {
  return new Race({
    bus, game, sandbox, round,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 4 }) },
      { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
      { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 5 }) },
    ],
  });
}

/** RACING -> run the crew -> settle the pot on the winner. */
async function startRaceAndSettle() {
  if (racing) throw httpError('a race is already in progress', 409);
  racing = true;
  try {
    game.startRace();
    const { winner } = await buildRace().run();
    betting.settle(winner);
    return { winner };
  } finally {
    racing = false;
  }
}

function httpError(message, status) { const e = new Error(message); e.status = status; return e; }
function requireHost(body) {
  if (process.env.HOST_TOKEN && body?.token !== process.env.HOST_TOKEN) throw httpError('bad host token', 403);
}
function requirePhase(expected) {
  if (game.phase !== expected) throw httpError(`action not allowed in phase ${game.phase}`, 409);
}

/** Full auto demo: bots join + bet, then lock + race (so the pot is populated). */
async function runDemoRace() {
  if (game.phase === 'SETTLED') { game.reset(); betting.reset(game.round); }
  if (game.phase !== 'LOBBY') throw httpError(`cannot start from phase ${game.phase}`, 409);
  game.openBetting(); betting.openRound();
  for (const [name, agent, amount] of [['Ava', 'deepseek', 120], ['Ben', 'gemini', 80], ['Cy', 'haiku', 100]]) {
    const { playerId } = betting.join(name);
    betting.placeBet(playerId, agent, amount);
  }
  game.lockBets({ pot: betting.pot(), odds: betting.odds() });
  betting.lock();
  return startRaceAndSettle();
}

const routes = {
  'GET /api/state': async () => ({
    phase: game.phase, round: game.round, agents: AGENTS, ...betting.snapshot(),
  }),
  'POST /api/join': async (body) => betting.join(body.name),
  'POST /api/bet': async (body) => {
    requirePhase('BETTING_OPEN');
    return betting.placeBet(body.playerId, body.agent, body.amount);
  },
  'POST /api/host/open': async (body) => {
    requireHost(body);
    if (game.phase === 'SETTLED') { game.reset(); betting.reset(game.round); }
    requirePhase('LOBBY');
    game.openBetting(); betting.openRound();
    return { phase: game.phase };
  },
  'POST /api/host/lock': async (body) => {
    requireHost(body);
    requirePhase('BETTING_OPEN');
    game.lockBets({ pot: betting.pot(), odds: betting.odds() });
    betting.lock();
    return startRaceAndSettle();
  },
  'POST /api/host/reset': async (body) => {
    requireHost(body);
    requirePhase('SETTLED');
    game.reset(); betting.reset(game.round);
    return { phase: game.phase };
  },
  'POST /api/demo/race': async () => runDemoRace(),
};

const server = createServer({ bus, game, sandbox, betting, port: PORT, webRoot: WEB_ROOT, routes });
const boundPort = await server.listen();
console.log(`[vault-heist] dashboard: http://localhost:${boundPort}/`);
console.log(`[vault-heist] player:    http://localhost:${boundPort}/play.html`);
console.log(`[vault-heist] rootfs:    ${sandbox.root}`);

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
