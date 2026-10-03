import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, CREW } from '../reducer.js';

const ev = (type, agent, payload = {}) => ({ type, agent, payload, round: 1 });

test('initial state has the three-member crew idle in the lobby', () => {
  const s = initialState();
  assert.equal(s.phase, 'LOBBY');
  assert.equal(Object.keys(s.agents).length, CREW.length);
  for (const id of Object.keys(s.agents)) assert.equal(s.agents[id].stage, 0);
});

test('milestones advance a crew member monotonically', () => {
  const s = initialState();
  reduce(s, ev('exploring', 'gemini'));
  reduce(s, ev('found_dir', 'gemini'));
  reduce(s, ev('opened_file', 'gemini'));
  assert.equal(s.agents.gemini.stage, 3);
  reduce(s, ev('exploring', 'gemini')); // late/duplicate must not regress
  assert.equal(s.agents.gemini.stage, 3);
});

test('reasoning tokens accumulate on the right agent', () => {
  const s = initialState();
  reduce(s, ev('reasoning_token', 'deepseek', { text: 'first' }));
  reduce(s, ev('reasoning_token', 'deepseek', { text: 'second' }));
  assert.deepEqual(s.agents.deepseek.reasoning, ['first', 'second']);
  assert.equal(s.agents.gemini.reasoning.length, 0);
});

test('submitted records the finding and reaches the final stage', () => {
  const s = initialState();
  reduce(s, ev('submitted', 'haiku', { finding: '/etc/shadow creds' }));
  assert.equal(s.agents.haiku.stage, 4);
  assert.equal(s.agents.haiku.finding, '/etc/shadow creds');
});

test('a win sets the global winner and flags the agent', () => {
  const s = initialState();
  reduce(s, ev('won', 'deepseek', { matchedOn: [] }));
  assert.equal(s.winner, 'deepseek');
  assert.equal(s.agents.deepseek.won, true);
});

test('returning to the lobby resets the round state', () => {
  const s = initialState();
  reduce(s, ev('won', 'gemini'));
  reduce(s, { type: 'phase_change', payload: { to: 'LOBBY' }, round: 2 });
  assert.equal(s.winner, null);
  assert.equal(s.agents.gemini.won, false);
  assert.equal(s.round, 2);
});

test('the hello seed sets phase and replays the backlog', () => {
  const s = initialState();
  reduce(s, {
    type: 'hello',
    phase: 'RACING',
    round: 1,
    recent: [ev('exploring', 'gemini'), ev('found_dir', 'gemini')],
  });
  assert.equal(s.phase, 'RACING');
  assert.equal(s.agents.gemini.stage, 2);
});

test('phase_change to SETTLED with a winner is captured', () => {
  const s = initialState();
  reduce(s, { type: 'phase_change', payload: { to: 'SETTLED', winner: 'haiku', pot: 300 }, round: 1 });
  assert.equal(s.phase, 'SETTLED');
  assert.equal(s.winner, 'haiku');
  assert.equal(s.pot, 300);
});
