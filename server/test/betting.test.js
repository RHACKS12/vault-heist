import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Betting, BettingError } from '../src/betting.js';
import { EVENT_TYPES } from '../src/events.js';

const AGENTS = ['gemini', 'openai', 'haiku'];

function setup() {
  const bus = new EventBus();
  const events = [];
  bus.subscribe((e) => events.push(e));
  const betting = new Betting({ bus, agents: AGENTS, startingChips: 100 });
  betting.openRound();
  return { bus, events, betting };
}

test('join issues a player with the starting balance', () => {
  const { betting, events } = setup();
  const { playerId, balance } = betting.join('Ava');
  assert.ok(playerId);
  assert.equal(balance, 100);
  assert.ok(events.some((e) => e.type === EVENT_TYPES.PLAYER_JOINED));
});

test('placing a bet moves chips, updates the pot, and emits odds', () => {
  const { betting, events } = setup();
  const { playerId } = betting.join('Ava');
  const r = betting.placeBet(playerId, 'openai', 60);
  assert.equal(r.balance, 40);
  assert.equal(betting.pot(), 60);
  assert.equal(betting.totals().openai, 60);
  assert.ok(events.some((e) => e.type === EVENT_TYPES.BET_PLACED));
  assert.ok(events.some((e) => e.type === EVENT_TYPES.ODDS_UPDATE));
});

test('odds are pot/stake, null when nothing is on an agent', () => {
  const { betting } = setup();
  const a = betting.join('A'); const b = betting.join('B');
  betting.placeBet(a.playerId, 'openai', 100);
  betting.placeBet(b.playerId, 'gemini', 100);
  const odds = betting.odds();
  assert.equal(odds.openai, 2);   // pot 200 / 100
  assert.equal(odds.gemini, 2);
  assert.equal(odds.haiku, null);
});

test('bet validation: closed, unknown player/agent, non-positive, double, overdraw', () => {
  const { betting } = setup();
  const { playerId } = betting.join('Ava');
  assert.throws(() => betting.placeBet('nope', 'openai', 10), BettingError);
  assert.throws(() => betting.placeBet(playerId, 'nobody', 10), BettingError);
  assert.throws(() => betting.placeBet(playerId, 'openai', 0), BettingError);
  assert.throws(() => betting.placeBet(playerId, 'openai', 999), BettingError);
  betting.placeBet(playerId, 'openai', 10);
  assert.throws(() => betting.placeBet(playerId, 'gemini', 10), BettingError); // one bet per round
  betting.lock();
  const p2 = betting.join('Ben');
  assert.throws(() => betting.placeBet(p2.playerId, 'gemini', 10), BettingError); // closed
});

test('settle splits the whole pot among backers of the winner', () => {
  const { betting, events } = setup();
  const a = betting.join('A'); const b = betting.join('B'); const c = betting.join('C');
  betting.placeBet(a.playerId, 'openai', 60);  // winner backer
  betting.placeBet(b.playerId, 'openai', 40);  // winner backer
  betting.placeBet(c.playerId, 'gemini', 100);   // loser
  betting.lock();
  const res = betting.settle('openai');         // pot 200, 100 on openai
  assert.equal(res.pot, 200);
  const pa = res.payouts.find((p) => p.playerId === a.playerId);
  const pc = res.payouts.find((p) => p.playerId === c.playerId);
  assert.equal(pa.payout, 120);                   // 60/100 * 200
  assert.equal(pc.payout, 0);
  assert.equal(betting.players.get(a.playerId).balance, 40 + 120); // 100-60 then +120
  assert.ok(events.some((e) => e.type === EVENT_TYPES.SETTLED));
});

test('no winner or no backers -> everyone is refunded', () => {
  const { betting } = setup();
  const a = betting.join('A');
  betting.placeBet(a.playerId, 'gemini', 70);
  betting.lock();
  const res = betting.settle('openai'); // nobody on openai
  assert.equal(res.refunded, true);
  assert.equal(res.payouts[0].payout, 70);
  assert.equal(betting.players.get(a.playerId).balance, 100); // got the stake back
});

test('reset clears bets but keeps players and balances', () => {
  const { betting } = setup();
  const a = betting.join('A');
  betting.placeBet(a.playerId, 'openai', 30);
  betting.reset(2);
  assert.equal(betting.pot(), 0);
  assert.equal(betting.round, 2);
  assert.ok(betting.players.has(a.playerId));
  assert.equal(betting.players.get(a.playerId).balance, 70);
});
