import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Game } from '../src/game.js';
import { PHASES, EVENT_TYPES } from '../src/events.js';

test('full happy-path cycle emits phase_change events in order', () => {
  const bus = new EventBus();
  const game = new Game({ bus });
  const seen = [];
  bus.subscribe((e) => { if (e.type === EVENT_TYPES.PHASE_CHANGE) seen.push(e.payload.to); });

  assert.equal(game.phase, PHASES.LOBBY);
  game.openBetting();
  game.lockBets();
  game.startRace();
  game.settle();
  game.reset();

  assert.deepEqual(seen, ['BETTING_OPEN', 'BETS_LOCKED', 'RACING', 'SETTLED', 'LOBBY']);
});

test('illegal transitions throw and leave the phase unchanged', () => {
  const bus = new EventBus();
  const game = new Game({ bus });
  assert.throws(() => game.startRace(), /Illegal transition/);
  assert.equal(game.phase, PHASES.LOBBY);
});

test('returning to the lobby starts a new round', () => {
  const bus = new EventBus();
  const game = new Game({ bus });
  assert.equal(game.round, 1);
  game.openBetting(); game.lockBets(); game.startRace(); game.settle(); game.reset();
  assert.equal(game.round, 2);
});

test('Game requires a bus', () => {
  assert.throws(() => new Game({}), /requires an event bus/);
});
