// The vocabulary of the single event stream that everything hangs off.
// Every milestone, phase change, bet, and agent thought becomes one GameEvent
// published on the bus (see bus.js) and fanned out to clients (see server.js).

/** Game phases. The race is a strict progression through these. */
export const PHASES = Object.freeze({
  LOBBY: 'LOBBY',               // players join from their phones
  BETTING_OPEN: 'BETTING_OPEN', // one bet per player; odds move as the pot fills
  BETS_LOCKED: 'BETS_LOCKED',   // host locked betting; odds final
  RACING: 'RACING',             // agents run; milestones stream
  SETTLED: 'SETTLED',           // first correct submission won; pot paid out
});

/** Who emitted an event. */
export const SOURCES = Object.freeze({
  GAME: 'game',
  AGENT: 'agent',
  JUDGE: 'judge',
  BETTING: 'betting',
  ANNOUNCER: 'announcer',
});

/** Event types carried in GameEvent.type. */
export const EVENT_TYPES = Object.freeze({
  PHASE_CHANGE: 'phase_change',
  // agent milestones (drive the discrete progress bars)
  EXPLORING: 'exploring',
  FOUND_DIR: 'found_dir',
  OPENED_FILE: 'opened_file',
  SUBMITTED: 'submitted',
  REASONING_TOKEN: 'reasoning_token', // streamed thought chunk for the panel
  WON: 'won',
  REFUSED: 'refused',
  COST_CAP: 'cost_cap', // race-wide spend ceiling hit; remaining agents stop
  // betting
  PLAYER_JOINED: 'player_joined',
  BET_PLACED: 'bet_placed',
  ODDS_UPDATE: 'odds_update',
  SETTLED: 'settled',
  // announcer (derived presentation layer)
  ANNOUNCE: 'announce',
});

/** The three safecrackers ("the crew"). */
export const AGENTS = Object.freeze({
  GEMINI: 'gemini',
  DEEPSEEK: 'deepseek',
  HAIKU: 'haiku',
});

let _seq = 0;

/**
 * Build a GameEvent. `seq` is a monotonic counter for strict ordering and
 * replay; `ts` is wall-clock ms.
 * @param {{round?:number, source:string, type:string, agent?:string|null, payload?:object}} spec
 * @returns {{seq:number, round:number, ts:number, source:string, type:string, agent:string|null, payload:object}}
 */
export function createEvent({ round = 1, source, type, agent = null, payload = {} }) {
  if (!source) throw new Error('createEvent: source is required');
  if (!type) throw new Error('createEvent: type is required');
  return { seq: ++_seq, round, ts: Date.now(), source, type, agent, payload };
}

/** Reset the sequence counter (tests only). */
export function _resetSeq() {
  _seq = 0;
}
