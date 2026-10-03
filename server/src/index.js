// Entry point: wire the bus, game, and sandbox together, serve the dashboard,
// and start the server.
//
//   npm start            -> start the server + serve the observer dashboard at /
//   npm run demo         -> start + walk one scripted phase cycle
//   npm run race         -> start + run a full MOCK race over the real rootfs
//
// The dashboard's "Run demo race" button hits POST /api/demo/race, which runs
// the same mock race so you can watch the whole stream in the browser with no
// API keys. Real models arrive in Milestone 3b (see docs/progress.md).
import { EventBus } from './bus.js';
import { Game } from './game.js';
import { Sandbox } from './sandbox.js';
import { createServer } from './server.js';
import { DEFAULT_ROOTFS, WEB_ROOT, PORT } from './config.js';
import { loadAnswerKey, getRound } from './agents/answer.js';
import { Race } from './agents/race.js';
import { mockSolver, mockWanderer } from './agents/providers/mock.js';

const bus = new EventBus();
const game = new Game({ bus });
const sandbox = new Sandbox(DEFAULT_ROOTFS);

let racing = false;

/**
 * Run one mock race over the live bus/game so every connected client sees it.
 * Resets a finished game back to the lobby first. Guards against overlap.
 */
async function runMockRace() {
  if (racing) throw new Error('a race is already in progress');
  if (game.phase === 'SETTLED') game.reset();        // SETTLED -> LOBBY
  if (game.phase !== 'LOBBY') throw new Error(`cannot start a race from phase ${game.phase}`);
  racing = true;
  try {
    const answerKey = await loadAnswerKey('iotgoat');
    const round = getRound(answerKey); // default round: hardcoded-credentials
    game.openBetting();
    game.lockBets({ pot: 300 });
    game.startRace();
    const race = new Race({
      bus, game, sandbox, round,
      agents: [
        { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 4 }) },
        { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
        { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 5 }) },
      ],
    });
    const result = await race.run();
    return { winner: result.winner };
  } finally {
    racing = false;
  }
}

const server = createServer({ bus, game, sandbox, port: PORT, webRoot: WEB_ROOT, onDemoRace: runMockRace });

const boundPort = await server.listen();
console.log(`[vault-heist] dashboard: http://localhost:${boundPort}/   (WebSocket + /health)`);
console.log(`[vault-heist] rootfs:    ${sandbox.root}`);

// mirror every event to the console so the bus is visible without a client
bus.subscribe((e) => console.log(`  event #${e.seq} ${e.source}/${e.type}`, JSON.stringify(e.payload)));

if (process.argv.includes('--demo')) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  console.log('[vault-heist] running scripted demo cycle...');
  await wait(400); game.openBetting();
  await wait(400); game.lockBets({ pot: 0 });
  await wait(400); game.startRace();
  await wait(400); game.settle({ winner: null });
  await wait(400); game.reset();
  console.log('[vault-heist] demo cycle complete; server still running. Ctrl+C to stop.');
}

if (process.argv.includes('--race')) {
  console.log('[vault-heist] running a mock race over the real rootfs...');
  const result = await runMockRace();
  console.log(`[vault-heist] race winner: ${result.winner ?? '(none)'}`);
  console.log('[vault-heist] server still running. Ctrl+C to stop.');
}
