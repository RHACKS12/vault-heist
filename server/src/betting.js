// Pari-mutuel betting — the pre-race lobby.
//
// Flow (per the design): players join, each places ONE bet on a crew member,
// the host locks betting, then the race runs. Odds are pari-mutuel: the whole
// pot is split among the winners in proportion to their stake.
//
//   odds(agent) = pot / amountOn(agent)
//   payout(player) = player.bet / amountOn(winner) * pot
//
// Play-chips only — no real money, no live bookmaking. If nobody backed the
// winner (or no agent cracked it), every bet is refunded.
import { randomUUID } from 'node:crypto';
import { SOURCES, EVENT_TYPES, createEvent } from './events.js';

export class BettingError extends Error {
  constructor(message) { super(message); this.name = 'BettingError'; this.code = 'BETTING'; }
}

export class Betting {
  constructor({ bus, agents, startingChips = 500 }) {
    if (!bus) throw new Error('Betting requires a bus');
    if (!agents?.length) throw new Error('Betting requires the agent list');
    this.bus = bus;
    this.agents = agents;
    this.startingChips = startingChips;
    /** @type {Map<string,{id:string,name:string,balance:number}>} */
    this.players = new Map();
    /** @type {Map<string,{playerId:string,agent:string,amount:number}>} one bet per player */
    this.bets = new Map();
    this.open = false;
    this.round = 1;
  }

  /** New player joins the lobby (persists across rounds, keeps their balance). */
  join(name) {
    const id = randomUUID();
    const clean = String(name ?? 'anon').trim().slice(0, 24) || 'anon';
    this.players.set(id, { id, name: clean, balance: this.startingChips });
    this._emit(EVENT_TYPES.PLAYER_JOINED, { playerId: id, name: clean, players: this.players.size });
    return { playerId: id, name: clean, balance: this.startingChips };
  }

  openRound() { this.open = true; this._emitOdds(); }
  lock() { this.open = false; this._emitOdds(); }

  /** Clear bets for a new round; players and balances carry over. */
  reset(round) {
    this.bets.clear();
    this.open = false;
    if (round != null) this.round = round;
  }

  /** Place one bet. Validates phase, player, agent, amount, balance, single-bet. */
  placeBet(playerId, agent, amount) {
    if (!this.open) throw new BettingError('betting is closed');
    const p = this.players.get(playerId);
    if (!p) throw new BettingError('unknown player — join first');
    if (!this.agents.includes(agent)) throw new BettingError(`unknown agent "${agent}"`);
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) throw new BettingError('amount must be a positive number');
    if (this.bets.has(playerId)) throw new BettingError('you already placed your bet this round');
    if (amt > p.balance) throw new BettingError(`insufficient chips (balance ${p.balance})`);

    p.balance -= amt;
    this.bets.set(playerId, { playerId, agent, amount: amt });
    this._emit(EVENT_TYPES.BET_PLACED, { playerId, agent, amount: amt });
    this._emitOdds();
    return { ok: true, balance: p.balance, bet: { agent, amount: amt }, pot: this.pot(), odds: this.odds() };
  }

  // --- derived numbers ----------------------------------------------------

  totals() {
    const t = Object.fromEntries(this.agents.map((a) => [a, 0]));
    for (const b of this.bets.values()) t[b.agent] += b.amount;
    return t;
  }

  counts() {
    const c = Object.fromEntries(this.agents.map((a) => [a, 0]));
    for (const b of this.bets.values()) c[b.agent] += 1;
    return c;
  }

  pot() {
    let s = 0;
    for (const b of this.bets.values()) s += b.amount;
    return s;
  }

  /** Decimal odds per agent (pot/stake), or null when nothing is on an agent. */
  odds() {
    const pot = this.pot();
    const totals = this.totals();
    const o = {};
    for (const a of this.agents) o[a] = totals[a] > 0 ? Number((pot / totals[a]).toFixed(2)) : null;
    return o;
  }

  snapshot() {
    return { open: this.open, pot: this.pot(), odds: this.odds(), totals: this.totals(), counts: this.counts(), players: this.players.size };
  }

  /** Pay out the pot to backers of `winner`; refund all if none/no winner. */
  settle(winner) {
    const pot = this.pot();
    const totalOnWinner = this.totals()[winner] ?? 0;
    const refunded = !winner || totalOnWinner === 0;
    const payouts = [];

    for (const b of this.bets.values()) {
      const p = this.players.get(b.playerId);
      let payout = 0;
      if (refunded) payout = b.amount;                                   // give the stake back
      else if (b.agent === winner) payout = Math.floor((b.amount / totalOnWinner) * pot);
      if (p) p.balance += payout;
      payouts.push({ playerId: b.playerId, name: p?.name, agent: b.agent, bet: b.amount, payout, won: !refunded && b.agent === winner });
    }

    this._emit(EVENT_TYPES.SETTLED, { winner: winner ?? null, pot, totalOnWinner, refunded, payouts });
    return { winner: winner ?? null, pot, refunded, payouts };
  }

  // --- events -------------------------------------------------------------

  _emitOdds() {
    this._emit(EVENT_TYPES.ODDS_UPDATE, this.snapshot());
  }

  _emit(type, payload) {
    this.bus.publish(createEvent({ round: this.round, source: SOURCES.BETTING, type, payload }));
  }
}
