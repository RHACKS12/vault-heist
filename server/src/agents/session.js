// AgentSession: one per crew member per round.
//
// It wraps the ONE shared, read-only Sandbox (the firmware is never mutated, so
// no per-agent copy is needed). The session is where per-agent behavior lives:
//   - attribution: every tool call and milestone is tagged with this agent
//   - milestones:  touching the target dir/file fires found_dir / opened_file
//   - budget:      a per-agent step cap so no one agent can run away
import path from 'node:path';
import { SOURCES, EVENT_TYPES, createEvent } from '../events.js';

export class BudgetError extends Error {
  constructor(message) { super(message); this.name = 'BudgetError'; this.code = 'BUDGET'; }
}

// Monotonic milestone stages. Higher = further along; never goes backwards.
const STAGE = Object.freeze({ NONE: 0, EXPLORING: 1, FOUND_DIR: 2, OPENED_FILE: 3 });

export class AgentSession {
  /**
   * @param {{agent:string, round?:number, bus:import('../bus.js').EventBus,
   *          sandbox:import('../sandbox.js').Sandbox, target?:{file?:string,dir?:string},
   *          budget?:{steps:number, bytes:number}}} opts
   */
  constructor({ agent, round = 1, bus, sandbox, target = {}, budget = { steps: 40, bytes: 4_000_000 } }) {
    if (!bus) throw new Error('AgentSession requires a bus');
    if (!sandbox) throw new Error('AgentSession requires a sandbox');
    this.agent = agent;
    this.round = round;
    this.bus = bus;
    this.sandbox = sandbox;
    this.target = target;
    this.budget = budget;
    this.steps = 0;
    this.bytesRead = 0;
    this.stage = STAGE.NONE;
  }

  /**
   * Run one of the four sandbox tools, enforcing the budget and emitting
   * milestones. Returns the tool result (plain JSON-able data for the LLM).
   */
  async runTool(name, args = {}) {
    if (this.steps >= this.budget.steps) {
      throw new BudgetError(`step budget (${this.budget.steps}) exhausted`);
    }
    this.steps++;
    this._emitExploringOnce();

    let result;
    const touched = [];
    switch (name) {
      case 'list_dir': {
        result = await this.sandbox.listDir(args.path ?? '/');
        touched.push(result.path);
        break;
      }
      case 'read_file': {
        result = await this.sandbox.readFile(args.path, { maxBytes: args.maxBytes });
        this.bytesRead += result.size ?? 0;
        touched.push(result.path);
        break;
      }
      case 'grep': {
        result = await this.sandbox.grep(args.pattern, { path: args.path, ignoreCase: args.ignoreCase });
        touched.push(this._norm(args.path ?? '/'));
        for (const h of result.hits) touched.push(h.file);
        break;
      }
      case 'strings': {
        result = await this.sandbox.strings(args.path, { min: args.min });
        touched.push(result.path);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    this._observe(touched);
    return result;
  }

  // --- milestones ---------------------------------------------------------

  _norm(p) {
    return path.posix.normalize('/' + String(p ?? '/').replace(/^\/+/, ''));
  }

  _observe(paths) {
    for (const p of paths) {
      if (this.target.file && p === this.target.file) {
        this._advance(STAGE.OPENED_FILE, EVENT_TYPES.OPENED_FILE, { file: this.target.file });
      } else if (this.target.dir && (p === this.target.dir || p.startsWith(this.target.dir + '/'))) {
        this._advance(STAGE.FOUND_DIR, EVENT_TYPES.FOUND_DIR, { dir: this.target.dir });
      }
    }
  }

  _advance(stage, type, payload) {
    if (this.stage >= stage) return;
    this.stage = stage;
    this._emit(type, payload);
  }

  _emitExploringOnce() {
    if (this.stage < STAGE.EXPLORING) {
      this.stage = STAGE.EXPLORING;
      this._emit(EVENT_TYPES.EXPLORING, {});
    }
  }

  _emit(type, payload = {}) {
    this.bus.publish(createEvent({
      round: this.round, source: SOURCES.AGENT, agent: this.agent, type, payload,
    }));
  }
}
