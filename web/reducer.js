// Pure render-state reducer for the observer dashboard.
//
// No DOM here on purpose: app.js owns rendering, this owns state, and the state
// transitions are unit-tested in Node. Event type strings mirror the server's
// EVENT_TYPES (server/src/events.js); kept inline so the web layer is standalone.

export const CREW = [
  { id: 'gemini', name: 'Gemini', strategy: 'grep strings' },
  { id: 'deepseek', name: 'DeepSeek', strategy: 'walk the files' },
  { id: 'haiku', name: 'Haiku', strategy: 'inspect binaries' },
];

/** Milestone bar stages, in order. */
export const STAGES = ['exploring', 'found the directory', 'opened the file', 'submitted'];

function freshAgent(def) {
  return { id: def.id, name: def.name, strategy: def.strategy, stage: 0, reasoning: [], finding: null, won: false, refused: false };
}

export function initialState() {
  const agents = {};
  for (const def of CREW) agents[def.id] = freshAgent(def);
  return {
    phase: 'LOBBY', round: 1, agents, winner: null,
    pot: 0, odds: {}, totals: {}, counts: {}, players: 0, bettingOpen: false, payouts: null,
  };
}

function resetRound(state) {
  for (const def of CREW) state.agents[def.id] = freshAgent(def);
  state.winner = null;
  state.pot = 0;
  state.odds = {};
  state.totals = {};
  state.counts = {};
  state.bettingOpen = false;
  state.payouts = null;
}

/**
 * Fold one event (or the initial `hello` frame) into the state. Mutates and
 * returns `state` — fine for a single-screen dashboard; tested via sequences.
 */
export function reduce(state, event) {
  if (!event || typeof event !== 'object') return state;

  // the WebSocket seed frame: current phase + a backlog of real events
  if (event.type === 'hello') {
    if (event.phase) state.phase = event.phase;
    if (event.round) state.round = event.round;
    for (const e of event.recent ?? []) reduce(state, e);
    return state;
  }

  const a = event.agent ? state.agents[event.agent] : null;

  switch (event.type) {
    case 'phase_change': {
      const to = event.payload?.to;
      if (to === 'LOBBY') resetRound(state);
      state.phase = to ?? state.phase;
      state.bettingOpen = to === 'BETTING_OPEN';
      if (event.round) state.round = event.round;
      if (event.payload?.pot != null) state.pot = event.payload.pot;
      if (to === 'SETTLED' && event.payload?.winner) state.winner = event.payload.winner;
      break;
    }
    case 'exploring': if (a) a.stage = Math.max(a.stage, 1); break;
    case 'found_dir': if (a) a.stage = Math.max(a.stage, 2); break;
    case 'opened_file': if (a) a.stage = Math.max(a.stage, 3); break;
    case 'submitted':
      if (a) { a.stage = Math.max(a.stage, 4); a.finding = event.payload?.finding ?? a.finding; }
      break;
    case 'reasoning_token':
      if (a && event.payload?.text) {
        a.reasoning.push(event.payload.text);
        if (a.reasoning.length > 60) a.reasoning.shift();
      }
      break;
    case 'won':
      if (a) a.won = true;
      state.winner = event.agent ?? state.winner;
      break;
    case 'refused': if (a) a.refused = true; break;
    // --- betting (Milestone 5) ---
    case 'player_joined':
      state.players = event.payload?.players ?? state.players + 1;
      break;
    case 'odds_update':
      if (event.payload?.pot != null) state.pot = event.payload.pot;
      if (event.payload?.odds) state.odds = event.payload.odds;
      if (event.payload?.totals) state.totals = event.payload.totals;
      if (event.payload?.counts) state.counts = event.payload.counts;
      if (event.payload?.open != null) state.bettingOpen = event.payload.open;
      break;
    case 'bet_placed':
      break; // odds_update follows with authoritative totals
    case 'settled':
      state.payouts = event.payload?.payouts ?? state.payouts;
      if (event.payload?.pot != null) state.pot = event.payload.pot;
      if (event.payload?.winner) state.winner = event.payload.winner;
      break;
    default:
      break;
  }
  return state;
}
