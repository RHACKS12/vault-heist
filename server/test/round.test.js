import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAnswerKey, pickRound } from '../src/agents/answer.js';

const answerKey = await loadAnswerKey('iotgoat');

test('ROUND unset keeps the default round every race', () => {
  for (const mode of [undefined, '']) assert.equal(pickRound(answerKey, mode, { last: answerKey.defaultRound }).name, answerKey.defaultRound);
});

test('a round name pins that round', () => {
  assert.equal(pickRound(answerKey, 'command-injection').name, 'command-injection');
  assert.throws(() => pickRound(answerKey, 'no-such-round'), /Unknown round/);
});

test('random never repeats the previous round and can reach every other one', () => {
  const names = Object.keys(answerKey.rounds);
  for (const last of names) {
    const seen = new Set();
    for (let i = 0; i < 10; i++) seen.add(pickRound(answerKey, 'random', { last, random: () => i / 10 }).name);
    assert.ok(!seen.has(last));
    assert.equal(seen.size, names.length - 1);
  }
});
