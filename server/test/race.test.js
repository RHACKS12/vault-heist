import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Game } from '../src/game.js';
import { Sandbox } from '../src/sandbox.js';
import { Race } from '../src/agents/race.js';
import { loadAnswerKey, getRound } from '../src/agents/answer.js';
import { mockSolver, mockWanderer, mockRefuser } from '../src/agents/providers/mock.js';
import { DEFAULT_ROOTFS } from '../src/config.js';
import { EVENT_TYPES, PHASES } from '../src/events.js';

const answerKey = await loadAnswerKey('iotgoat');
const round = getRound(answerKey); // hardcoded-credentials

function setup() {
  const bus = new EventBus();
  const events = [];
  bus.subscribe((e) => events.push(e));
  const game = new Game({ bus });
  const sandbox = new Sandbox(DEFAULT_ROOTFS);
  game.openBetting(); game.lockBets(); game.startRace();
  return { bus, events, game, sandbox };
}

test('the solver beats the wanderers and the game settles', async () => {
  const { events, game, bus, sandbox } = setup();
  const race = new Race({
    bus, game, sandbox, round,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 3 }) },
      { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
      { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 3 }) },
    ],
  });
  const result = await race.run();

  assert.equal(result.winner, 'deepseek');
  assert.ok(events.some((e) => e.type === EVENT_TYPES.WON && e.agent === 'deepseek'));
  assert.equal(game.phase, PHASES.SETTLED);
});

test('a refuser does not win; the game still settles', async () => {
  const { game, bus, sandbox } = setup();
  const race = new Race({
    bus, game, sandbox, round,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockRefuser() },
      { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
    ],
  });
  const result = await race.run();
  assert.equal(result.winner, 'deepseek');
  assert.equal(game.phase, PHASES.SETTLED);
});

test('nobody solves it -> winner is null and the game settles', async () => {
  const { game, bus, sandbox } = setup();
  const race = new Race({
    bus, game, sandbox, round,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 2 }) },
      { agent: 'haiku', strategy: 'binary', provider: mockWanderer({ steps: 2 }) },
    ],
  });
  const result = await race.run();
  assert.equal(result.winner, null);
  assert.equal(game.phase, PHASES.SETTLED);
});

test('only one winner even if two agents submit correctly', async () => {
  const { events, game, bus, sandbox } = setup();
  const race = new Race({
    bus, game, sandbox, round,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
      { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
    ],
  });
  const result = await race.run();
  assert.ok(['gemini', 'deepseek'].includes(result.winner));
  const wins = events.filter((e) => e.type === EVENT_TYPES.WON);
  assert.equal(wins.length, 1, 'exactly one WON event');
});
