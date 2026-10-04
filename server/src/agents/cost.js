// CostTracker: one shared accumulator per race that turns per-step token usage
// into dollars (via pricing.js) and enforces a hard spend ceiling across ALL
// agents in the race.
//
// Enforcement is cooperative: the runners check `exceeded()` at every step/tool
// boundary (via the race's shouldStop), so once the running total crosses the
// cap every agent stops at its next boundary. A step already in flight when the
// cap trips still completes — so the real total can overshoot by at most one
// step per agent. With cent-scale steps and a dollar-scale cap that is
// negligible; size the cap with that headroom in mind.
import { costOf } from './pricing.js';

export const DEFAULT_COST_CAP_USD = 2;

export class CostTracker {
  /** @param {{capUsd?:number}} [opts] cap in USD; <=0 or non-finite means "no cap". */
  constructor({ capUsd = DEFAULT_COST_CAP_USD } = {}) {
    this.capUsd = Number.isFinite(capUsd) && capUsd > 0 ? capUsd : Infinity;
    this.totalUsd = 0;
    this.byAgent = new Map(); // agent -> { usd, inputTokens, outputTokens }
    this._cappedFired = false;
  }

  /**
   * Record one step's usage. Returns the step cost and the new running total.
   * @param {{agent:string, model:string, usage?:{inputTokens?:number, outputTokens?:number}}} spec
   */
  add({ agent, model, usage }) {
    const usd = costOf(model, usage);
    this.totalUsd += usd;
    const row = this.byAgent.get(agent) ?? { usd: 0, inputTokens: 0, outputTokens: 0 };
    row.usd += usd;
    row.inputTokens += Number(usage?.inputTokens) || 0;
    row.outputTokens += Number(usage?.outputTokens) || 0;
    this.byAgent.set(agent, row);
    return { usd, totalUsd: this.totalUsd };
  }

  /** True once the running total has reached or passed the cap. */
  exceeded() {
    return this.totalUsd >= this.capUsd;
  }

  /** Fires true exactly once, the first time the cap is crossed (for a one-shot event). */
  markCappedOnce() {
    if (this.exceeded() && !this._cappedFired) {
      this._cappedFired = true;
      return true;
    }
    return false;
  }

  /** A JSON-able snapshot for events and race results. */
  snapshot() {
    return {
      totalUsd: round4(this.totalUsd),
      capUsd: this.capUsd === Infinity ? null : this.capUsd,
      capped: this.exceeded(),
      byAgent: Object.fromEntries(
        [...this.byAgent].map(([a, r]) => [a, { usd: round4(r.usd), inputTokens: r.inputTokens, outputTokens: r.outputTokens }]),
      ),
    };
  }
}

function round4(n) { return Math.round(n * 1e4) / 1e4; }
