// Entry point: wire the bus, game, and sandbox together and start the server.
//
//   npm start            -> start the server
//   npm run demo         -> start + walk one scripted phase cycle so you can
//                           watch events stream without a frontend yet
import { EventBus } from './bus.js';
import { Game } from './game.js';
import { Sandbox } from './sandbox.js';
import { createServer } from './server.js';
import { DEFAULT_ROOTFS, PORT } from './config.js';

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
