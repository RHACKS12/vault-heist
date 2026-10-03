// Race: run the crew concurrently over one round, first correct submission wins.
//
// Each agent gets its own AgentSession (wrapping the shared sandbox) and an
// AgentRunner. The Race owns the global "who won" decision: the first correct
// submission sets the winner, publishes a `won` event, and settles the game.
// Later submissions (correct or not) no longer win. Refusals and budget
// exhaustion are ordinary non-winning outcomes, not crashes.
import { SOURCES, EVENT_TYPES, createEvent } from '../events.js';
import { AgentSession } from './session.js';
import { AgentRunner } from './runner.js';
import { makeJudge } from './judge.js';
import { systemPrompt, taskPrompt } from './prompts.js';
import { roundTarget } from './answer.js';

export class Race {
  /**
   * @param {{bus, game?, sandbox, round, agents:{agent:string, provider:object, strategy?:string}[],
   *          budget?:object, maxSteps?:number}} opts
   *   `round` is a resolved round object (from getRound) including its accept criteria.
   */
  constructor({ bus, game, sandbox, round, agents, budget, maxSteps = 24 }) {
    if (!bus) throw new Error('Race requires a bus');
    if (!sandbox) throw new Error('Race requires a sandbox');
    if (!round) throw new Error('Race requires a round');
    this.bus = bus;
    this.game = game;
    this.sandbox = sandbox;
    this.round = round;
    this.agents = agents ?? [];
    this.budget = budget;
    this.maxSteps = maxSteps;
    this.winner = null;
    this._judge = makeJudge(round);
  }

  /** Called by a runner when its agent submits. Decides the global win. */
  _onSubmit(agent) {
    return async (submission) => {
      const verdict = this._judge(submission);
      if (verdict.correct && !this.winner) {
        this.winner = agent;
        this.bus.publish(createEvent({
          round: this.game?.round ?? 1,
          source: SOURCES.AGENT,
          agent,
          type: EVENT_TYPES.WON,
          payload: { matchedOn: verdict.matchedOn, finding: submission },
        }));
        if (this.game?.phase === 'RACING') this.game.settle({ winner: agent, matchedOn: verdict.matchedOn });
        return { correct: true, matchedOn: verdict.matchedOn, won: true };
      }
      return { correct: verdict.correct, matchedOn: verdict.matchedOn, won: false };
    };
  }

  /** Run all agents concurrently. Resolves when every runner has finished. */
  async run() {
    const target = roundTarget(this.round);
    const shouldStop = () => this.winner !== null;
    const roundNo = this.game?.round ?? 1;

    const runs = this.agents.map((a) => {
      const session = new AgentSession({
        agent: a.agent, round: roundNo, bus: this.bus, sandbox: this.sandbox, target, budget: this.budget,
      });
      const runner = new AgentRunner({
        agent: a.agent,
        round: roundNo,
        bus: this.bus,
        provider: a.provider,
        session,
        onSubmit: this._onSubmit(a.agent),
        shouldStop,
        system: systemPrompt(),
        task: taskPrompt({ strategy: a.strategy }),
        maxSteps: this.maxSteps,
      });
      return runner.run().then((r) => ({ agent: a.agent, ...r }));
    });

    const results = await Promise.all(runs);

    // no winner this round: settle with winner=null
    if (!this.winner && this.game?.phase === 'RACING') {
      this.game.settle({ winner: null });
    }
    return { winner: this.winner, results };
  }
}
