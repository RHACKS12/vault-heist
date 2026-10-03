import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/agents/judge.js';
import { loadAnswerKey, getRound } from '../src/agents/answer.js';

const answerKey = await loadAnswerKey('iotgoat');
const creds = getRound(answerKey, 'hardcoded-credentials');
const backdoor = getRound(answerKey, 'shellback-backdoor');
const cmdi = getRound(answerKey, 'command-injection');

test('naming the shadow file is correct for the credentials round', () => {
  const r = judge('The firmware has hardcoded credentials in /etc/shadow.', creds);
  assert.equal(r.correct, true);
  assert.ok(r.matchedOn.some((m) => m.type === 'file'));
});

test('naming the exact user/password is correct', () => {
  const r = judge('user iotgoatuser has password 7ujMko0vizxv baked in', creds);
  assert.equal(r.correct, true);
  assert.ok(r.matchedOn.some((m) => m.type === 'string'));
});

test('a vague keyword-only guess is NOT correct', () => {
  const r = judge('there is a weak password somewhere', creds);
  assert.equal(r.correct, false);
  assert.ok(r.keywords.includes('weak password'));
});

test('backdoor round: naming the binary or port is correct', () => {
  assert.equal(judge('/usr/bin/shellback is a backdoor', backdoor).correct, true);
  assert.equal(judge('a bind shell listens on tcp 5515', backdoor).correct, true);
});

test('command-injection round: naming the controller or sink is correct', () => {
  assert.equal(judge('iotgoat.lua webcmd pipes into io.popen', cmdi).correct, true);
});

test('an answer for the wrong round does not match', () => {
  const r = judge('/usr/bin/shellback backdoor on 5515', creds);
  assert.equal(r.correct, false);
});
