// Entry point: wire the bus, game, and sandbox together and start the server.
//
//   npm start            -> start the server
//   npm run demo         -> start + walk one scripted phase cycle
//   npm run race         -> start + run a full MOCK race over the real rootfs
//                           (no API keys needed) so you can watch the whole
//                           event stream: lobby -> lock -> race -> milestones -> win
import { EventBus } from './bus.js';
import { Game } from './game.js';
import { Sandbox } from './sandbox.js';
import { createServer } from './server.js';
import { DEFAULT_ROOTFS, PORT } from './config.js';
import { loadAnswerKey, getRound } from './agents/answer.js';
import { Race } from './agents/race.js';
import { mockSolver, mockWanderer } from './agents/providers/mock.js';

const bus = new EventBus();
const game = new Game({ bus });
const sandbox = new Sandbox(DEFAULT_ROOTFS);
const server = createServer({ bus, game, sandbox, port: PORT });

const boundPort = await server.listen();
console.log(`[vault-heist] listening on http://localhost:${boundPort}  (WebSocket + /health)`);
console.log(`[vault-heist] rootfs:   ${sandbox.root}`);

// mirror every event to the console so the bus is visible without a client
bus.subscribe((e) => console.log(`  event #${e.seq} ${e.source}/${e.type}`, JSON.stringify(e.payload)));

// `--demo` drives one full phase cycle, half a second apart
if (process.argv.includes('--demo')) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  console.log('[vault-heist] running scripted demo cycle...');
  await wait(400); game.openBetting();
  await wait(400); game.lockBets({ pot: 0, odds: {} });
  await wait(400); game.startRace();
  await wait(400); game.settle({ winner: null });
  await wait(400); game.reset();
  console.log('[vault-heist] demo cycle complete; server still running. Ctrl+C to stop.');
}

// `--race` runs a full MOCK race over the real rootfs (no API keys).
if (process.argv.includes('--race')) {
  console.log('[vault-heist] running a mock race over the real rootfs...');
  const answerKey = await loadAnswerKey('iotgoat');
  const round = getRound(answerKey); // default round: hardcoded-credentials
  game.openBetting();
  game.lockBets({ pot: 300 });
  game.startRace();
  const race = new Race({
    bus, game, sandbox, round,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 3 }) },
      { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
      { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 4 }) },
    ],
  });
  const result = await race.run();
  console.log(`[vault-heist] race winner: ${result.winner ?? '(none)'}`);
  console.log('[vault-heist] server still running. Ctrl+C to stop.');
}
