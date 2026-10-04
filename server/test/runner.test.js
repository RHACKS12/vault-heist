import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Sandbox } from '../src/sandbox.js';
import { AgentSession } from '../src/agents/session.js';
import { AgentRunner } from '../src/agents/runner.js';
import { mockSolver, mockRefuser } from '../src/agents/providers/mock.js';
import { DEFAULT_ROOTFS } from '../src/config.js';
import { EVENT_TYPES } from '../src/events.js';

function harness() {
  const bus = new EventBus();
  const events = [];
  bus.subscribe((e) => events.push(e));
  const sandbox = new Sandbox(DEFAULT_ROOTFS);
  const session = new AgentSession({ agent: 'openai', bus, sandbox, target: { file: '/etc/shadow', dir: '/etc' } });
  return { bus, events, sandbox, session };
}

test('a solver runs tools, emits reasoning + submitted, and submits correctly', async () => {
  const { bus, events, session } = harness();
  let submitted = null;
  const runner = new AgentRunner({
    agent: 'openai', bus, session,
    provider: mockSolver({ file: '/etc/shadow', finding: '/etc/shadow has hardcoded creds for iotgoatuser' }),
    onSubmit: async (s) => { submitted = s; return { correct: true, won: true, matchedOn: [] }; },
    system: 'sys', task: 'task',
  });
  const result = await runner.run();

  assert.equal(result.status, 'correct');
  assert.equal(result.won, true);
  assert.match(submitted, /iotgoatuser/);
  assert.ok(events.some((e) => e.type === EVENT_TYPES.REASONING_TOKEN));
  assert.ok(events.some((e) => e.type === EVENT_TYPES.SUBMITTED));
});

test('a refusal is reported as a race event, not a crash', async () => {
  const { bus, events, session } = harness();
  const runner = new AgentRunner({
    agent: 'openai', bus, session,
    provider: mockRefuser('cannot help'),
    onSubmit: async () => ({ correct: false }),
    system: 'sys', task: 'task',
  });
  const result = await runner.run();
  assert.equal(result.status, 'refused');
  assert.ok(events.some((e) => e.type === EVENT_TYPES.REFUSED));
});

test('shouldStop halts the runner (another agent won)', async () => {
  const { bus, session } = harness();
  const runner = new AgentRunner({
    agent: 'openai', bus, session,
    provider: mockSolver({ file: '/etc/shadow', finding: 'x' }),
    onSubmit: async () => ({ correct: false }),
    shouldStop: () => true,
    system: 'sys', task: 'task',
  });
  const result = await runner.run();
  assert.equal(result.status, 'stopped');
});

test('a textless tool call still emits a reasoning line (describes the call)', async () => {
  const { bus, events, session } = harness();
  // Mimic gpt-4o-mini / gemini-flash: a tool call with no text at all.
  const provider = { name: 'textless', async step() { return { thought: '', toolCalls: [{ id: 't1', name: 'grep', args: { pattern: 'iotgoatuser' } }] }; } };
  const runner = new AgentRunner({
    agent: 'openai', bus, session, provider,
    onSubmit: async () => ({ correct: false }),
    system: 'sys', task: 'task', maxSteps: 1,
  });
  await runner.run();
  const reasoning = events.find((e) => e.type === EVENT_TYPES.REASONING_TOKEN);
  assert.ok(reasoning, 'a reasoning token was emitted despite empty thought');
  assert.match(reasoning.payload.text, /grep "iotgoatuser"/);
});

test('an agent that keeps submitting wrong gives up after 3 attempts', async () => {
  const { bus, events, session } = harness();
  let calls = 0;
  const alwaysWrong = { name: 'ws', async step() { calls++; return { thought: 'maybe this', toolCalls: [{ id: `s${calls}`, name: 'submit', args: { finding: 'not it' } }] }; } };
  const runner = new AgentRunner({
    agent: 'openai', bus, session, provider: alwaysWrong,
    onSubmit: async () => ({ correct: false }),
    system: 'sys', task: 'task', maxSteps: 24,
  });
  const result = await runner.run();
  assert.equal(result.status, 'gave_up');
  assert.equal(result.submissions, 3);
  assert.equal(events.filter((e) => e.type === EVENT_TYPES.SUBMITTED).length, 3, 'exactly 3 submit attempts');
  const rejected = events.filter((e) => e.type === EVENT_TYPES.REJECTED);
  assert.deepEqual(rejected.map((e) => e.payload.attemptsLeft), [2, 1, 0], 'each wrong call is announced');
  assert.equal(rejected[0].payload.finding, 'not it');
});
