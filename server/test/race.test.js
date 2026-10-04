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

// --- cost cap -------------------------------------------------------------

/** A provider that bills a fixed token usage every step and keeps wandering,
 *  so it would run forever if nothing stopped it. */
function expensiveProvider({ model = 'claude-haiku-4-5', usage = { inputTokens: 200_000, outputTokens: 40_000 } } = {}) {
  let i = 0;
  return {
    name: 'expensive',
    model,
    async step() {
      i++;
      return { thought: `expensive step ${i}`, usage, toolCalls: [{ id: `e${i}`, name: 'list_dir', args: { path: '/' } }] };
    },
  };
}

test('the race-wide cost cap stops every agent and emits COST_CAP', async () => {
  const { events, game, bus, sandbox } = setup();
  // haiku pricing: $1/M in + $5/M out => 0.2M*1 + 0.04M*5 = $0.40 per step.
  // A $1 cap trips after 3 steps.
  const race = new Race({
    bus, game, sandbox, round, costCapUsd: 1, maxSteps: 50,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: expensiveProvider() },
      { agent: 'haiku', strategy: 'binary', provider: expensiveProvider() },
    ],
  });
  const result = await race.run();

  assert.equal(result.cost.capped, true, 'cap reported as hit');
  assert.ok(result.cost.totalUsd >= 1, 'total reached the cap');
  assert.ok(result.cost.totalUsd < 2, 'total did not run away far past the cap');
  // The runner that crosses the cap returns 'cost'; the others see the shared
  // stop condition and return 'stopped'. None runs to normal completion.
  assert.ok(result.results.some((r) => r.status === 'cost'), 'at least one runner stopped on cost');
  assert.ok(result.results.every((r) => r.status === 'cost' || r.status === 'stopped'), 'no runner ran on past the cap');
  const capEvents = events.filter((e) => e.type === EVENT_TYPES.COST_CAP);
  assert.equal(capEvents.length, 1, 'COST_CAP fires exactly once');
});

test('mock providers report no usage and never trip the cap', async () => {
  const { game, bus, sandbox } = setup();
  const race = new Race({
    bus, game, sandbox, round, costCapUsd: 2,
    agents: [
      { agent: 'gemini', strategy: 'grep', provider: mockWanderer({ steps: 3 }) },
      { agent: 'deepseek', strategy: 'walk', provider: mockSolver({ file: round.file, finding: round.answer_summary }) },
    ],
  });
  const result = await race.run();
  assert.equal(result.cost.totalUsd, 0);
  assert.equal(result.cost.capped, false);
});
