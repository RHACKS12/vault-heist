// The game state machine.
//
// A round is a strict progression: LOBBY -> BETTING_OPEN -> BETS_LOCKED ->
// RACING -> SETTLED -> (reset) -> LOBBY. Every transition is validated and
// published as a phase_change event so the dashboard, players, and announcer
// all react to the same source of truth.
import { PHASES, SOURCES, EVENT_TYPES, createEvent } from './events.js';

/** Legal transitions out of each phase. */
const ALLOWED = Object.freeze({
  [PHASES.LOBBY]: [PHASES.BETTING_OPEN],
  [PHASES.BETTING_OPEN]: [PHASES.BETS_LOCKED],
  [PHASES.BETS_LOCKED]: [PHASES.RACING],
  [PHASES.RACING]: [PHASES.SETTLED],
  [PHASES.SETTLED]: [PHASES.LOBBY],
});

export class Game {
  /** @param {{bus:import('./bus.js').EventBus, round?:number}} opts */
  constructor({ bus, round = 1 } = {}) {
    if (!bus) throw new Error('Game requires an event bus');
    this.bus = bus;
    this.round = round;
    this.phase = PHASES.LOBBY;
  }

  /** Is `next` a legal transition from the current phase? */
  canTransition(next) {
    return (ALLOWED[this.phase] ?? []).includes(next);
  }

  /**
   * Move to `next`, publishing a phase_change event. Throws on an illegal move.
   * @param {string} next a PHASES value
   * @param {object} [payload] extra fields merged into the event payload
   */
  transition(next, payload = {}) {
    if (!this.canTransition(next)) {
      throw new Error(`Illegal transition ${this.phase} -> ${next}`);
    }
    const from = this.phase;
    this.phase = next;
    // returning to the lobby starts a fresh round
    if (next === PHASES.LOBBY) this.round += 1;
    this.bus.publish(createEvent({
      round: this.round,
      source: SOURCES.GAME,
      type: EVENT_TYPES.PHASE_CHANGE,
      payload: { from, to: next, ...payload },
    }));
    return this.phase;
  }

  // Intent-named helpers so callers read like the game, not the machine.
  openBetting() { return this.transition(PHASES.BETTING_OPEN); }
  lockBets(payload) { return this.transition(PHASES.BETS_LOCKED, payload); }
  startRace() { return this.transition(PHASES.RACING); }
  settle(payload) { return this.transition(PHASES.SETTLED, payload); }
  reset() { return this.transition(PHASES.LOBBY); }
}
