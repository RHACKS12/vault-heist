// Record one clean run to recordings/demo-clean.jsonl — the bulletproof replay
// used on stage. Run: `npm run record:demo` (from server/).
import path from 'node:path';
import { EventBus } from '../src/bus.js';
import { Game } from '../src/game.js';
import { Sandbox } from '../src/sandbox.js';
import { Betting } from '../src/betting.js';
import { Recorder } from '../src/recorder.js';
import { Race } from '../src/agents/race.js';
import { loadAnswerKey, getRound } from '../src/agents/answer.js';
import { mockSolver, mockWanderer } from '../src/agents/providers/mock.js';
import { REPO_ROOT, RECORDINGS_DIR, DEFAULT_ROOTFS } from '../src/config.js';

const AGENTS = ['gemini', 'openai', 'haiku'];
const bus = new EventBus();
const game = new Game({ bus });
const sandbox = new Sandbox(DEFAULT_ROOTFS);
const betting = new Betting({ bus, agents: AGENTS });
const answerKey = await loadAnswerKey('iotgoat');
const round = getRound(answerKey);

const rec = new Recorder({ bus });
rec.start('demo-clean');

// a full round: lobby -> bets -> lock -> race -> settle
game.openBetting(); betting.openRound();
for (const [name, agent, amount] of [['Ava', 'openai', 150], ['Ben', 'gemini', 80], ['Cy', 'haiku', 120]]) {
  const { playerId } = betting.join(name);
  betting.placeBet(playerId, agent, amount);
}
game.lockBets({ pot: betting.pot(), odds: betting.odds() });
betting.lock();
game.startRace();
const race = new Race({
  bus, game, sandbox, round,
  agents: [
    { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 4 }) },
    { agent: 'openai', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
    { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 5 }) },
  ],
});
const { winner } = await race.run();
betting.settle(winner);

rec.stop();
const out = await rec.save(RECORDINGS_DIR, 'demo-clean');
console.log(`recorded ${out.count} events to ${path.relative(REPO_ROOT, out.file)} (winner: ${winner})`);
